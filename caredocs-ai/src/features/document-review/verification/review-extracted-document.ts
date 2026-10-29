import { normalizeText } from '../comparison/normalize.ts'
import { interpretDate } from '../extraction/extract-document-data.ts'
import type {
  ExtractedDocumentFields,
  ExtractedField,
  ExtractedPdfPage,
  FieldEvidence,
  StructuredDocumentExtraction,
  StructuredTextSource,
} from '../extraction/extraction-types.ts'
import type { DocumentVerification, ReviewedField, ValidationIssue } from './verification-types.ts'
import { pageConfidence } from './verification-types.ts'

/**
 * Review extracted PDF fields without changing them or creating findings.
 *
 * Required for later comparison eligibility: patient name, date of birth, and,
 * for each medication that was extracted, its name and strength.
 * Patient id, dosage, instructions, route, frequency, dates other than birth,
 * follow-up, treatment, and document metadata are optional. Their absence does not block.
 *
 * A required field is eligible only when it has source text, a valid reviewed value,
 * and an explicit confirmation. Successful validation does not confirm a field.
 * There is no reviewer identity, audit log, or saved session.
 */

const STRENGTH = /^\d+(?:[.,]\d+)?\s*(?:mg|g|ml|µg|μg|ug|mcg|ie|i\.e\.)$/iu

type FieldKind = 'name' | 'date' | 'strength' | 'document-type' | 'text'

interface FieldDraft {
  path: string
  label: string
  required: boolean
  kind: FieldKind
  extracted: ExtractedField
}

export function createDocumentVerification(
  extraction: StructuredDocumentExtraction,
  pages: readonly ExtractedPdfPage[],
  pageCount: number,
): DocumentVerification {
  if (!extraction.data) {
    return {
      fileName: extraction.fileName,
      pageCount,
      fields: [],
      eligibleForComparison: false,
      reasons: ['Structured extraction could not read this result.'],
    }
  }

  const fields = draftsFor(extraction.data).map((draft) => reviewField(draft, pages, pageCount))
  return assemble(extraction.fileName, pageCount, fields)
}

export function editReviewedValue(
  verification: DocumentVerification,
  path: string,
  value: string,
): DocumentVerification {
  const fields = verification.fields.map((field) => {
    if (field.path !== path) {
      return field
    }

    return rescore(field, value, verification.pageCount)
  })

  return assemble(verification.fileName, verification.pageCount, fields)
}

/**
 * Confirm the current reviewed value. An invalid value is left unchanged.
 * Confirmation does not rewrite the extracted field or its evidence.
 */
export function confirmReviewedField(
  verification: DocumentVerification,
  path: string,
): DocumentVerification {
  const fields = verification.fields.map((field) => {
    if (field.path !== path || !field.canConfirm) {
      return field
    }

    return { ...field, verification: 'confirmed' as const }
  })

  return assemble(verification.fileName, verification.pageCount, fields)
}

function draftsFor(data: ExtractedDocumentFields): FieldDraft[] {
  const drafts: FieldDraft[] = [
    { path: 'patient.name', label: 'Patient name', required: true, kind: 'name', extracted: data.patient.name },
    {
      path: 'patient.dateOfBirth',
      label: 'Date of birth',
      required: true,
      kind: 'date',
      extracted: data.patient.dateOfBirth,
    },
    {
      path: 'patient.patientId',
      label: 'Patient identifier',
      required: false,
      kind: 'text',
      extracted: data.patient.patientId,
    },
    {
      path: 'documentType',
      label: 'Document type',
      required: false,
      kind: 'document-type',
      extracted: data.documentType,
    },
    { path: 'documentDate', label: 'Document date', required: false, kind: 'date', extracted: data.documentDate },
    { path: 'dischargeDate', label: 'Discharge date', required: false, kind: 'date', extracted: data.dischargeDate },
  ]

  data.medications.forEach((medication, index) => {
    const prefix = `Medication ${index + 1}`
    drafts.push(
      { path: `medications.${index}.name`, label: `${prefix} name`, required: true, kind: 'name', extracted: medication.name },
      {
        path: `medications.${index}.strength`,
        label: `${prefix} strength`,
        required: true,
        kind: 'strength',
        extracted: medication.strength,
      },
      {
        path: `medications.${index}.dosage`,
        label: `${prefix} dosage`,
        required: false,
        kind: 'text',
        extracted: medication.dosage,
      },
      {
        path: `medications.${index}.instructions`,
        label: `${prefix} instructions`,
        required: false,
        kind: 'text',
        extracted: medication.instructions,
      },
      { path: `medications.${index}.route`, label: `${prefix} route`, required: false, kind: 'text', extracted: medication.route },
      {
        path: `medications.${index}.frequency`,
        label: `${prefix} frequency`,
        required: false,
        kind: 'text',
        extracted: medication.frequency,
      },
      {
        path: `medications.${index}.startDate`,
        label: `${prefix} start date`,
        required: false,
        kind: 'date',
        extracted: medication.startDate,
      },
      {
        path: `medications.${index}.endDate`,
        label: `${prefix} end date`,
        required: false,
        kind: 'date',
        extracted: medication.endDate,
      },
    )
  })

  drafts.push(
    { path: 'followUp.date', label: 'Follow-up date', required: false, kind: 'date', extracted: data.followUp.date },
    {
      path: 'followUp.instructions',
      label: 'Follow-up instructions',
      required: false,
      kind: 'text',
      extracted: data.followUp.instructions,
    },
    { path: 'treatment', label: 'Treatment', required: false, kind: 'text', extracted: data.treatment },
  )

  return drafts.filter((draft) => draft.required || draft.extracted.status !== 'missing')
}

function reviewField(draft: FieldDraft, pages: readonly ExtractedPdfPage[], count: number): ReviewedField {
  const initialValue = proposedValue(draft.extracted)
  const evidence = evidencesOf(draft.extracted)

  return rescore(
    {
      path: draft.path,
      label: draft.label,
      required: draft.required,
      extracted: draft.extracted,
      originalValue: draft.extracted.status === 'found' ? draft.extracted.sourceValue : null,
      initialValue,
      reviewedValue: initialValue ?? '',
      modified: false,
      verification: 'unverified',
      normalizedValue: null,
      structural: [],
      uncertainty: [],
      evidencePageNumbers: evidence.map((item) => item.pageNumber),
      sourceText: evidence.map((item) => item.text),
      textSource: textSourceOf(evidence),
      ocrConfidence: ocrConfidenceOf(evidence, pages),
      canConfirm: false,
    },
    initialValue ?? '',
    count,
  )
}

function rescore(field: ReviewedField, reviewedValue: string, count: number): ReviewedField {
  const kind = kindFor(field.path)
  const evidence = evidencesOf(field.extracted)
  const structural = structuralIssues(field, kind, reviewedValue, evidence, count)
  const uncertainty = uncertaintyIssues(field.extracted, evidence)
  const trimmed = reviewedValue.trim()
  const interpreted = kind === 'date' && trimmed.length > 0 ? interpretDate(trimmed) : null

  return {
    ...field,
    reviewedValue,
    modified: reviewedValue !== (field.initialValue ?? ''),
    verification: 'unverified',
    normalizedValue: interpreted?.kind === 'date' ? interpreted.iso : null,
    structural,
    uncertainty,
    canConfirm: structural.length === 0 && trimmed.length > 0,
  }
}

function structuralIssues(
  field: ReviewedField,
  kind: FieldKind,
  reviewedValue: string,
  evidence: readonly FieldEvidence[],
  count: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const trimmed = reviewedValue.trim()

  if (field.required && trimmed.length === 0) {
    issues.push({ category: 'structural', message: 'A value is required.' })
  }

  if (trimmed.length > 0 && kind === 'name' && !isName(trimmed)) {
    issues.push({ category: 'structural', message: 'Name must use letters.' })
  }

  if (trimmed.length > 0 && kind === 'date' && interpretDate(trimmed).kind !== 'date') {
    issues.push({ category: 'structural', message: 'This date could not be read unambiguously.' })
  }

  if (trimmed.length > 0 && kind === 'strength' && !STRENGTH.test(trimmed)) {
    issues.push({ category: 'structural', message: 'Strength must be a number followed by a unit, such as 40 mg.' })
  }

  if (trimmed.length > 0 && kind === 'document-type' && !isSupportedDocumentType(trimmed)) {
    issues.push({ category: 'structural', message: 'Document type is not supported.' })
  }

  for (const item of evidence) {
    if (!Number.isInteger(item.pageNumber) || item.pageNumber < 1 || item.pageNumber > count) {
      issues.push({ category: 'structural', message: 'The source page is not in this document.' })
      break
    }
  }

  return issues
}

function uncertaintyIssues(extracted: ExtractedField, evidence: readonly FieldEvidence[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (extracted.status === 'ambiguous') {
    issues.push({ category: 'uncertainty', message: 'More than one value was extracted. No value was selected.' })
  }

  if (extracted.status === 'unparsed') {
    issues.push({ category: 'uncertainty', message: 'The labeled text could not be read confidently.' })
  }

  if (extracted.status !== 'missing' && evidence.length === 0) {
    issues.push({ category: 'uncertainty', message: 'No source text was kept for this value.' })
  }

  if (evidence.some((item) => item.textSource === 'ocr')) {
    issues.push({ category: 'uncertainty', message: 'This value was read from a scanned page.' })
  }

  return issues
}

function assemble(fileName: string, count: number, fields: readonly ReviewedField[]): DocumentVerification {
  const reasons = blockingReasons(fields)
  return {
    fileName,
    pageCount: count,
    fields,
    eligibleForComparison: reasons.length === 0,
    reasons,
  }
}

function blockingReasons(fields: readonly ReviewedField[]): string[] {
  const reasons: string[] = []

  for (const field of fields) {
    if (!field.required) {
      if (field.reviewedValue.trim().length > 0 && field.structural.length > 0) {
        reasons.push(`${field.label}: ${field.structural[0]?.message ?? 'The value is not valid.'}`)
      }
      continue
    }

    if (field.extracted.status === 'missing' && !field.modified) {
      reasons.push(`${field.label} was not found.`)
      continue
    }

    if (field.structural.length > 0) {
      reasons.push(`${field.label}: ${field.structural[0]?.message ?? 'The value is not valid.'}`)
      continue
    }

    if (field.extracted.status !== 'missing' && field.sourceText.length === 0) {
      reasons.push(`${field.label} has no source text.`)
      continue
    }

    if (field.verification !== 'confirmed') {
      reasons.push(`${field.label} has not been confirmed.`)
    }
  }

  if (fields.length === 0) {
    reasons.push('No supported fields were extracted.')
  }

  return reasons
}

function proposedValue(field: ExtractedField): string | null {
  if (field.status !== 'found') {
    return null
  }

  return field.normalizedValue ?? field.sourceValue
}

function evidencesOf(field: ExtractedField): FieldEvidence[] {
  if (field.status === 'found' || field.status === 'unparsed') {
    return [...field.evidence]
  }

  if (field.status === 'ambiguous') {
    return field.candidates.map((candidate) => candidate.evidence)
  }

  return []
}

function textSourceOf(evidence: readonly FieldEvidence[]): StructuredTextSource {
  if (evidence.some((item) => item.textSource === 'ocr')) {
    return 'ocr'
  }

  if (evidence.some((item) => item.textSource === 'embedded')) {
    return 'embedded'
  }

  return 'unspecified'
}

function ocrConfidenceOf(evidence: readonly FieldEvidence[], pages: readonly ExtractedPdfPage[]): number | null {
  const ocr = evidence.find((item) => item.textSource === 'ocr')
  return ocr ? pageConfidence(pages, ocr.pageNumber) : null
}

function kindFor(path: string): FieldKind {
  if (
    path.endsWith('dateOfBirth') ||
    path.endsWith('Date') ||
    path.endsWith('.date') ||
    path.endsWith('startDate') ||
    path.endsWith('endDate')
  ) {
    return 'date'
  }

  if (path.endsWith('strength')) {
    return 'strength'
  }

  if (path.endsWith('name') || path.endsWith('.name')) {
    return 'name'
  }

  if (path === 'documentType') {
    return 'document-type'
  }

  return 'text'
}

function isName(value: string): boolean {
  const words = value.trim().split(/\s+/)
  return words.length > 0 && words.length <= 6 && words.every((word) => /^[\p{L}][\p{L}'.-]*$/u.test(word))
}

function isSupportedDocumentType(value: string): boolean {
  const key = normalizeText(value)
  return (
    key === 'discharge-letter' ||
    key === 'medication-plan' ||
    key === 'entlassbrief' ||
    key === 'ärztlicher entlassbrief' ||
    key === 'medikationsplan'
  )
}

