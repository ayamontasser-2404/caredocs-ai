/**
 * Checklist, findings, and progress for one document review.
 *
 * A finding records a discrepancy or a documentation prompt. It does not
 * confirm a clinical error, and it does not decide which source value is correct.
 *
 * `ReviewStatus` describes the review as a whole. `FindingStatus` describes
 * one finding. A completed review may still contain findings that need follow-up.
 */

/** Shared taxonomy for checklist items and findings. */
export type ReviewCategory =
  | 'medication'
  | 'patient-identity'
  | 'completeness'
  | 'documentation'

export type FindingSeverity = 'high' | 'review-required' | 'informational'

/** Status of a single finding. Independent of `ReviewStatus`. */
export type FindingStatus =
  | 'open'
  | 'reviewed'
  | 'resolved'
  | 'follow-up-required'

/**
 * Status of the review as a whole.
 * `completed` can coexist with findings whose status is `follow-up-required`.
 */
export type ReviewStatus = 'not-started' | 'in-progress' | 'completed'

/**
 * A citation from a finding back into a source document.
 * `sectionId` is `DocumentSection.id` on the document named by `documentId`.
 * `excerpt` is the text the finding relies on, not a verdict about that text.
 */
export interface FindingEvidence {
  documentId: string
  sectionId: string
  excerpt: string
}

/**
 * One review condition drawn from the source documents.
 * `completeness` and `documentation` findings are illustrative review prompts.
 */
export interface ReviewFinding {
  id: string
  category: ReviewCategory
  severity: FindingSeverity
  status: FindingStatus
  title: string
  description: string
  rationale: string
  evidence: readonly FindingEvidence[]
}

/** One enabled or disabled check a reviewer can apply. */
export interface ReviewChecklistItem {
  id: string
  title: string
  description: string
  category: ReviewCategory
  enabled: boolean
}

/**
 * Progress of one review over a set of documents.
 * Finding status stays on each `ReviewFinding` so it cannot be collapsed
 * into `status`. Progress is read from these fields; it is not stored again.
 */
export interface ReviewState {
  status: ReviewStatus
  documentIds: readonly string[]
  findings: readonly ReviewFinding[]
}
