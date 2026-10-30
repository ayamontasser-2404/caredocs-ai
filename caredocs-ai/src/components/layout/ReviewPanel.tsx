import { useState } from 'react'
import type { ComparisonBlockReason } from '../../features/document-review/comparison/prepare-comparison-input.ts'
import {
  countFindings,
  findingMatchesFilter,
  presentFinding,
  type FindingFilter,
  type VerificationSource,
} from '../../features/document-review/findings/present-finding.ts'
import type { HealthcareDocument } from '../../types/document.ts'
import type { FindingEvidence, FindingStatus, ReviewFinding, ReviewState, ReviewStatus } from '../../types/review.ts'
import { FindingCard } from './FindingCard.tsx'
import type { ComparisonPhase } from './workspace.ts'

const reviewStatusOptions = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
] as const satisfies readonly { value: ReviewStatus; label: string }[]

const filters = [
  { id: 'all', label: 'All' },
  { id: 'needs-review', label: 'Needs review' },
  { id: 'mismatch', label: 'Mismatches' },
  { id: 'missing', label: 'Missing information' },
  { id: 'reviewed', label: 'Reviewed' },
] as const satisfies readonly { id: FindingFilter; label: string }[]

interface ReviewPanelProps {
  phase: ComparisonPhase
  review: ReviewState | null
  compareError: string | null
  blockReasons: readonly ComparisonBlockReason[]
  documents: readonly HealthcareDocument[]
  sources: readonly VerificationSource[]
  activeEvidence: FindingEvidence | null
  onReviewStatusChange: (status: ReviewStatus) => void
  onFindingStatusChange: (findingId: string, status: FindingStatus) => void
  onEvidenceSelect: (evidence: FindingEvidence) => void
}

export function ReviewPanel({
  phase,
  review,
  compareError,
  blockReasons,
  documents,
  sources,
  activeEvidence,
  onReviewStatusChange,
  onFindingStatusChange,
  onEvidenceSelect,
}: ReviewPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FindingFilter>('all')
  const [seenPhase, setSeenPhase] = useState(phase)
  if (seenPhase !== phase) {
    setSeenPhase(phase)
    setFilter('all')
    setExpandedId(null)
  }
  const findings = phase === 'ready' && review ? review.findings : []
  const presentations = findings.map((finding) => presentFinding(finding, documents, sources))
  const counts = countFindings(presentations)
  const visible = presentations.filter((item) => findingMatchesFilter(item, filter))

  return (
    <section className="review-panel" aria-labelledby="review-findings-title" aria-busy={phase === 'comparing'}>
      <header className="review-panel__header">
        <h2 className="review-panel__title" id="review-findings-title">
          Review Findings
        </h2>
      </header>
      {phase === 'comparing' ? <p role="status">Comparing documents…</p> : null}
      {phase === 'error' ? (
        <p className="review-panel__note" role="alert">
          {compareError ?? 'The documents could not be compared.'}
        </p>
      ) : null}
      {phase === 'blocked' ? (
        <div className="findings-empty">
          <h3>Comparison was not run</h3>
          <p>The documents are not ready. This is not a result of zero differences.</p>
          <ul className="upload-card__errors">
            {blockReasons.map((reason) => (
              <li key={`${reason.document}-${reason.code}-${reason.message}`}>{reason.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {phase === 'idle' ? (
        <div className="findings-empty">
          <h3>Your findings will appear here</h3>
          <p>
            Upload a discharge letter and a medication plan, then select Compare Documents to
            identify potential discrepancies.
          </p>
        </div>
      ) : null}
      {phase === 'ready' && review ? (
        <>
          <FindingSummary findings={findings} />
          {findings.length === 0 ? (
            <div className="findings-empty">
              <h3>No discrepancies detected by the enabled checks.</h3>
              <p>This does not guarantee that the documents are complete or clinically correct.</p>
            </div>
          ) : null}
          {findings.length > 0 ? (
            <>
              <div className="review-status-row">
                <label htmlFor="review-status">Review status</label>
                <select
                  className="review-panel__select"
                  id="review-status"
                  value={review.status}
                  onChange={(event) => {
                    const next = reviewStatusOptions.find((option) => option.value === event.target.value)
                    if (next) {
                      onReviewStatusChange(next.value)
                    }
                  }}
                >
                  {reviewStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {review.status === 'completed' ? (
                <p className="review-panel__note">
                  This review is completed. Each finding keeps the status selected below.
                </p>
              ) : null}
              <p className="review-panel__note">
                Finding status stays in this browser session. Refreshing the page clears it. Changing a finding
                status does not change extracted values and does not decide which value is correct.
              </p>
              <div className="finding-filters" role="group" aria-label="Filter findings">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="button-secondary"
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label} ({counts[item.id]})
                  </button>
                ))}
              </div>
              {filter !== 'all' ? (
                <p role="status">
                  Showing {visible.length} of {findings.length} findings.
                </p>
              ) : null}
              {visible.length === 0 ? <p>No findings match this filter.</p> : null}
              <ol className="review-findings">
                {visible.map((presentation) => (
                  <li key={presentation.finding.id} id={`finding-${presentation.finding.id}`}>
                    <FindingCard
                      presentation={presentation}
                      documents={documents}
                      expanded={expandedId === presentation.finding.id}
                      activeEvidence={activeEvidence}
                      onToggle={() =>
                        setExpandedId((current) =>
                          current === presentation.finding.id ? null : presentation.finding.id,
                        )
                      }
                      onStatusChange={(status) => onFindingStatusChange(presentation.finding.id, status)}
                      onEvidenceSelect={onEvidenceSelect}
                    />
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

function FindingSummary({ findings }: { findings: readonly ReviewFinding[] }) {
  const openCount = findings.filter((finding) => finding.status === 'open').length
  const highCount = findings.filter((finding) => finding.severity === 'high').length

  return (
    <dl className="finding-summary">
      <div>
        <dt>Total findings</dt>
        <dd>{findings.length}</dd>
      </div>
      <div>
        <dt>Open findings</dt>
        <dd>{openCount}</dd>
      </div>
      <div>
        <dt>High-priority findings</dt>
        <dd>{highCount}</dd>
      </div>
    </dl>
  )
}
