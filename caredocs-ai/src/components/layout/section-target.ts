import type { FindingEvidence } from '../../types/review.ts'

export function sectionElementId(documentId: string, sectionId: string): string {
  return `document-${documentId}-section-${sectionId}`
}

export function isSameEvidence(left: FindingEvidence | null, right: FindingEvidence): boolean {
  return (
    left?.documentId === right.documentId &&
    left.sectionId === right.sectionId &&
    left.excerpt === right.excerpt
  )
}
