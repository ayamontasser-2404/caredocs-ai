import { describe, expect, it } from 'vitest'
import type { HealthcareDocument } from '../../../types/document.ts'
import type { FindingEvidence, ReviewFinding } from '../../../types/review.ts'
import type { ReviewedField } from '../verification/verification-types.ts'
import { comparisonDocumentId } from '../comparison/prepare-comparison-input.ts'
import {
  countFindings,
  findingMatchesFilter,
  pageTargetForEvidence,
  presentFinding,
  type VerificationSource,
} from './present-finding.ts'

const letter = document({
  id: 'DOC-A',
  type: 'discharge-letter',
  title: 'Discharge letter',
  filename: 'letter.json',
})

const plan = document({
  id: 'DOC-B',
  type: 'medication-plan',
  title: 'Medication plan',
  filename: 'plan.json',
})

describe('presentFinding', () => {
  it('shows both values for a mismatch and does not choose one', () => {
    const presentation = presentFinding(nameFinding(), [letter, plan], [])

    expect(presentation.kindLabel).toBe('Mismatch')
    expect(presentation.fieldLabel).toBe('Patient name')
    expect(presentation.reviewLabel).toBe('Needs review')
    expect(presentation.sides.map((side) => side.comparedValue)).toEqual(['Erika Beispiel', 'Erika Beispel'])
    expect(presentation.reviewReason).toContain('Neither value is selected as correct.')
  })

  it('identifies missing information without claiming the original document omitted it', () => {
    const presentation = presentFinding(followUpFinding(), [letter, plan], [])
    const planSide = presentation.sides.find((side) => side.documentId === 'DOC-B')

    expect(presentation.kindLabel).toBe('Missing information')
    expect(presentation.fieldLabel).toBe('Follow-up')
    expect(presentation.sides[0]?.comparedValue).toBe('Hausärztliche Verlaufskontrolle empfohlen.')
    expect(planSide?.note).toBe('No matching value was in the compared data.')
    expect(planSide?.comparedValue).toBeNull()
    expect(planSide?.sourceQuotes).toEqual([])
    expect(presentation.reviewReason).toContain('does not show it was absent from the original document')
  })

  it('uses page and source text from a verified PDF field', () => {
    const pdfLetter = pdfDocument('discharge-letter', 'letter.pdf')
    const pdfPlan = pdfDocument('medication-plan', 'plan.pdf')
    const presentation = presentFinding(strengthFinding(pdfLetter.id, pdfPlan.id), [pdfLetter, pdfPlan], [
      source('discharge-letter', 'letter.pdf', [
        strengthField('40 mg', '40 mg', 'Medication: Pantoprazol 40 mg', 3, 'confirmed'),
      ]),
      source('medication-plan', 'plan.pdf', [
        strengthField('20 mg', '20 mg', 'Medication: Pantoprazol 20 mg', 1, 'confirmed'),
      ]),
    ])

    expect(presentation.sides.map((side) => side.pageLabel)).toEqual(['Page 3', 'Page 1'])
    expect(presentation.sides.map((side) => side.sourceQuotes)).toEqual([
      ['Medication: Pantoprazol 40 mg'],
      ['Medication: Pantoprazol 20 mg'],
    ])
    expect(presentation.sides.every((side) => side.verificationLabel === 'Verified against source')).toBe(true)
    expect(presentation.reviewLabel).toBe('Needs review')
  })

  it('keeps a corrected value separate from the extracted value', () => {
    const pdfLetter = pdfDocument('discharge-letter', 'letter.pdf')
    const pdfPlan = pdfDocument('medication-plan', 'plan.pdf')
    const presentation = presentFinding(strengthFinding(pdfLetter.id, pdfPlan.id, 'Pantoprazol 10 mg'), [pdfLetter, pdfPlan], [
      source('discharge-letter', 'letter.pdf', [
        strengthField('40 mg', '10 mg', 'Medication: Pantoprazol 40 mg', 3, 'confirmed', true),
      ]),
      source('medication-plan', 'plan.pdf', [
        strengthField('20 mg', '20 mg', 'Medication: Pantoprazol 20 mg', 1, 'confirmed'),
      ]),
    ])
    const corrected = presentation.sides[0]

    expect(corrected?.corrected).toBe(true)
    expect(corrected?.originalValue).toBe('40 mg')
    expect(corrected?.reviewedValue).toBe('10 mg')
    expect(corrected?.comparedValue).toBe('Pantoprazol 10 mg')
    expect(presentation.sides[1]?.corrected).toBe(false)
  })

  it('labels unverified data without treating a JSON excerpt as a page quote', () => {
    const pdfLetter = pdfDocument('discharge-letter', 'letter.pdf')
    const presentation = presentFinding(strengthFinding(pdfLetter.id, plan.id), [pdfLetter, plan], [
      source('discharge-letter', 'letter.pdf', [
        strengthField('40 mg', '40 mg', 'Medication: Pantoprazol 40 mg', 3, 'unverified'),
      ]),
    ])

    expect(presentation.sides[0]?.verificationLabel).toBe('Not yet verified')
    expect(presentation.sides[1]?.verificationLabel).toBe('Verification status unavailable')
    expect(presentation.sides[1]?.pageLabel).toBe('Page unavailable')
    expect(presentation.sides[1]?.sourceQuotes).toEqual([])
    expect(presentation.reviewReason).toContain('A compared value has not been verified.')
  })

  it('does not invent a page when the stored page is outside the document', () => {
    const pdfLetter = pdfDocument('discharge-letter', 'letter.pdf')
    const pdfPlan = pdfDocument('medication-plan', 'plan.pdf')
    const finding = strengthFinding(pdfLetter.id, pdfPlan.id)
    const sources = [
      source('discharge-letter', 'letter.pdf', [
        strengthField('40 mg', '40 mg', 'Medication: Pantoprazol 40 mg', 9, 'confirmed'),
      ]),
      source('medication-plan', 'plan.pdf', [
        strengthField('20 mg', '20 mg', 'Medication: Pantoprazol 20 mg', 0, 'confirmed'),
      ]),
    ]
    const presentation = presentFinding(finding, [pdfLetter, pdfPlan], sources)

    expect(presentation.sides.map((side) => side.pageLabel)).toEqual(['Page unavailable', 'Page unavailable'])
    expect(presentation.sides.every((side) => side.verificationLabel === 'Verification incomplete')).toBe(false)
    expect(pageTargetForEvidence(finding.evidence[0] as FindingEvidence, finding, [pdfLetter, pdfPlan], sources)).toBeNull()
  })

  it('returns a page target only for a valid cited page', () => {
    const pdfLetter = pdfDocument('discharge-letter', 'letter.pdf')
    const pdfPlan = pdfDocument('medication-plan', 'plan.pdf')
    const finding = strengthFinding(pdfLetter.id, pdfPlan.id)
    const sources = [
      source('discharge-letter', 'letter.pdf', [
        strengthField('40 mg', '40 mg', 'Medication: Pantoprazol 40 mg', 3, 'confirmed'),
      ]),
    ]

    expect(pageTargetForEvidence(finding.evidence[0] as FindingEvidence, finding, [pdfLetter, pdfPlan], sources)).toEqual({
      documentType: 'discharge-letter',
      fileName: 'letter.pdf',
      pageNumber: 3,
    })
    expect(pageTargetForEvidence(finding.evidence[1] as FindingEvidence, finding, [pdfLetter, pdfPlan], sources)).toBeNull()
  })

  it('shows a cited document that is not in the review without inventing its name', () => {
    const presentation = presentFinding(nameFinding(), [], [])

    expect(presentation.sides.map((side) => side.documentTitle)).toEqual([
      'Document unavailable',
      'Document unavailable',
    ])
    expect(presentation.sides[0]?.note).toBe('This document is not in the current review.')
  })

  it('treats a blank compared value as empty and a missing field as unavailable', () => {
    const pdfLetter = pdfDocument('discharge-letter', 'letter.pdf')
    const empty = strengthFinding(pdfLetter.id, plan.id, '')
    const presentation = presentFinding(empty, [pdfLetter, plan], [
      source('discharge-letter', 'letter.pdf', [strengthField(null, '', '', 1, 'confirmed')]),
    ])

    expect(presentation.sides[0]?.emptyValue).toBe(true)
    expect(presentation.sides[0]?.sourceQuotes).toEqual([])
    expect(presentation.sides[0]?.verificationLabel).toBe('Verification incomplete')
    expect(presentation.sides[1]?.emptyValue).toBe(false)
    expect(presentation.sides[1]?.verificationLabel).toBe('Verification status unavailable')
  })

  it('classifies a one-sided instruction as missing information', () => {
    const presentation = presentFinding(
      {
        id: 'FIND-MED-RAMIPRIL-INSTRUCTIONS',
        category: 'medication',
        severity: 'review-required',
        status: 'open',
        title: 'Abweichende Einnahmehinweise',
        description: 'Instructions were recorded on one side.',
        rationale: 'Check the source.',
        evidence: [{ documentId: letter.id, sectionId: 'medication', excerpt: 'Ramipril: Dauertherapie' }],
      },
      [letter, plan],
      [],
    )

    expect(presentation.kind).toBe('missing')
    expect(presentation.sides).toHaveLength(2)
    expect(presentation.sides[1]?.availability).toBe('not-in-compared-data')
  })

  it('counts filters from the current finding status', () => {
    const openMismatch = presentFinding(nameFinding(), [letter, plan], [])
    const reviewedMissing = presentFinding(
      { ...followUpFinding(), status: 'reviewed' },
      [letter, plan],
      [],
    )
    const resolved = presentFinding({ ...strengthFinding(letter.id, plan.id), status: 'resolved' }, [letter, plan], [])
    const counts = countFindings([openMismatch, reviewedMissing, resolved])

    expect(counts).toEqual({ all: 3, 'needs-review': 1, mismatch: 2, missing: 1, reviewed: 2 })
    expect(findingMatchesFilter(openMismatch, 'needs-review')).toBe(true)
    expect(findingMatchesFilter(reviewedMissing, 'reviewed')).toBe(true)
    expect(findingMatchesFilter(resolved, 'mismatch')).toBe(true)
    expect(findingMatchesFilter(openMismatch, 'reviewed')).toBe(false)
  })
})

function document(overrides: Pick<HealthcareDocument, 'id' | 'type' | 'title' | 'filename'>): HealthcareDocument {
  return {
    ...overrides,
    createdAt: '2026-03-14',
    patient: { patientId: 'DEMO-4711', name: 'Erika Beispiel', dateOfBirth: '1962-03-14' },
    sections: [
      { id: 'patient', title: 'Patient', content: 'Erika Beispiel' },
      { id: 'medication', title: 'Medication', content: 'Pantoprazol' },
      { id: 'follow-up', title: 'Follow-up', content: 'Hausärztliche Verlaufskontrolle empfohlen.' },
    ],
    medications: [],
    synthetic: true,
    demoNotice: 'Synthetic test document.',
  }
}

function pdfDocument(type: HealthcareDocument['type'], fileName: string): HealthcareDocument {
  return document({
    id: comparisonDocumentId(type, fileName),
    type,
    title: type === 'discharge-letter' ? 'Discharge letter' : 'Medication plan',
    filename: fileName,
  })
}

function nameFinding(): ReviewFinding {
  return {
    id: 'FIND-IDENTITY-NAME',
    category: 'patient-identity',
    severity: 'high',
    status: 'open',
    title: 'Abweichender Patientenname',
    description: 'The names differ.',
    rationale: 'Check the source.',
    evidence: [evidence(letter.id, 'patient', 'Erika Beispiel'), evidence(plan.id, 'patient', 'Erika Beispel')],
  }
}

function followUpFinding(): ReviewFinding {
  return {
    id: 'FIND-FOLLOW-UP-DATE',
    category: 'completeness',
    severity: 'review-required',
    status: 'open',
    title: 'Kein konkretes Nachsorgedatum angegeben',
    description: 'A follow-up is mentioned without a date.',
    rationale: 'Check the source.',
    evidence: [evidence(letter.id, 'follow-up', 'Hausärztliche Verlaufskontrolle empfohlen.')],
  }
}

function strengthFinding(letterId: string, planId: string, letterExcerpt = 'Pantoprazol 40 mg'): ReviewFinding {
  return {
    id: 'FIND-MED-PANTOPRAZOL-STRENGTH',
    category: 'medication',
    severity: 'high',
    status: 'open',
    title: 'Abweichende Medikamentenstärke',
    description: 'The strengths differ.',
    rationale: 'Check the source.',
    evidence: [
      evidence(letterId, 'medication', letterExcerpt),
      evidence(planId, 'medication', 'Pantoprazol 20 mg'),
    ],
  }
}

function evidence(documentId: string, sectionId: string, excerpt: string): FindingEvidence {
  return { documentId, sectionId, excerpt }
}

function source(
  type: HealthcareDocument['type'],
  fileName: string,
  fields: readonly ReviewedField[],
): VerificationSource {
  return {
    type,
    verification: {
      fileName,
      pageCount: 3,
      fields,
      eligibleForComparison: true,
      reasons: [],
    },
  }
}

function strengthField(
  originalValue: string | null,
  reviewedValue: string,
  sourceText: string,
  pageNumber: number,
  verification: ReviewedField['verification'],
  modified = false,
): ReviewedField {
  return {
    path: 'medications.0.strength',
    label: 'Medication 1 strength',
    required: true,
    extracted: { status: 'missing' },
    originalValue,
    initialValue: originalValue,
    reviewedValue,
    modified,
    verification,
    normalizedValue: null,
    structural: [],
    uncertainty: [],
    evidencePageNumbers: [pageNumber],
    sourceText: sourceText.length > 0 ? [sourceText] : [],
    textSource: 'embedded',
    ocrConfidence: null,
    canConfirm: verification === 'unverified',
  }
}
