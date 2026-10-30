import type { DocumentType, DocumentSection, HealthcareDocument, MedicationEntry } from '../../../types/document.ts'
import type { DocumentVerification, ReviewedField } from '../verification/verification-types.ts'

/**
 * Reasons a pair cannot be passed to `compareDocuments`.
 * Messages name the field. They do not quote patient or medication values.
 */
export type ComparisonBlockCode =
  | 'DOCUMENT_MISSING'
  | 'DOCUMENT_NOT_VERIFIED'
  | 'VALIDATION_ERRORS'
  | 'UNRESOLVED_AMBIGUITY'
  | 'MISSING_REQUIRED_FIELDS'
  | 'INSUFFICIENT_COMPARISON_DATA'

export interface ComparisonBlockReason {
  code: ComparisonBlockCode
  document: DocumentType | 'pair'
  message: string
}

export type ComparisonPreparation =
  | { status: 'eligible'; letter: HealthcareDocument; plan: HealthcareDocument }
  | { status: 'ineligible'; reasons: readonly ComparisonBlockReason[] }

export interface ComparisonSlot {
  document: HealthcareDocument | null
  verification: DocumentVerification | null
}

const DEMO_NOTICE =
  'Synthetic review copy. Confirmed PDF fields were copied for comparison in this browser session. This is not a clinical record.'

/**
 * Build the discharge-letter and medication-plan pair for `compareDocuments`.
 *
 * A JSON document already stored on the slot is used as-is.
 * A PDF is used only through its Phase 4 verification. `eligibleForComparison`
 * remains that check. A present field that is still unconfirmed also blocks,
 * because dropping it would look like the value was absent.
 * Patient id and dosage may be absent. They are not invented.
 */
export function prepareComparisonInput(letter: ComparisonSlot, plan: ComparisonSlot): ComparisonPreparation {
  const preparedLetter = prepareSlot('discharge-letter', letter)
  const preparedPlan = prepareSlot('medication-plan', plan)
  const reasons = [...preparedLetter.reasons, ...preparedPlan.reasons]

  if (reasons.length > 0 || !preparedLetter.document || !preparedPlan.document) {
    return {
      status: 'ineligible',
      reasons:
        reasons.length > 0
          ? reasons
          : [
              {
                code: 'DOCUMENT_MISSING',
                document: 'pair',
                message: 'A discharge letter and a medication plan are both required.',
              },
            ],
    }
  }

  if (preparedLetter.document.id === preparedPlan.document.id) {
    return {
      status: 'ineligible',
      reasons: [
        {
          code: 'INSUFFICIENT_COMPARISON_DATA',
          document: 'pair',
          message: 'The discharge letter and the medication plan resolved to the same document.',
        },
      ],
    }
  }

  return { status: 'eligible', letter: preparedLetter.document, plan: preparedPlan.document }
}

function prepareSlot(
  type: DocumentType,
  slot: ComparisonSlot,
): { document: HealthcareDocument | null; reasons: ComparisonBlockReason[] } {
  if (slot.document) {
    return { document: slot.document, reasons: [] }
  }

  if (!slot.verification) {
    return {
      document: null,
      reasons: [
        {
          code: 'DOCUMENT_MISSING',
          document: type,
          message: `${slotLabel(type)} is missing.`,
        },
      ],
    }
  }

  if (!slot.verification.eligibleForComparison) {
    return { document: null, reasons: blockedFields(type, slot.verification) }
  }

  const unverified = slot.verification.fields.filter((field) => field.verification !== 'confirmed')
  if (unverified.length > 0) {
    return {
      document: null,
      reasons: unverified.map((field) => reason(type, 'DOCUMENT_NOT_VERIFIED', field)),
    }
  }

  return { document: documentFromVerification(type, slot.verification), reasons: [] }
}

function blockedFields(type: DocumentType, verification: DocumentVerification): ComparisonBlockReason[] {
  const reasons = verification.fields.filter(blocksComparison).map((field) => reason(type, codeFor(field), field))

  if (reasons.length > 0) {
    return reasons
  }

  const unreadable = verification.reasons.some((item) => item.includes('could not read'))
  return [
    {
      code: unreadable ? 'VALIDATION_ERRORS' : 'MISSING_REQUIRED_FIELDS',
      document: type,
      message: unreadable
        ? `${slotLabel(type)} could not be read into fields.`
        : `${slotLabel(type)} has no confirmed fields.`,
    },
  ]
}

function blocksComparison(field: ReviewedField): boolean {
  if (!field.required) {
    return field.reviewedValue.trim().length > 0 && field.structural.length > 0
  }

  if (field.extracted.status === 'missing' && !field.modified) {
    return true
  }

  if (field.structural.length > 0) {
    return true
  }

  if (field.extracted.status !== 'missing' && field.sourceText.length === 0) {
    return true
  }

  return field.verification !== 'confirmed'
}

function codeFor(field: ReviewedField): ComparisonBlockCode {
  if (field.required && field.extracted.status === 'ambiguous' && field.verification !== 'confirmed') {
    return 'UNRESOLVED_AMBIGUITY'
  }

  if (field.required && field.extracted.status === 'missing' && !field.modified) {
    return 'MISSING_REQUIRED_FIELDS'
  }

  if (field.structural.length > 0) {
    return 'VALIDATION_ERRORS'
  }

  if (field.required && field.extracted.status !== 'missing' && field.sourceText.length === 0) {
    return 'INSUFFICIENT_COMPARISON_DATA'
  }

  return 'DOCUMENT_NOT_VERIFIED'
}

function reason(type: DocumentType, code: ComparisonBlockCode, field: ReviewedField): ComparisonBlockReason {
  return { code, document: type, message: `${slotLabel(type)}: ${fieldMessage(code, field)}` }
}

function fieldMessage(code: ComparisonBlockCode, field: ReviewedField): string {
  switch (code) {
    case 'DOCUMENT_NOT_VERIFIED':
      return `${field.label} has not been confirmed.`
    case 'VALIDATION_ERRORS':
      return `${field.label} is not valid.`
    case 'UNRESOLVED_AMBIGUITY':
      return `${field.label} has more than one extracted value.`
    case 'MISSING_REQUIRED_FIELDS':
      return `${field.label} was not found.`
    case 'INSUFFICIENT_COMPARISON_DATA':
      return `${field.label} has no source text.`
    case 'DOCUMENT_MISSING':
      return `${field.label} is missing.`
  }
}

function documentFromVerification(type: DocumentType, verification: DocumentVerification): HealthcareDocument {
  const fields = verification.fields
  const documentDate = confirmedField(fields, 'documentDate')
  const patientId = confirmedField(fields, 'patient.patientId')

  return {
    id: comparisonDocumentId(type, verification.fileName),
    type,
    title: slotLabel(type),
    filename: verification.fileName,
    createdAt: documentDate?.normalizedValue ?? '',
    patient: {
      patientId: patientId?.reviewedValue.trim() ?? '',
      name: requiredReviewed(fields, 'patient.name'),
      dateOfBirth: requiredReviewed(fields, 'patient.dateOfBirth'),
    },
    sections: sectionsFor(fields),
    medications: medicationsFor(fields),
    synthetic: true,
    demoNotice: DEMO_NOTICE,
  }
}

function medicationsFor(fields: readonly ReviewedField[]): MedicationEntry[] {
  const indexes = new Set<number>()

  for (const field of fields) {
    const match = /^medications\.(\d+)\./u.exec(field.path)
    if (match?.[1]) {
      indexes.add(Number(match[1]))
    }
  }

  return [...indexes]
    .sort((left, right) => left - right)
    .map((index) => {
      const instructions = confirmedField(fields, `medications.${index}.instructions`)
      return {
        name: requiredReviewed(fields, `medications.${index}.name`),
        strength: requiredReviewed(fields, `medications.${index}.strength`),
        dosage: confirmedField(fields, `medications.${index}.dosage`)?.reviewedValue.trim() ?? '',
        instructions: instructions ? instructions.reviewedValue.trim() : undefined,
      }
    })
}

function sectionsFor(fields: readonly ReviewedField[]): DocumentSection[] {
  const sections: DocumentSection[] = [
    { id: 'patient', title: 'Patient', content: provenance(fields, ['patient.name', 'patient.dateOfBirth', 'patient.patientId']) },
    {
      id: 'medication',
      title: 'Medication',
      content: provenance(
        fields,
        fields.filter((field) => field.path.startsWith('medications.')).map((field) => field.path),
      ),
    },
  ]

  const followUp = provenance(fields, ['followUp.date', 'followUp.instructions'])
  if (followUp.length > 0) {
    sections.push({ id: 'follow-up', title: 'Follow-up', content: followUp })
  }

  const treatment = provenance(fields, ['treatment'])
  if (treatment.length > 0) {
    sections.push({ id: 'treatment', title: 'Treatment', content: treatment })
  }

  return sections
}

function provenance(fields: readonly ReviewedField[], paths: readonly string[]): string {
  return paths
    .map((path) => confirmedField(fields, path))
    .filter((field): field is ReviewedField => field !== undefined)
    .flatMap(provenanceLines)
    .join('\n')
}

function provenanceLines(field: ReviewedField): string[] {
  const lines = field.sourceText.map((text, index) => {
    const page = field.evidencePageNumbers[index]
    const method = field.textSource === 'ocr' ? 'OCR' : field.textSource === 'embedded' ? 'embedded text' : 'text'
    return `Source page ${page}, ${method}: ${text}`
  })

  lines.push(`Confirmed ${field.label}: ${field.reviewedValue}`)
  return lines
}

function confirmedField(fields: readonly ReviewedField[], path: string): ReviewedField | undefined {
  const field = fields.find((item) => item.path === path)
  if (!field || field.verification !== 'confirmed' || field.reviewedValue.trim().length === 0) {
    return undefined
  }

  return field
}

function requiredReviewed(fields: readonly ReviewedField[], path: string): string {
  return confirmedField(fields, path)?.reviewedValue.trim() ?? ''
}

export function safeComparisonFileName(fileName: string): string {
  return fileName.trim().replace(/\s+/g, '-')
}

export function comparisonDocumentId(type: DocumentType, fileName: string): string {
  return `pdf-${type}-${safeComparisonFileName(fileName)}`
}

function slotLabel(type: DocumentType): string {
  return type === 'discharge-letter' ? 'Discharge letter' : 'Medication plan'
}
