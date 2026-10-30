import type { ExtractedField, ExtractedPdfPage, StructuredTextSource } from '../extraction/extraction-types.ts'

/**
 * Structural problems are separate from uncertainty and from a reviewer's confirmation.
 * None of these is a clinical judgment or a review finding.
 */
export type ValidationCategory = 'structural' | 'uncertainty'

export interface ValidationIssue {
  category: ValidationCategory
  message: string
}

/**
 * `unverified` includes a correction that has not been confirmed again.
 * Confirmation is an in-memory workflow state. It is not an electronic signature.
 */
export type FieldVerificationStatus = 'unverified' | 'confirmed'

export interface ReviewedField {
  path: string
  label: string
  required: boolean
  /** The Phase 3 field. Edits do not change this value. */
  extracted: ExtractedField
  /** Value proposed by extraction, when there was exactly one. */
  originalValue: string | null
  /** Value currently shown for review. Null when extraction did not choose one. */
  initialValue: string | null
  reviewedValue: string
  /** True when the reviewed text differs from the value extraction proposed. */
  modified: boolean
  verification: FieldVerificationStatus
  /** ISO date when the reviewed text has one valid reading. */
  normalizedValue: string | null
  structural: readonly ValidationIssue[]
  uncertainty: readonly ValidationIssue[]
  evidencePageNumbers: readonly number[]
  sourceText: readonly string[]
  textSource: StructuredTextSource
  /** Present only when the page was recognized and Tesseract returned a finite score. */
  ocrConfidence: number | null
  canConfirm: boolean
}

/**
 * Review of one extracted PDF.
 * `eligibleForComparison` means the required fields on this PDF are confirmed.
 * `prepareComparisonInput` checks the pair before `compareDocuments` runs.
 */
export interface DocumentVerification {
  fileName: string
  pageCount: number
  fields: readonly ReviewedField[]
  eligibleForComparison: boolean
  reasons: readonly string[]
}

export function pageConfidence(pages: readonly ExtractedPdfPage[], pageNumber: number): number | null {
  const page = pages.find((item) => item.pageNumber === pageNumber)
  return typeof page?.confidence === 'number' && Number.isFinite(page.confidence) ? page.confidence : null
}
