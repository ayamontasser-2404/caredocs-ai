import { safeComparisonFileName } from '../../features/document-review/comparison/prepare-comparison-input.ts'
import type { DocumentType } from '../../types/document.ts'
import type { FindingEvidence } from '../../types/review.ts'

export function sectionElementId(documentId: string, sectionId: string): string {
  return `document-${documentId}-section-${sectionId}`
}

export function extractionPageElementId(
  documentType: DocumentType,
  fileName: string,
  pageNumber: number,
): string {
  return `extraction-page-${documentType}-${safeComparisonFileName(fileName)}-${pageNumber}`
}

export function isSameEvidence(left: FindingEvidence | null, right: FindingEvidence): boolean {
  return (
    left?.documentId === right.documentId &&
    left.sectionId === right.sectionId &&
    left.excerpt === right.excerpt
  )
}
