import type { HealthcareDocument } from '../../../types/document.ts'
import type { FindingEvidence, ReviewChecklistItem, ReviewFinding } from '../../../types/review.ts'
import { assertComparisonInput, ComparisonInputError } from './assertions.ts'
import { compareMedications } from './compare-medications.ts'
import { comparePatientIdentity } from './compare-patient-identity.ts'
import {
  detectMissingInformation,
  FOLLOW_UP_RULE_ID,
  isEnabled,
  TREATMENT_RULE_ID,
} from './detect-missing-information.ts'

export { ComparisonInputError }

export const PATIENT_IDENTITY_RULE_ID = 'patient-identity-consistency'
export const MEDICATION_RULE_ID = 'medication-consistency'

/**
 * Compare two healthcare documents and return review findings.
 * The documents and checklist are not modified.
 * Findings start as `open`. Review status is not decided here.
 */
export function compareDocuments(
  documentA: HealthcareDocument,
  documentB: HealthcareDocument,
  checklist: readonly ReviewChecklistItem[],
): ReviewFinding[] {
  assertComparisonInput(documentA, documentB, checklist)

  const findings: ReviewFinding[] = []

  if (isEnabled(checklist, PATIENT_IDENTITY_RULE_ID)) {
    findings.push(...comparePatientIdentity(documentA, documentB))
  }

  if (isEnabled(checklist, MEDICATION_RULE_ID)) {
    findings.push(...compareMedications(documentA, documentB))
  }

  if (isEnabled(checklist, FOLLOW_UP_RULE_ID) || isEnabled(checklist, TREATMENT_RULE_ID)) {
    findings.push(...detectMissingInformation(documentA, checklist))
    findings.push(...detectMissingInformation(documentB, checklist))
  }

  return dedupeFindings(findings)
}

/**
 * Keep the first finding for each id and append evidence that is not already cited.
 * Map insertion order makes the result stable for the same inputs.
 */
function dedupeFindings(findings: readonly ReviewFinding[]): ReviewFinding[] {
  const unique = new Map<string, ReviewFinding>()

  for (const finding of findings) {
    const existing = unique.get(finding.id)

    if (!existing) {
      unique.set(finding.id, {
        ...finding,
        evidence: [...finding.evidence],
      })
      continue
    }

    unique.set(finding.id, {
      ...existing,
      evidence: mergeEvidence(existing.evidence, finding.evidence),
    })
  }

  return [...unique.values()]
}

function mergeEvidence(
  current: readonly FindingEvidence[],
  incoming: readonly FindingEvidence[],
): FindingEvidence[] {
  const evidence = [...current]

  for (const item of incoming) {
    const alreadyCited = evidence.some(
      (entry) =>
        entry.documentId === item.documentId &&
        entry.sectionId === item.sectionId &&
        entry.excerpt === item.excerpt,
    )

    if (!alreadyCited) {
      evidence.push(item)
    }
  }

  return evidence
}
