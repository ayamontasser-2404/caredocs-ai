import { comparisonDocumentId } from '../comparison/prepare-comparison-input.ts'
import type { DocumentVerification, ReviewedField } from '../verification/verification-types.ts'
import type { DocumentType, HealthcareDocument } from '../../../types/document.ts'
import type { FindingEvidence, FindingStatus, ReviewFinding } from '../../../types/review.ts'

/**
 * A view of one finding. It does not compare documents and does not decide
 * which value is correct. Page numbers and source quotes come only from a
 * matched reviewed field. JSON findings keep the engine excerpt as the
 * compared value and do not invent a page or a quote.
 */

export type FindingKind = 'mismatch' | 'missing'

export type FindingFilter = 'all' | 'needs-review' | 'mismatch' | 'missing' | 'reviewed'

export type SideAvailability = 'value' | 'not-in-compared-data' | 'document-unavailable'

export type VerificationPresentation = 'verified' | 'not-verified' | 'incomplete' | 'unavailable'

export interface VerificationSource {
  type: DocumentType
  verification: DocumentVerification | null
}

export interface EvidencePageTarget {
  documentType: DocumentType
  fileName: string
  pageNumber: number
}

export interface FindingSide {
  documentId: string | null
  documentTitle: string
  filename: string | null
  documentType: DocumentType | null
  pageNumbers: readonly number[]
  pageLabel: string
  fieldLabel: string
  comparedValue: string | null
  emptyValue: boolean
  availability: SideAvailability
  sourceQuotes: readonly string[]
  originalValue: string | null
  reviewedValue: string | null
  corrected: boolean
  verification: VerificationPresentation
  verificationLabel: string
  evidence: FindingEvidence | null
  textSource: ReviewedField['textSource'] | null
  note: string | null
}

export interface FindingPresentation {
  finding: ReviewFinding
  kind: FindingKind
  kindLabel: 'Mismatch' | 'Missing information'
  fieldLabel: string
  reviewLabel: string
  reviewReason: string
  sides: readonly FindingSide[]
}

interface Topic {
  kind: FindingKind
  fieldLabel: string
  matchesPath: (path: string) => boolean
}

const verificationLabel: Record<VerificationPresentation, string> = {
  verified: 'Verified against source',
  'not-verified': 'Not yet verified',
  incomplete: 'Verification incomplete',
  unavailable: 'Verification status unavailable',
}

export function findingReviewLabel(status: FindingStatus): string {
  switch (status) {
    case 'open':
      return 'Needs review'
    case 'reviewed':
      return 'Reviewed'
    case 'resolved':
      return 'Resolved'
    case 'follow-up-required':
      return 'Follow-up required'
  }
}

export function presentFinding(
  finding: ReviewFinding,
  documents: readonly HealthcareDocument[],
  sources: readonly VerificationSource[],
): FindingPresentation {
  const topic = topicFor(finding)
  const sides = sidesFor(finding, documents, sources, topic)

  return {
    finding,
    kind: topic.kind,
    kindLabel: topic.kind === 'mismatch' ? 'Mismatch' : 'Missing information',
    fieldLabel: topic.fieldLabel,
    reviewLabel: findingReviewLabel(finding.status),
    reviewReason: reviewReason(finding, topic, sides),
    sides,
  }
}

export function findingMatchesFilter(presentation: FindingPresentation, filter: FindingFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'needs-review':
      return presentation.finding.status === 'open' || presentation.finding.status === 'follow-up-required'
    case 'mismatch':
      return presentation.kind === 'mismatch'
    case 'missing':
      return presentation.kind === 'missing'
    case 'reviewed':
      return presentation.finding.status === 'reviewed' || presentation.finding.status === 'resolved'
  }
}

export function countFindings(
  presentations: readonly FindingPresentation[],
): Record<FindingFilter, number> {
  return {
    all: presentations.length,
    'needs-review': presentations.filter((item) => findingMatchesFilter(item, 'needs-review')).length,
    mismatch: presentations.filter((item) => findingMatchesFilter(item, 'mismatch')).length,
    missing: presentations.filter((item) => findingMatchesFilter(item, 'missing')).length,
    reviewed: presentations.filter((item) => findingMatchesFilter(item, 'reviewed')).length,
  }
}

export function pageTargetForEvidence(
  evidence: FindingEvidence,
  finding: ReviewFinding | null,
  documents: readonly HealthcareDocument[],
  sources: readonly VerificationSource[],
): EvidencePageTarget | null {
  if (!finding) {
    return null
  }

  const side = presentFinding(finding, documents, sources).sides.find(
    (item) => item.evidence !== null && sameEvidence(item.evidence, evidence),
  )
  const pageNumber = side?.pageNumbers[0]
  if (!side?.documentType || !side.filename || pageNumber === undefined) {
    return null
  }

  return { documentType: side.documentType, fileName: side.filename, pageNumber }
}

function sameEvidence(left: FindingEvidence, right: FindingEvidence): boolean {
  return left.documentId === right.documentId && left.sectionId === right.sectionId && left.excerpt === right.excerpt
}

function topicFor(finding: ReviewFinding): Topic {
  const id = finding.id

  if (id === 'FIND-IDENTITY-NAME') {
    return { kind: 'mismatch', fieldLabel: 'Patient name', matchesPath: (path) => path === 'patient.name' }
  }

  if (id === 'FIND-IDENTITY-DOB') {
    return { kind: 'mismatch', fieldLabel: 'Date of birth', matchesPath: (path) => path === 'patient.dateOfBirth' }
  }

  if (id === 'FIND-IDENTITY-ID') {
    return {
      kind: 'mismatch',
      fieldLabel: 'Patient identifier',
      matchesPath: (path) => path === 'patient.patientId',
    }
  }

  if (id === 'FIND-FOLLOW-UP-DATE') {
    return {
      kind: 'missing',
      fieldLabel: 'Follow-up',
      matchesPath: (path) => path.startsWith('followUp.'),
    }
  }

  if (id === 'FIND-TREATMENT-GENERIC') {
    return { kind: 'missing', fieldLabel: 'Treatment', matchesPath: (path) => path === 'treatment' }
  }

  if (id.startsWith('FIND-MED-ONLY-')) {
    return { kind: 'missing', fieldLabel: 'Medication', matchesPath: (path) => path.endsWith('.name') }
  }

  if (id.endsWith('-STRENGTH')) {
    return { kind: 'mismatch', fieldLabel: 'Strength', matchesPath: (path) => path.endsWith('.strength') }
  }

  if (id.endsWith('-DOSAGE')) {
    return { kind: 'mismatch', fieldLabel: 'Dosage', matchesPath: (path) => path.endsWith('.dosage') }
  }

  if (id.endsWith('-INSTRUCTIONS')) {
    return {
      kind: finding.evidence.length < 2 ? 'missing' : 'mismatch',
      fieldLabel: 'Instructions',
      matchesPath: (path) => path.endsWith('.instructions'),
    }
  }

  if (finding.category === 'completeness' || finding.category === 'documentation') {
    return { kind: 'missing', fieldLabel: 'Documentation', matchesPath: () => false }
  }

  return { kind: 'mismatch', fieldLabel: 'Compared field', matchesPath: () => false }
}

function sidesFor(
  finding: ReviewFinding,
  documents: readonly HealthcareDocument[],
  sources: readonly VerificationSource[],
  topic: Topic,
): FindingSide[] {
  const sides: FindingSide[] = []

  for (const document of documents) {
    const evidence = finding.evidence.find((item) => item.documentId === document.id) ?? null
    if (evidence) {
      sides.push(valueSide(document, evidence, sources, topic))
      continue
    }

    if (topic.kind === 'missing') {
      sides.push(absentSide(document, topic))
    }
  }

  for (const evidence of finding.evidence) {
    if (documents.some((document) => document.id === evidence.documentId)) {
      continue
    }

    sides.push(unknownDocumentSide(evidence, topic))
  }

  return sides
}

function valueSide(
  document: HealthcareDocument,
  evidence: FindingEvidence,
  sources: readonly VerificationSource[],
  topic: Topic,
): FindingSide {
  const source = sourceFor(document, sources)
  const field = source?.verification ? matchField(source.verification, topic, evidence.excerpt) : undefined
  const pages = field && source?.verification ? validPages(field, source.verification.pageCount) : []
  const quotes = sourceQuotes(field)
  const excerpt = evidence.excerpt.trim()
  const reviewed = field?.reviewedValue.trim() ?? ''
  const comparedValue = excerpt.length > 0 ? excerpt : reviewed.length > 0 ? reviewed : null
  const emptyValue = comparedValue === null && field !== undefined && field.reviewedValue.trim().length === 0
  const corrected = field?.modified === true && (field.originalValue ?? '') !== field.reviewedValue

  return {
    documentId: document.id,
    documentTitle: document.title,
    filename: source?.verification?.fileName ?? document.filename,
    documentType: source?.type ?? null,
    pageNumbers: pages,
    pageLabel: pageLabel(pages),
    fieldLabel: topic.fieldLabel,
    comparedValue,
    emptyValue,
    availability: 'value',
    sourceQuotes: quotes,
    originalValue: corrected ? field?.originalValue ?? null : null,
    reviewedValue: corrected ? field?.reviewedValue ?? null : null,
    corrected,
    verification: verificationState(field, quotes),
    verificationLabel: verificationLabel[verificationState(field, quotes)],
    evidence,
    textSource: field?.textSource ?? null,
    note: null,
  }
}

function absentSide(document: HealthcareDocument, topic: Topic): FindingSide {
  return {
    documentId: document.id,
    documentTitle: document.title,
    filename: document.filename,
    documentType: null,
    pageNumbers: [],
    pageLabel: 'Page unavailable',
    fieldLabel: topic.fieldLabel,
    comparedValue: null,
    emptyValue: false,
    availability: 'not-in-compared-data',
    sourceQuotes: [],
    originalValue: null,
    reviewedValue: null,
    corrected: false,
    verification: 'unavailable',
    verificationLabel: verificationLabel.unavailable,
    evidence: null,
    textSource: null,
    note: 'No matching value was in the compared data.',
  }
}

function unknownDocumentSide(evidence: FindingEvidence, topic: Topic): FindingSide {
  const excerpt = evidence.excerpt.trim()

  return {
    documentId: evidence.documentId,
    documentTitle: 'Document unavailable',
    filename: null,
    documentType: null,
    pageNumbers: [],
    pageLabel: 'Page unavailable',
    fieldLabel: topic.fieldLabel,
    comparedValue: excerpt.length > 0 ? excerpt : null,
    emptyValue: false,
    availability: 'document-unavailable',
    sourceQuotes: [],
    originalValue: null,
    reviewedValue: null,
    corrected: false,
    verification: 'unavailable',
    verificationLabel: verificationLabel.unavailable,
    evidence,
    textSource: null,
    note: 'This document is not in the current review.',
  }
}

function sourceFor(
  document: HealthcareDocument,
  sources: readonly VerificationSource[],
): VerificationSource | undefined {
  return sources.find(
    (source) =>
      source.verification !== null &&
      comparisonDocumentId(source.type, source.verification.fileName) === document.id,
  )
}

function matchField(
  verification: DocumentVerification,
  topic: Topic,
  excerpt: string,
): ReviewedField | undefined {
  const matched = verification.fields.filter(
    (field) => topic.matchesPath(field.path) && fieldMatchesExcerpt(field, excerpt),
  )

  if (matched.length === 0) {
    if (excerpt.trim().length > 0) {
      return undefined
    }

    const pathMatches = verification.fields.filter((field) => topic.matchesPath(field.path))
    return pathMatches.length === 1 ? pathMatches[0] : undefined
  }

  const named = matched.filter((field) => {
    const name = medicationName(verification, field)
    return name !== null && name.length > 0 && excerpt.includes(name)
  })
  const pool = named.length > 0 ? named : matched

  return pool.reduce((best, field) => (matchScore(field, excerpt) > matchScore(best, excerpt) ? field : best))
}

function fieldMatchesExcerpt(field: ReviewedField, excerpt: string): boolean {
  const reviewed = field.reviewedValue.trim()
  if (reviewed.length > 0 && excerpt.includes(reviewed)) {
    return true
  }

  const original = field.originalValue?.trim() ?? ''
  if (original.length > 0 && excerpt.includes(original)) {
    return true
  }

  return field.sourceText.some((text) => text.trim().length > 0 && excerpt.includes(text))
}

function matchScore(field: ReviewedField, excerpt: string): number {
  const reviewed = field.reviewedValue.trim()
  if (reviewed.length > 0 && excerpt.includes(reviewed)) {
    return reviewed.length
  }

  const original = field.originalValue?.trim() ?? ''
  if (original.length > 0 && excerpt.includes(original)) {
    return original.length
  }

  return field.sourceText.reduce((best, text) => (excerpt.includes(text) ? Math.max(best, text.length) : best), 0)
}

function medicationName(verification: DocumentVerification, field: ReviewedField): string | null {
  const match = /^medications\.(\d+)\./u.exec(field.path)
  if (!match?.[1]) {
    return null
  }

  return verification.fields.find((item) => item.path === `medications.${match[1]}.name`)?.reviewedValue ?? null
}

function validPages(field: ReviewedField, pageCount: number): number[] {
  const pages: number[] = []

  for (const page of field.evidencePageNumbers) {
    if (!Number.isInteger(page) || page < 1 || page > pageCount || pages.includes(page)) {
      continue
    }

    pages.push(page)
  }

  return pages
}

function pageLabel(pages: readonly number[]): string {
  if (pages.length === 0) {
    return 'Page unavailable'
  }

  if (pages.length === 1) {
    return `Page ${pages[0]}`
  }

  return `Pages ${pages.join(', ')}`
}

function sourceQuotes(field: ReviewedField | undefined): string[] {
  if (!field) {
    return []
  }

  return field.sourceText.map((text) => text.trim()).filter((text) => text.length > 0)
}

function verificationState(
  field: ReviewedField | undefined,
  quotes: readonly string[],
): VerificationPresentation {
  if (!field) {
    return 'unavailable'
  }

  if (field.verification !== 'confirmed') {
    return 'not-verified'
  }

  if (quotes.length === 0 || field.structural.length > 0) {
    return 'incomplete'
  }

  return 'verified'
}

function reviewReason(finding: ReviewFinding, topic: Topic, sides: readonly FindingSide[]): string {
  const parts = [baseReason(finding, topic)]

  if (sides.some((side) => side.verification === 'not-verified')) {
    parts.push('A compared value has not been verified.')
  }

  if (sides.some((side) => side.verification === 'incomplete')) {
    parts.push('Supporting evidence for a compared value is incomplete.')
  }

  if (sides.some((side) => side.textSource === 'ocr')) {
    parts.push('A value was read from a scanned page.')
  }

  if (sides.some((side) => side.availability === 'document-unavailable')) {
    parts.push('A cited document is not in this review.')
  }

  return parts.join(' ')
}

function baseReason(finding: ReviewFinding, topic: Topic): string {
  if (topic.kind === 'mismatch') {
    return 'The compared values differ. Neither value is selected as correct.'
  }

  if (finding.id === 'FIND-FOLLOW-UP-DATE' || finding.id === 'FIND-TREATMENT-GENERIC') {
    return 'The enabled check did not find this detail in the compared text. That does not show it was absent from the original document.'
  }

  return 'A matching value was not in the compared data for every document. That does not show it was absent from an original document.'
}
