import { useEffect, useRef, useState } from 'react'
import { reviewChecklist } from '../../data/reviewChecklist.ts'
import { sampleDischargeLetter } from '../../data/sampleDischargeLetter.ts'
import { sampleMedicationPlan } from '../../data/sampleMedicationPlan.ts'
import { setFindingStatus, setReviewStatus } from '../../features/document-review/review-session.ts'
import {
  extractPdfContent,
  maxPdfProcessingMs,
  pdfReadCancelledMessage,
  pdfReadTimeoutMessage,
} from '../../features/document-review/extraction/extract-pdf-content.ts'
import { PdfTextExtractionError } from '../../features/document-review/extraction/extract-pdf-text.ts'
import { maxJsonFileBytes, parseDocumentUpload } from '../../features/document-review/template-validation.ts'
import type { DocumentType } from '../../types/document.ts'
import type { FindingStatus, ReviewStatus } from '../../types/review.ts'
import { HomePage } from '../pages/HomePage.tsx'
import { NewReviewPage } from '../pages/NewReviewPage.tsx'
import { AppHeader } from './AppHeader.tsx'
import { SideNav } from './SideNav.tsx'
import {
  acceptDocument,
  beginExtraction,
  canCompare,
  cancelExtraction,
  completeCompare,
  confirmReviewedField,
  documentsInReview,
  editReviewedField,
  clearExtractionError,
  failExtraction,
  finishExtraction,
  initialWorkspace,
  rejectUpload,
  removeDocument,
  requestCompare,
  showPage,
  updateExtractionProgress,
  type AppPage,
  type WorkspaceState,
} from './workspace.ts'
import './layout.css'
import '../pages/pages.css'

function isWordFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.doc') ||
    name.endsWith('.docx') ||
    file.type === 'application/msword' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function AppShell() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(initialWorkspace)
  const compareGeneration = useRef(0)
  const compareTimer = useRef<number | null>(null)
  const extractionGeneration = useRef<Record<DocumentType, number>>({
    'discharge-letter': 0,
    'medication-plan': 0,
  })
  const extractionAbort = useRef<Record<DocumentType, AbortController | null>>({
    'discharge-letter': null,
    'medication-plan': null,
  })
  const extractionTimer = useRef<Record<DocumentType, number | null>>({
    'discharge-letter': null,
    'medication-plan': null,
  })

  useEffect(() => {
    const generations = extractionGeneration.current
    const aborts = extractionAbort.current
    const timers = extractionTimer.current
    return () => {
      compareGeneration.current += 1
      for (const type of ['discharge-letter', 'medication-plan'] as const) {
        generations[type] += 1
        aborts[type]?.abort(new PdfTextExtractionError(pdfReadCancelledMessage))
        if (timers[type] !== null) {
          window.clearTimeout(timers[type])
        }
      }
      if (compareTimer.current !== null) {
        window.clearTimeout(compareTimer.current)
      }
    }
  }, [])

  function cancelCompare() {
    compareGeneration.current += 1
    if (compareTimer.current !== null) {
      window.clearTimeout(compareTimer.current)
      compareTimer.current = null
    }
  }

  function handleNavigate(page: AppPage) {
    setWorkspace((current) => showPage(current, page))
  }

  function nextExtractionGeneration(type: DocumentType): { generation: number; signal: AbortSignal } {
    const previousTimer = extractionTimer.current[type]
    if (previousTimer !== null) {
      window.clearTimeout(previousTimer)
      extractionTimer.current[type] = null
    }

    extractionAbort.current[type]?.abort(new PdfTextExtractionError(pdfReadCancelledMessage))
    const controller = new AbortController()
    extractionAbort.current[type] = controller
    extractionGeneration.current[type] += 1
    return { generation: extractionGeneration.current[type], signal: controller.signal }
  }

  function settleExtraction(type: DocumentType, generation: number): boolean {
    const timer = extractionTimer.current[type]
    if (extractionGeneration.current[type] === generation && timer !== null) {
      window.clearTimeout(timer)
      extractionTimer.current[type] = null
    }

    return extractionGeneration.current[type] === generation
  }

  function handleUpload(type: DocumentType, file: File) {
    if (isWordFile(file)) {
      nextExtractionGeneration(type)
      setWorkspace((current) =>
        rejectUpload(cancelExtraction(current, type), type, [
          'Word files are not processed. Upload a PDF to extract text, or the structured JSON template.',
        ]),
      )
      return
    }

    if (isPdfFile(file)) {
      const { generation, signal } = nextExtractionGeneration(type)
      const controller = extractionAbort.current[type]
      extractionTimer.current[type] = window.setTimeout(() => {
        controller?.abort(new PdfTextExtractionError(pdfReadTimeoutMessage))
      }, maxPdfProcessingMs)
      cancelCompare()
      setWorkspace((current) => beginExtraction(current, type, file.name))

      void extractPdfContent(file, {
        signal,
        onProgress(progress) {
          if (extractionGeneration.current[type] !== generation) {
            return
          }

          setWorkspace((current) => updateExtractionProgress(current, type, progress.message))
        },
      }).then(
        (result) => {
          if (!settleExtraction(type, generation)) {
            return
          }

          setWorkspace((current) => finishExtraction(current, type, result))
        },
        (error: unknown) => {
          if (!settleExtraction(type, generation)) {
            return
          }

          const message =
            error instanceof PdfTextExtractionError
              ? error.message
              : 'The PDF text could not be extracted.'
          setWorkspace((current) => failExtraction(current, type, message))
        },
      )
      return
    }

    const { generation } = nextExtractionGeneration(type)
    setWorkspace((current) => cancelExtraction(current, type))

    if (file.size > maxJsonFileBytes) {
      setWorkspace((current) =>
        rejectUpload(clearExtractionError(current, type), type, ['The file is too large to read.']),
      )
      return
    }

    void file.text().then(
      (contents) => {
        if (extractionGeneration.current[type] !== generation) {
          return
        }

        const result = parseDocumentUpload(contents, type)

        if (!result.ok) {
          setWorkspace((current) => rejectUpload(clearExtractionError(current, type), type, result.messages))
          return
        }

        cancelCompare()
        setWorkspace((current) => acceptDocument(current, type, result.document, file.name, false))
      },
      () => {
        if (extractionGeneration.current[type] !== generation) {
          return
        }

        setWorkspace((current) =>
          rejectUpload(clearExtractionError(current, type), type, ['The file could not be read.']),
        )
      },
    )
  }

  function handleRemove(type: DocumentType) {
    nextExtractionGeneration(type)
    cancelCompare()
    setWorkspace((current) => removeDocument(current, type))
  }

  function handleUseSample(type: DocumentType) {
    nextExtractionGeneration(type)
    cancelCompare()
    const sample = type === 'discharge-letter' ? sampleDischargeLetter : sampleMedicationPlan
    setWorkspace((current) => acceptDocument(current, type, sample, sample.filename, true))
  }

  function handleCompare() {
    cancelCompare()
    const generation = compareGeneration.current

    setWorkspace((current) => requestCompare(current))
    compareTimer.current = window.setTimeout(() => {
      compareTimer.current = null
      if (compareGeneration.current !== generation) {
        return
      }

      setWorkspace((current) => {
        if (compareGeneration.current !== generation) {
          return current
        }

        return completeCompare(current, reviewChecklist)
      })
    }, 0)
  }

  function handleReviewStatus(status: ReviewStatus) {
    setWorkspace((current) => {
      if (!current.review) {
        return current
      }

      return { ...current, review: setReviewStatus(current.review, status) }
    })
  }

  function handleFindingStatus(findingId: string, status: FindingStatus) {
    setWorkspace((current) => {
      if (!current.review) {
        return current
      }

      return { ...current, review: setFindingStatus(current.review, findingId, status) }
    })
  }

  return (
    <div className="app-shell">
      <AppHeader />
      <div className="app-shell__workspace">
        <SideNav page={workspace.page} onNavigate={handleNavigate} />
        <main className="app-main">
          {workspace.page === 'home' ? (
            <HomePage onStartReview={() => handleNavigate('new-review')} />
          ) : (
            <NewReviewPage
              letter={workspace.letter}
              plan={workspace.plan}
              phase={workspace.phase}
              review={workspace.review}
              compareError={workspace.compareError}
              blockReasons={workspace.blockReasons}
              documents={documentsInReview(workspace)}
              activeEvidence={workspace.activeEvidence}
              canCompare={canCompare(workspace)}
              onUpload={handleUpload}
              onRemove={handleRemove}
              onUseSample={handleUseSample}
              onEditField={(type, path, value) => {
                setWorkspace((current) => editReviewedField(current, type, path, value))
              }}
              onConfirmField={(type, path) => {
                setWorkspace((current) => confirmReviewedField(current, type, path))
              }}
              onCompare={handleCompare}
              onReviewStatusChange={handleReviewStatus}
              onFindingStatusChange={handleFindingStatus}
              onEvidenceSelect={(evidence) => {
                setWorkspace((current) => ({ ...current, activeEvidence: evidence }))
              }}
            />
          )}
        </main>
      </div>
    </div>
  )
}
