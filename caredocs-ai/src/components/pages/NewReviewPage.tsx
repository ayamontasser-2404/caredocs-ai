import { useMemo } from 'react'
import type { ComparisonBlockReason } from '../../features/document-review/comparison/prepare-comparison-input.ts'
import type { VerificationSource } from '../../features/document-review/findings/present-finding.ts'
import type { DocumentType, HealthcareDocument } from '../../types/document.ts'
import type { FindingEvidence, FindingStatus, ReviewState, ReviewStatus } from '../../types/review.ts'
import { DocumentSurface } from '../layout/DocumentSurface.tsx'
import { DocumentUploads } from '../layout/DocumentUploads.tsx'
import { ReviewPanel } from '../layout/ReviewPanel.tsx'
import type { ComparisonPhase, DocumentSlot } from '../layout/workspace.ts'

interface NewReviewPageProps {
  letter: DocumentSlot
  plan: DocumentSlot
  phase: ComparisonPhase
  review: ReviewState | null
  compareError: string | null
  blockReasons: readonly ComparisonBlockReason[]
  documents: readonly HealthcareDocument[]
  activeEvidence: FindingEvidence | null
  canCompare: boolean
  onUpload: (type: DocumentType, file: File) => void
  onRemove: (type: DocumentType) => void
  onUseSample: (type: DocumentType) => void
  onEditField: (type: DocumentType, path: string, value: string) => void
  onConfirmField: (type: DocumentType, path: string) => void
  onCompare: () => void
  onReviewStatusChange: (status: ReviewStatus) => void
  onFindingStatusChange: (findingId: string, status: FindingStatus) => void
  onEvidenceSelect: (evidence: FindingEvidence) => void
}

export function NewReviewPage({
  letter,
  plan,
  phase,
  review,
  compareError,
  blockReasons,
  documents,
  activeEvidence,
  canCompare,
  onUpload,
  onRemove,
  onUseSample,
  onEditField,
  onConfirmField,
  onCompare,
  onReviewStatusChange,
  onFindingStatusChange,
  onEvidenceSelect,
}: NewReviewPageProps) {
  const sources = useMemo<readonly VerificationSource[]>(
    () => [
      { type: 'discharge-letter', verification: letter.extraction.verification },
      { type: 'medication-plan', verification: plan.extraction.verification },
    ],
    [letter.extraction.verification, plan.extraction.verification],
  )

  return (
    <div className="new-review">
      <section className="new-review__upload" aria-labelledby="new-review-title">
        <header className="new-review__header">
          <h1 id="new-review-title">Start New Review</h1>
          <p>Upload your documents to compare their information and identify potential discrepancies.</p>
          <p className="new-review__limit">
            A PDF shows text from its pages. Pages without embedded text are recognized in the browser. Labeled
            fields can be corrected and confirmed in this session. Confirmation is not an electronic signature.
            Compare Documents uses confirmed PDF fields, or a JSON template, when both documents are ready. Word
            files are not read, and a file that fails validation is not compared.
          </p>
        </header>
        <DocumentUploads
          letter={letter}
          plan={plan}
          onUpload={onUpload}
          onRemove={onRemove}
          onUseSample={onUseSample}
          onEditField={onEditField}
          onConfirmField={onConfirmField}
        />
        <div className="compare-action">
          <button type="button" className="button-primary" disabled={!canCompare} onClick={onCompare}>
            {phase === 'comparing' ? 'Comparing documents…' : 'Compare Documents'}
          </button>
          {letter.extraction.status === 'extracting' || plan.extraction.status === 'extracting' ? (
            <p role="status">A document is still being read.</p>
          ) : null}
        </div>
      </section>
      <ReviewPanel
        phase={phase}
        review={review}
        compareError={compareError}
        blockReasons={blockReasons}
        documents={documents}
        sources={sources}
        activeEvidence={activeEvidence}
        onReviewStatusChange={onReviewStatusChange}
        onFindingStatusChange={onFindingStatusChange}
        onEvidenceSelect={onEvidenceSelect}
      />
      <DocumentSurface
        documents={documents}
        activeEvidence={activeEvidence}
        review={review}
        sources={sources}
      />
    </div>
  )
}
