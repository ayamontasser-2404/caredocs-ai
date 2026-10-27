import type { HealthcareDocument } from '../../../types/document.ts'
import type { ReviewChecklistItem, ReviewFinding } from '../../../types/review.ts'
import { normalizeText } from './normalize.ts'

export const FOLLOW_UP_RULE_ID = 'follow-up-documentation'
export const TREATMENT_RULE_ID = 'treatment-documentation'

const FOLLOW_UP_SECTION_ID = 'follow-up'
const TREATMENT_SECTION_ID = 'treatment'

/**
 * A concrete calendar date. Written German month names count; a sentence that
 * only says a date is missing does not.
 */
const DATE_PATTERN =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{1,2}\.\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+\d{4}\b/

const FOLLOW_UP_RECOMMENDATION = /verlaufskontrolle empfohlen|kontrolle empfohlen|nachsorge empfohlen/

/**
 * Prototype rule tied to the synthetic discharge letter.
 * It flags that explicit generic sentence only. It does not judge whether treatment was appropriate.
 */
const GENERIC_TREATMENT_PHRASE = 'ärztlich festgelegte behandlung'
const CONCRETE_TREATMENT_DETAIL =
  /\b\d+\s?(mg|ml|g|µg|ug)\b|\b(behandlungsdauer|wirkstoff|prozedur|intervention)\b/

/**
 * Documentation prompts for enabled checklist rules.
 * A missing detail is a review prompt, not a confirmed clinical error.
 */
export function detectMissingInformation(
  document: HealthcareDocument,
  checklist: readonly ReviewChecklistItem[],
): ReviewFinding[] {
  const findings: ReviewFinding[] = []

  if (isEnabled(checklist, FOLLOW_UP_RULE_ID)) {
    const followUp = followUpFinding(document)
    if (followUp) {
      findings.push(followUp)
    }
  }

  if (isEnabled(checklist, TREATMENT_RULE_ID)) {
    const treatment = treatmentFinding(document)
    if (treatment) {
      findings.push(treatment)
    }
  }

  return findings
}

export function isEnabled(checklist: readonly ReviewChecklistItem[], id: string): boolean {
  return checklist.some((item) => item.id === id && item.enabled)
}

function followUpFinding(document: HealthcareDocument): ReviewFinding | undefined {
  const section = document.sections.find((item) => item.id === FOLLOW_UP_SECTION_ID)
  if (!section) {
    return undefined
  }

  const recommendation = recommendationSentence(section.content)
  if (!recommendation || hasConcreteDate(normalizeText(section.content))) {
    return undefined
  }

  return {
    id: 'FIND-FOLLOW-UP-DATE',
    category: 'completeness',
    severity: 'review-required',
    status: 'open',
    title: 'Kein konkretes Nachsorgedatum angegeben',
    description:
      'Eine Nachsorge oder Verlaufskontrolle wird empfohlen, aber ein konkretes Datum ist nicht dokumentiert.',
    rationale:
      'Die prüfende Person muss anhand der geltenden Prüfrichtlinie entscheiden, ob ein konkretes Datum erforderlich ist.',
    evidence: [
      {
        documentId: document.id,
        sectionId: section.id,
        excerpt: recommendation,
      },
    ],
  }
}

function treatmentFinding(document: HealthcareDocument): ReviewFinding | undefined {
  const section = document.sections.find((item) => item.id === TREATMENT_SECTION_ID)
  if (!section) {
    return undefined
  }

  const normalized = normalizeText(section.content)
  const generic = normalized.includes(GENERIC_TREATMENT_PHRASE)
  const concrete = CONCRETE_TREATMENT_DETAIL.test(normalized) || hasConcreteDate(normalized)

  if (!generic || concrete) {
    return undefined
  }

  return {
    id: 'FIND-TREATMENT-GENERIC',
    category: 'documentation',
    severity: 'informational',
    status: 'open',
    title: 'Therapiedokumentation prüfen',
    description:
      'Der Therapieverlauf wird allgemein beschrieben; konkrete Behandlungsdetails sind nicht enthalten.',
    rationale:
      'Die prüfende Person muss anhand der projektspezifischen Prüfrichtlinie entscheiden, ob weitere Angaben erforderlich sind.',
    evidence: [
      {
        documentId: document.id,
        sectionId: section.id,
        excerpt: sentenceContaining(section.content, new RegExp(GENERIC_TREATMENT_PHRASE, 'i')),
      },
    ],
  }
}

const NEGATED_FOLLOW_UP =
  /keine\s+(?:verlaufs)?kontrolle\s+empfohlen|keine\s+nachsorge\s+empfohlen/

function hasConcreteDate(normalizedContent: string): boolean {
  return DATE_PATTERN.test(normalizedContent)
}

function recommendationSentence(content: string): string | undefined {
  return content
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => {
      const normalized = normalizeText(sentence)
      return FOLLOW_UP_RECOMMENDATION.test(normalized) && !NEGATED_FOLLOW_UP.test(normalized)
    })
}

function sentenceContaining(content: string, pattern: RegExp): string {
  const match = content
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => pattern.test(normalizeText(sentence)))

  return match ?? content.trim()
}
