import type { HealthcareDocument, MedicationEntry } from '../../../types/document.ts'
import type { ReviewChecklistItem } from '../../../types/review.ts'

/**
 * Raised when a comparison cannot run because required fields are missing.
 * Messages name the field, not the patient or medication value.
 */
export class ComparisonInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ComparisonInputError'
  }
}

export function assertComparisonInput(
  documentA: HealthcareDocument,
  documentB: HealthcareDocument,
  checklist: readonly ReviewChecklistItem[],
): void {
  assertDocument(documentA, 'First document')
  assertDocument(documentB, 'Second document')
  assertChecklist(checklist)
}

function assertDocument(document: HealthcareDocument, label: string): void {
  if (!isPresentText(document?.id)) {
    throw new ComparisonInputError(`${label} is missing an id.`)
  }

  if (!document.patient || typeof document.patient !== 'object') {
    throw new ComparisonInputError(`${label} is missing a patient.`)
  }

  if (!isPresentText(document.patient.patientId)) {
    throw new ComparisonInputError(`${label} is missing a patient id.`)
  }

  if (!isPresentText(document.patient.name)) {
    throw new ComparisonInputError(`${label} is missing a patient name.`)
  }

  if (!isPresentText(document.patient.dateOfBirth)) {
    throw new ComparisonInputError(`${label} is missing a date of birth.`)
  }

  if (!Array.isArray(document.sections)) {
    throw new ComparisonInputError(`${label} is missing sections.`)
  }

  if (!Array.isArray(document.medications)) {
    throw new ComparisonInputError(`${label} is missing medications.`)
  }

  for (const medication of document.medications) {
    assertMedication(medication, label)
  }
}

function assertMedication(medication: MedicationEntry, label: string): void {
  if (!medication || typeof medication !== 'object') {
    throw new ComparisonInputError(`${label} contains an invalid medication entry.`)
  }

  if (!isPresentText(medication.name)) {
    throw new ComparisonInputError(`${label} contains a medication without a name.`)
  }

  if (!isPresentText(medication.strength)) {
    throw new ComparisonInputError(`${label} contains a medication without a strength.`)
  }

  if (!isPresentText(medication.dosage)) {
    throw new ComparisonInputError(`${label} contains a medication without a dosage.`)
  }
}

function assertChecklist(checklist: readonly ReviewChecklistItem[]): void {
  if (!Array.isArray(checklist)) {
    throw new ComparisonInputError('Checklist is missing.')
  }
}

function isPresentText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
