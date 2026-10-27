import { useState } from 'react'
import type { HealthcareDocument } from '../../types/document.ts'
import type {
  FindingEvidence,
  FindingSeverity,
  FindingStatus,
  ReviewFinding,
  ReviewState,
  ReviewStatus,
} from '../../types/review.ts'
import type { ComparisonPhase } from './workspace.ts'
import { isSameEvidence } from './section-target.ts'

const reviewStatusOptions = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
] as const satisfies readonly { value: ReviewStatus; label: string }[]

const findingStatusOptions = [
  { value: 'open', label: 'Open' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'follow-up-required', label: 'Follow-up required' },
] as const satisfies readonly { value: FindingStatus; label: string }[]

const severityLabel: Record<FindingSeverity, string> = {
  high: 'High',
  'review-required': 'Review required',
  informational: 'Informational',
}

const categoryLabel = {
  medication: 'Medication',
  'patient-identity': 'Patient identity',
  completeness: 'Completeness',
  documentation: 'Documentation',
} as const

interface ReviewPanelProps {
  phase: ComparisonPhase
  review: ReviewState | null
  compareError: string | null
  documents: readonly HealthcareDocument[]
  activeEvidence: FindingEvidence | null
  onReviewStatusChange: (status: ReviewStatus) => void
  onFindingStatusChange: (findingId: string, status: FindingStatus) => void
  onEvidenceSelect: (evidence: FindingEvidence) => void
}

export function ReviewPanel({
  phase,
  review,
  compareError,
  documents,
  activeEvidence,
  onReviewStatusChange,
  onFindingStatusChange,
  onEvidenceSelect,
}: ReviewPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const findings = phase === 'ready' && review ? review.findings : []

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
          <ol className="review-findings">
            {findings.map((finding) => {
              const expanded = expandedId === finding.id
              const statusLabel =
                findingStatusOptions.find((option) => option.value === finding.status)?.label ??
                finding.status

              return (
                <li key={finding.id} id={`finding-${finding.id}`}>
                  <article className={`review-finding review-finding--${finding.severity}`}>
                    <h3 className="review-finding__title" id={`finding-title-${finding.id}`}>
                      {finding.title}
                    </h3>
                    <div className="review-finding__meta">
                      <span className="review-finding__category">{categoryLabel[finding.category]}</span>
                      <span className={`review-finding__severity review-finding__severity--${finding.severity}`}>
                        {severityLabel[finding.severity]}
                      </span>
                      <span className={`status-pill status-pill--${finding.status}`}>{statusLabel}</span>
                    </div>
                    <label className="review-finding__status-label" htmlFor={`finding-status-${finding.id}`}>
                      Status for {finding.title}
                    </label>
                    <select
                      className={`review-panel__select review-finding__status review-finding__status--${finding.status}`}
                      id={`finding-status-${finding.id}`}
                      value={finding.status}
                      onChange={(event) => {
                        const next = findingStatusOptions.find(
                          (option) => option.value === event.target.value,
                        )
                        if (next) {
                          onFindingStatusChange(finding.id, next.value)
                        }
                      }}
                    >
                      {findingStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p>{finding.description}</p>
                    <p className="review-finding__rationale">{finding.rationale}</p>
                    <button
                      type="button"
                      className="button-secondary"
                      aria-expanded={expanded}
                      aria-controls={`evidence-${finding.id}`}
                      onClick={() => setExpandedId(expanded ? null : finding.id)}
                    >
                      {expanded ? 'Hide evidence' : 'Show evidence'} for {finding.title}
                    </button>
                    {expanded ? (
                      <div className="review-evidence" id={`evidence-${finding.id}`}>
                        {finding.evidence.map((evidence) => {
                          const source = documents.find((item) => item.id === evidence.documentId)
                          const sectionTitle = sectionTitleFor(source, evidence.sectionId)
                          const selected = isSameEvidence(activeEvidence, evidence)

                          return (
                            <button
                              key={`${evidence.documentId}-${evidence.sectionId}-${evidence.excerpt}`}
                              type="button"
                              className="review-evidence__button"
                              aria-pressed={selected}
                              onClick={() => onEvidenceSelect(evidence)}
                            >
                              <span className="review-evidence__source">
                                {source?.title ?? evidence.documentId} · {sectionTitle}
                              </span>
                              <span className="review-evidence__excerpt">{evidence.excerpt}</span>
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </article>
                </li>
              )
            })}
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

function sectionTitleFor(source: HealthcareDocument | undefined, sectionId: string): string {
  if (sectionId === 'patient' && !source?.sections.some((section) => section.id === 'patient')) {
    return 'Patient identity'
  }

  return source?.sections.find((section) => section.id === sectionId)?.title ?? sectionId
}
