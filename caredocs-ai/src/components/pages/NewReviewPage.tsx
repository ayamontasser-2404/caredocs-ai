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
  return (
    <div className="new-review">
      <section className="new-review__upload" aria-labelledby="new-review-title">
        <header className="new-review__header">
          <h1 id="new-review-title">Start New Review</h1>
          <p>Upload your documents to compare their information and identify potential discrepancies.</p>
          <p className="new-review__limit">
            A PDF shows text from its pages. Pages without embedded text are recognized in the browser. Labeled
            fields can be corrected and confirmed in this session. Confirmation is not an electronic signature, and
            it does not compare the PDF. Comparison still requires the JSON template. Word files are not read, and a
            file that fails validation is not compared.
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
        </div>
      </section>
      <ReviewPanel
        phase={phase}
        review={review}
        compareError={compareError}
        documents={documents}
        activeEvidence={activeEvidence}
        onReviewStatusChange={onReviewStatusChange}
        onFindingStatusChange={onFindingStatusChange}
        onEvidenceSelect={onEvidenceSelect}
      />
      <DocumentSurface documents={documents} activeEvidence={activeEvidence} />
    </div>
  )
}
