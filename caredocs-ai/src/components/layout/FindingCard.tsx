import { CircleAlert, CircleCheck } from 'lucide-react'
import type { FindingSide, FindingPresentation } from '../../features/document-review/findings/present-finding.ts'
import type { HealthcareDocument } from '../../types/document.ts'
import type { FindingEvidence, FindingSeverity, FindingStatus } from '../../types/review.ts'
import { isSameEvidence } from './section-target.ts'

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

interface FindingCardProps {
  presentation: FindingPresentation
  documents: readonly HealthcareDocument[]
  expanded: boolean
  activeEvidence: FindingEvidence | null
  onToggle: () => void
  onStatusChange: (status: FindingStatus) => void
  onEvidenceSelect: (evidence: FindingEvidence) => void
}

export function FindingCard({
  presentation,
  documents,
  expanded,
  activeEvidence,
  onToggle,
  onStatusChange,
  onEvidenceSelect,
}: FindingCardProps) {
  const finding = presentation.finding
  const needsAttention = finding.status === 'open' || finding.status === 'follow-up-required'
  const StatusIcon = needsAttention ? CircleAlert : CircleCheck

  return (
    <article className={`review-finding review-finding--${finding.severity}`}>
      <h3 className="review-finding__title" id={`finding-title-${finding.id}`}>
        {finding.title}
      </h3>
      <div className="review-finding__meta">
        <span className="review-finding__category">{categoryLabel[finding.category]}</span>
        <span className="review-finding__category">{presentation.kindLabel}</span>
        <span className={`review-finding__severity review-finding__severity--${finding.severity}`}>
          {severityLabel[finding.severity]}
        </span>
        <span className={`status-pill status-pill--${finding.status}`}>{presentation.reviewLabel}</span>
      </div>
      <p>Field: {presentation.fieldLabel}</p>
      <p>{finding.description}</p>
      <div className="finding-sides">
        {presentation.sides.map((side) => (
          <FindingSideBlock key={sideKey(side)} side={side} />
        ))}
      </div>
      <p className="finding-review-status">
        <StatusIcon aria-hidden="true" />
        <span>Finding review: {presentation.reviewLabel}</span>
      </p>
      <p>{presentation.reviewReason}</p>
      <label className="review-finding__status-label" htmlFor={`finding-status-${finding.id}`}>
        Status for {finding.title}
      </label>
      <select
        className={`review-panel__select review-finding__status review-finding__status--${finding.status}`}
        id={`finding-status-${finding.id}`}
        value={finding.status}
        onChange={(event) => {
          const next = findingStatusOptions.find((option) => option.value === event.target.value)
          if (next) {
            onStatusChange(next.value)
          }
        }}
      >
        {findingStatusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="review-finding__rationale">{finding.rationale}</p>
      <button
        type="button"
        className="button-secondary"
        aria-expanded={expanded}
        aria-controls={`evidence-${finding.id}`}
        onClick={onToggle}
      >
        {expanded ? 'Hide evidence' : 'Show evidence'} for {finding.title}
      </button>
      {expanded ? (
        <div className="review-evidence" id={`evidence-${finding.id}`}>
          {finding.evidence.map((evidence) => {
            const source = documents.find((item) => item.id === evidence.documentId)
            const selected = isSameEvidence(activeEvidence, evidence)
            const side = presentation.sides.find(
              (item) => item.evidence !== null && isSameEvidence(item.evidence, evidence),
            )

            return (
              <button
                key={`${evidence.documentId}-${evidence.sectionId}-${evidence.excerpt}`}
                type="button"
                className="review-evidence__button"
                aria-pressed={selected}
                onClick={() => onEvidenceSelect(evidence)}
              >
                <span className="review-evidence__source">
                  {source?.title ?? 'Document unavailable'} · {sectionTitleFor(source, evidence.sectionId)}
                </span>
                <span className="review-evidence__page">{side?.pageLabel ?? 'Page unavailable'}</span>
                <span className="review-evidence__excerpt">{evidence.excerpt}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </article>
  )
}

function FindingSideBlock({ side }: { side: FindingSide }) {
  return (
    <div className="finding-side">
      <p className="finding-side__document">
        {side.documentTitle}
        {side.filename ? <span className="finding-side__file"> {side.filename}</span> : null}
      </p>
      <p>{side.fieldLabel}</p>
      <p>{side.pageLabel}</p>
      {side.availability === 'value' && side.comparedValue !== null ? (
        <p>Compared value: {side.comparedValue}</p>
      ) : null}
      {side.emptyValue ? <p>Compared value: Empty</p> : null}
      {side.note ? <p>{side.note}</p> : null}
      {side.sourceQuotes.length > 0 ? (
        side.sourceQuotes.map((quote) => <blockquote key={quote}>{quote}</blockquote>)
      ) : (
        <p>Supporting text unavailable</p>
      )}
      {side.corrected ? (
        <>
          <p>Original extracted value: {side.originalValue ?? 'None'}</p>
          <p>Reviewed value: {side.reviewedValue ?? 'Empty'}</p>
        </>
      ) : null}
      {side.textSource === 'ocr' ? <p>Read from a scanned page.</p> : null}
      <p>Field verification: {side.verificationLabel}</p>
    </div>
  )
}

function sideKey(side: FindingSide): string {
  const evidence = side.evidence
  return evidence
    ? `${evidence.documentId}-${evidence.sectionId}-${evidence.excerpt}`
    : `${side.documentId ?? 'missing'}-${side.availability}`
}

function sectionTitleFor(source: HealthcareDocument | undefined, sectionId: string): string {
  if (!source) {
    return 'Section unavailable'
  }

  if (sectionId === 'patient' && !source.sections.some((section) => section.id === 'patient')) {
    return 'Patient identity'
  }

  return source.sections.find((section) => section.id === sectionId)?.title ?? 'Section unavailable'
}
