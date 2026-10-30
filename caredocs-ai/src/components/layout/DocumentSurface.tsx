import { useEffect, type ReactNode } from 'react'
import {
  pageTargetForEvidence,
  type VerificationSource,
} from '../../features/document-review/findings/present-finding.ts'
import type { HealthcareDocument, MedicationEntry } from '../../types/document.ts'
import type { FindingEvidence, ReviewState } from '../../types/review.ts'
import { extractionPageElementId, isSameEvidence, sectionElementId } from './section-target.ts'

const documentTypeLabel = {
  'discharge-letter': 'Discharge letter',
  'medication-plan': 'Medication plan',
} as const

interface DocumentSurfaceProps {
  documents: readonly HealthcareDocument[]
  activeEvidence: FindingEvidence | null
  review: ReviewState | null
  sources: readonly VerificationSource[]
}

export function DocumentSurface({ documents, activeEvidence, review, sources }: DocumentSurfaceProps) {
  const finding =
    activeEvidence === null
      ? null
      : (review?.findings.find((item) =>
          item.evidence.some((evidence) => isSameEvidence(activeEvidence, evidence)),
        ) ?? null)
  const page =
    activeEvidence === null ? null : pageTargetForEvidence(activeEvidence, finding, documents, sources)
  const pageElementId = page
    ? extractionPageElementId(page.documentType, page.fileName, page.pageNumber)
    : null
  const sectionId =
    activeEvidence === null ? null : sectionElementId(activeEvidence.documentId, activeEvidence.sectionId)

  useEffect(() => {
    const pageElement = pageElementId === null ? null : document.getElementById(pageElementId)

    if (pageElement instanceof HTMLElement) {
      pageElement.scrollIntoView({ block: 'nearest' })
      pageElement.focus({ preventScroll: true })
      return
    }

    const target = sectionId === null ? null : document.getElementById(sectionId)

    if (!(target instanceof HTMLElement)) {
      return
    }

    target.scrollIntoView({ block: 'nearest' })
    target.focus({ preventScroll: true })
  }, [pageElementId, sectionId])

  if (documents.length === 0) {
    return null
  }

  return (
    <section className="document-surface" id="document-surface" aria-labelledby="source-documents-title">
      <header className="document-surface__header">
        <h2 className="document-surface__heading" id="source-documents-title">
          Source documents
        </h2>
        <p className="document-surface__lead">
          Excerpts in the findings can be checked against these sections.
        </p>
      </header>
      <p className="document-surface__notice">{documents[0]?.demoNotice}</p>
      {documents.map((item) => (
        <article className="document-record" key={item.id} aria-labelledby={`${item.id}-title`}>
          <header className="document-record__header">
            <p className="document-record__kicker">{documentTypeLabel[item.type]}</p>
            <h3 className="document-record__title" id={`${item.id}-title`}>
              {item.title}
            </h3>
            <p className="document-record__meta">
              {item.filename}
              {item.createdAt.trim().length > 0 ? ` · ${item.createdAt}` : ''}
            </p>
          </header>
          {item.sections.some((section) => section.id === 'patient') ? null : (
            <PatientBlock document={item} activeEvidence={activeEvidence} />
          )}
          {item.sections.map((section) => (
            <SectionBlock
              key={section.id}
              document={item}
              sectionId={section.id}
              title={section.title}
              activeEvidence={activeEvidence}
            >
              {section.id === 'patient' ? (
                <PatientFacts document={item} activeEvidence={activeEvidence} />
              ) : null}
              <p>{markedText(section.content, excerptFor(item, section.id, activeEvidence))}</p>
              {section.id === 'medication' ? (
                <MedicationList document={item} activeEvidence={activeEvidence} />
              ) : null}
            </SectionBlock>
          ))}
          {item.medications.length > 0 &&
          !item.sections.some((section) => section.id === 'medication') ? (
            <SectionBlock
              document={item}
              sectionId="medication"
              title="Medication"
              activeEvidence={activeEvidence}
            >
              <MedicationList document={item} activeEvidence={activeEvidence} />
            </SectionBlock>
          ) : null}
        </article>
      ))}
    </section>
  )
}

function PatientBlock({
  document: source,
  activeEvidence,
}: {
  document: HealthcareDocument
  activeEvidence: FindingEvidence | null
}) {
  return (
    <SectionBlock
      document={source}
      sectionId="patient"
      title="Patient identity"
      activeEvidence={activeEvidence}
    >
      <PatientFacts document={source} activeEvidence={activeEvidence} />
    </SectionBlock>
  )
}

function PatientFacts({
  document: source,
  activeEvidence,
}: {
  document: HealthcareDocument
  activeEvidence: FindingEvidence | null
}) {
  const excerpt = excerptFor(source, 'patient', activeEvidence)

  return (
    <dl className="document-facts">
      <div>
        <dt>Patient ID</dt>
        <dd>
          {source.patient.patientId.trim().length > 0
            ? markedText(source.patient.patientId, excerpt)
            : 'Not in the document'}
        </dd>
      </div>
      <div>
        <dt>Name</dt>
        <dd>{markedText(source.patient.name, excerpt)}</dd>
      </div>
      <div>
        <dt>Date of birth</dt>
        <dd>{markedText(source.patient.dateOfBirth, excerpt)}</dd>
      </div>
    </dl>
  )
}

function SectionBlock({
  document: source,
  sectionId,
  title,
  activeEvidence,
  children,
}: {
  document: HealthcareDocument
  sectionId: string
  title: string
  activeEvidence: FindingEvidence | null
  children: ReactNode
}) {
  const active =
    activeEvidence?.documentId === source.id && activeEvidence.sectionId === sectionId

  return (
    <section
      className={active ? 'document-block document-block--active' : 'document-block'}
      id={sectionElementId(source.id, sectionId)}
      tabIndex={-1}
      aria-current={active ? 'true' : undefined}
    >
      <h4>{title}</h4>
      {children}
    </section>
  )
}

function MedicationList({
  document: source,
  activeEvidence,
}: {
  document: HealthcareDocument
  activeEvidence: FindingEvidence | null
}) {
  if (source.medications.length === 0) {
    return null
  }

  const excerpt =
    activeEvidence?.documentId === source.id && activeEvidence.sectionId === 'medication'
      ? activeEvidence.excerpt
      : null

  return (
    <ul className="document-meds">
      {source.medications.map((entry, index) => (
        <li
          key={`${entry.name}-${entry.strength}-${index}`}
          className={
            lineMatches(excerpt, entry)
              ? 'document-meds__item document-meds__item--active'
              : 'document-meds__item'
          }
        >
          <span className="document-meds__name">{entry.name}</span>
          <span>
            {entry.strength}
            {entry.dosage.trim().length > 0 ? ` · ${entry.dosage}` : ''}
            {entry.instructions ? ` · ${entry.instructions}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

function excerptFor(
  source: HealthcareDocument,
  sectionId: string,
  activeEvidence: FindingEvidence | null,
): string | null {
  if (activeEvidence?.documentId !== source.id || activeEvidence.sectionId !== sectionId) {
    return null
  }

  return activeEvidence.excerpt
}

function markedText(text: string, excerpt: string | null) {
  if (!excerpt) {
    return text
  }

  const index = text.indexOf(excerpt)
  if (index < 0) {
    return text
  }

  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + excerpt.length)}</mark>
      {text.slice(index + excerpt.length)}
    </>
  )
}

function lineMatches(excerpt: string | null, entry: MedicationEntry): boolean {
  if (!excerpt || !excerpt.includes(entry.name)) {
    return false
  }

  return (
    excerpt.includes(entry.strength) ||
    excerpt.includes(entry.dosage) ||
    (entry.instructions !== undefined && excerpt.includes(entry.instructions))
  )
}
