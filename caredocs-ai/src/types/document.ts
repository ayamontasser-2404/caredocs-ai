/**
 * Source documents for a document review.
 * These types describe synthetic fixtures. They are not a clinical record format.
 */

/** Calendar date as `YYYY-MM-DD`. */
export type IsoDate = string

/** Documents this prototype can place side by side. */
export type DocumentType = 'discharge-letter' | 'medication-plan'

/**
 * Identity fields that can be compared across documents.
 * Patient id and date of birth may match while the name differs.
 */
export interface PatientIdentity {
  patientId: string
  name: string
  dateOfBirth: IsoDate
}

/**
 * An addressable block of a document.
 * A finding cites `id` together with the parent document id.
 */
export interface DocumentSection {
  id: string
  title: string
  content: string
}

/**
 * One medication line.
 * `strength` is the preparation, for example `40 mg`.
 * `dosage` is how it is taken, for example `1 Tablette morgens`.
 * Keeping them separate lets a strength mismatch stay distinct from a schedule mismatch.
 */
export interface MedicationEntry {
  name: string
  strength: string
  dosage: string
  instructions?: string
}

/**
 * A document submitted for review.
 * `synthetic` and `demoNotice` mark fixture data that must not be used clinically.
 */
export interface HealthcareDocument {
  id: string
  type: DocumentType
  title: string
  filename: string
  createdAt: IsoDate
  patient: PatientIdentity
  sections: readonly DocumentSection[]
  medications: readonly MedicationEntry[]
  synthetic: true
  demoNotice: string
}
