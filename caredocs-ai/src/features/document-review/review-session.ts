import { compareDocuments } from './comparison/compare-documents.ts'
import type { HealthcareDocument } from '../../types/document.ts'
import type {
  FindingStatus,
  ReviewChecklistItem,
  ReviewState,
  ReviewStatus,
} from '../../types/review.ts'

/**
 * Start a review from a comparison.
 * Finding status stays on each finding. Review status starts at `not-started`
 * and is not derived from those finding statuses.
 */
export function createReviewSession(
  documents: readonly HealthcareDocument[],
  checklist: readonly ReviewChecklistItem[],
): ReviewState {
  if (documents.length !== 2) {
    throw new Error('A review session compares two documents.')
  }

  const [documentA, documentB] = documents
  const findings = compareDocuments(documentA, documentB, checklist)

  return {
    status: 'not-started',
    documentIds: [documentA.id, documentB.id],
    findings: findings.map((finding) => ({
      ...finding,
      evidence: [...finding.evidence],
    })),
  }
}

/**
 * Change the review as a whole.
 * The findings array is kept as-is, including every finding status.
 */
export function setReviewStatus(review: ReviewState, status: ReviewStatus): ReviewState {
  if (review.status === status) {
    return review
  }

  return {
    status,
    documentIds: review.documentIds,
    findings: review.findings,
  }
}

/**
 * Change one finding. The review status is left untouched.
 */
export function setFindingStatus(
  review: ReviewState,
  findingId: string,
  status: FindingStatus,
): ReviewState {
  const finding = review.findings.find((item) => item.id === findingId)

  if (!finding || finding.status === status) {
    return review
  }

  return {
    status: review.status,
    documentIds: review.documentIds,
    findings: review.findings.map((item) =>
      item.id === findingId ? { ...item, status } : item,
    ),
  }
}
