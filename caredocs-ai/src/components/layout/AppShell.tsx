import { useEffect, useRef, useState } from 'react'
import { reviewChecklist } from '../../data/reviewChecklist.ts'
import { sampleDischargeLetter } from '../../data/sampleDischargeLetter.ts'
import { sampleMedicationPlan } from '../../data/sampleMedicationPlan.ts'
import {
  createReviewSession,
  setFindingStatus,
  setReviewStatus,
} from '../../features/document-review/review-session.ts'
import { parseDocumentUpload } from '../../features/document-review/template-validation.ts'
import type { DocumentType } from '../../types/document.ts'
import type { FindingStatus, ReviewStatus } from '../../types/review.ts'
import { HomePage } from '../pages/HomePage.tsx'
import { NewReviewPage } from '../pages/NewReviewPage.tsx'
import { AppHeader } from './AppHeader.tsx'
import { SideNav } from './SideNav.tsx'
import {
  acceptDocument,
  beginCompare,
  canCompare,
  documentsInReview,
  failCompare,
  finishCompare,
  initialWorkspace,
  rejectUpload,
  removeDocument,
  showPage,
  type AppPage,
  type WorkspaceState,
} from './workspace.ts'
import './layout.css'
import '../pages/pages.css'

function isUnsupportedFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.pdf') ||
    name.endsWith('.doc') ||
    name.endsWith('.docx') ||
    file.type === 'application/pdf' ||
    file.type === 'application/msword' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
}

export function AppShell() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(initialWorkspace)
  const compareGeneration = useRef(0)
  const compareTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      compareGeneration.current += 1
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

  function handleUpload(type: DocumentType, file: File) {
    if (isUnsupportedFile(file)) {
      setWorkspace((current) =>
        rejectUpload(current, type, [
          'PDF and Word files are not processed. Upload the structured JSON template.',
        ]),
      )
      return
    }

    void file.text().then(
      (contents) => {
        const result = parseDocumentUpload(contents, type)

        if (!result.ok) {
          setWorkspace((current) => rejectUpload(current, type, result.messages))
          return
        }

        cancelCompare()
        setWorkspace((current) => acceptDocument(current, type, result.document, file.name, false))
      },
      () => {
        setWorkspace((current) => rejectUpload(current, type, ['The file could not be read.']))
      },
    )
  }

  function handleRemove(type: DocumentType) {
    cancelCompare()
    setWorkspace((current) => removeDocument(current, type))
  }

  function handleUseSample(type: DocumentType) {
    cancelCompare()
    const sample = type === 'discharge-letter' ? sampleDischargeLetter : sampleMedicationPlan
    setWorkspace((current) => acceptDocument(current, type, sample, sample.filename, true))
  }

  function handleCompare() {
    cancelCompare()
    const generation = compareGeneration.current

    setWorkspace((current) => beginCompare(current))
    compareTimer.current = window.setTimeout(() => {
      compareTimer.current = null
      if (compareGeneration.current !== generation) {
        return
      }

      setWorkspace((current) => {
        if (compareGeneration.current !== generation || current.phase !== 'comparing') {
          return current
        }

        const letter = current.letter.document
        const plan = current.plan.document
        if (!letter || !plan) {
          return current
        }

        try {
          return finishCompare(current, createReviewSession([letter, plan], reviewChecklist))
        } catch (error) {
          const message = error instanceof Error ? error.message : 'The documents could not be compared.'
          return failCompare(current, message)
        }
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
              documents={documentsInReview(workspace)}
              activeEvidence={workspace.activeEvidence}
              canCompare={canCompare(workspace)}
              onUpload={handleUpload}
              onRemove={handleRemove}
              onUseSample={handleUseSample}
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
