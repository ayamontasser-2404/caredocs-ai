import { describe, expect, it, vi } from 'vitest'
import { reviewChecklist } from '../../../data/reviewChecklist.ts'
import { sampleDischargeLetter } from '../../../data/sampleDischargeLetter.ts'
import { sampleMedicationPlan } from '../../../data/sampleMedicationPlan.ts'
import {
  acceptDocument,
  beginCompare,
  beginExtraction,
  completeCompare,
  confirmReviewedField,
  editReviewedField,
  finishExtraction,
  initialWorkspace,
  requestCompare,
} from '../../../components/layout/workspace.ts'
import { extractDocumentData } from '../extraction/extract-document-data.ts'
import type { ExtractedPdfPage, PdfTextExtractionResult } from '../extraction/extraction-types.ts'
import { confirmReviewedField as confirmField, createDocumentVerification } from '../verification/review-extracted-document.ts'
import { editReviewedValue } from '../verification/review-extracted-document.ts'
import type { DocumentVerification } from '../verification/verification-types.ts'
import * as comparison from './compare-documents.ts'
import { prepareComparisonInput, type ComparisonSlot } from './prepare-comparison-input.ts'

describe('prepareComparisonInput', () => {
  it('passes stored JSON documents to the existing comparison unchanged', () => {
    const prepared = prepareComparisonInput(jsonSlot(sampleDischargeLetter), jsonSlot(sampleMedicationPlan))

    expect(prepared.status).toBe('eligible')
    if (prepared.status !== 'eligible') {
      return
    }

    expect(prepared.letter).toBe(sampleDischargeLetter)
    expect(prepared.plan).toBe(sampleMedicationPlan)
    expect(comparison.compareDocuments(prepared.letter, prepared.plan, reviewChecklist)).toEqual(
      comparison.compareDocuments(sampleDischargeLetter, sampleMedicationPlan, reviewChecklist),
    )
  })

  it('blocks an unverified PDF without calling the comparison for that pair', () => {
    const prepared = prepareComparisonInput(pdfSlot('letter.pdf', verifiedLines('40 mg'), false), jsonSlot(sampleMedicationPlan))

    expect(prepared.status).toBe('ineligible')
    if (prepared.status !== 'ineligible') {
      return
    }

    expect(prepared.reasons.map((reason) => reason.code)).toContain('DOCUMENT_NOT_VERIFIED')
    expect(prepared.reasons.some((reason) => reason.message.includes('Erika'))).toBe(false)
  })

  it('blocks a missing document with a typed reason', () => {
    const prepared = prepareComparisonInput(jsonSlot(sampleDischargeLetter), { document: null, verification: null })

    expect(prepared).toMatchObject({
      status: 'ineligible',
      reasons: [{ code: 'DOCUMENT_MISSING', document: 'medication-plan', message: 'Medication plan is missing.' }],
    })
  })

  it('compares confirmed PDF fields with the existing identity and medication checks', () => {
    const letter = pdfSlot('letter.pdf', verifiedLines('40 mg'))
    const plan = pdfSlot('plan.pdf', verifiedLines('20 mg'))
    const prepared = prepareComparisonInput(letter, plan)

    expect(prepared.status).toBe('eligible')
    if (prepared.status !== 'eligible') {
      return
    }

    expect(prepared.letter.patient.name).toBe('Erika Beispiel')
    expect(prepared.plan.patient.name).toBe('Erika Beispiel')
    expect(prepared.letter.medications[0]?.strength).toBe('40 mg')
    expect(prepared.plan.medications[0]?.strength).toBe('20 mg')
    expect(prepared.letter.medications[0]?.dosage).toBe('')
    expect(prepared.letter.patient.patientId).toBe('')
    expect(prepared.letter.id).not.toBe(prepared.plan.id)

    const findings = comparison.compareDocuments(prepared.letter, prepared.plan, reviewChecklist)
    expect(findings.map((finding) => finding.id)).toEqual(['FIND-MED-PANTOPRAZOL-STRENGTH'])
    expect(prepared.letter.sections.find((section) => section.id === 'medication')?.content).toContain(
      'Medication: Pantoprazol 40 mg',
    )
    expect(prepared.letter.sections.find((section) => section.id === 'medication')?.content).toContain(
      'Confirmed Medication 1 strength: 40 mg',
    )
    expect(letter.verification?.fields.find((field) => field.path === 'medications.0.strength')?.extracted).toMatchObject({
      status: 'found',
      sourceValue: '40 mg',
    })
  })

  it('keeps a reviewer correction distinct from the extracted strength', () => {
    const letter = pdfSlot('letter.pdf', verifiedLines('40 mg'), true, (verification) =>
      confirmField(editReviewedValue(verification, 'medications.0.strength', '20 mg'), 'medications.0.strength'),
    )
    const plan = pdfSlot('plan.pdf', verifiedLines('40 mg'))
    const prepared = prepareComparisonInput(letter, plan)

    expect(prepared.status).toBe('eligible')
    if (prepared.status !== 'eligible') {
      return
    }

    expect(prepared.letter.medications[0]?.strength).toBe('20 mg')
    expect(letter.verification?.fields.find((field) => field.path === 'medications.0.strength')).toMatchObject({
      originalValue: '40 mg',
      reviewedValue: '20 mg',
    })
    expect(comparison.compareDocuments(prepared.letter, prepared.plan, reviewChecklist).map((finding) => finding.id)).toEqual([
      'FIND-MED-PANTOPRAZOL-STRENGTH',
    ])
  })

  it('does not block when dosage and patient id were not in the text', () => {
    const prepared = prepareComparisonInput(pdfSlot('letter.pdf', verifiedLines('40 mg')), pdfSlot('plan.pdf', verifiedLines('40 mg')))

    expect(prepared.status).toBe('eligible')
    if (prepared.status !== 'eligible') {
      return
    }

    expect(comparison.compareDocuments(prepared.letter, prepared.plan, reviewChecklist)).toEqual([])
  })

  it('blocks an unresolved strength and an invalid date', () => {
    const ambiguous = pdfSlot(
      'letter.pdf',
      ['Patient name: Erika Beispiel', 'Date of birth: 12 March 1980', 'Medication: Pantoprazol 40 mg', 'Medication: Pantoprazol 20 mg'],
      false,
    )
    const invalid = pdfSlot('plan.pdf', verifiedLines('40 mg'), true, (verification) =>
      editReviewedValue(verification, 'patient.dateOfBirth', '03/04/1962'),
    )

    const ambiguousResult = prepareComparisonInput(ambiguous, jsonSlot(sampleMedicationPlan))
    expect(ambiguousResult.status).toBe('ineligible')
    if (ambiguousResult.status === 'ineligible') {
      expect(ambiguousResult.reasons.some((reason) => reason.code === 'UNRESOLVED_AMBIGUITY')).toBe(true)
    }
    const invalidResult = prepareComparisonInput(jsonSlot(sampleDischargeLetter), invalid)
    expect(invalidResult.status).toBe('ineligible')
    if (invalidResult.status === 'ineligible') {
      expect(invalidResult.reasons.some((reason) => reason.code === 'VALIDATION_ERRORS')).toBe(true)
      expect(invalidResult.reasons.some((reason) => reason.message.includes('03/04'))).toBe(false)
    }
  })

  it('blocks an extracted follow-up that has not been confirmed and still runs the follow-up check after confirmation', () => {
    const unconfirmed = pdfSlot('letter.pdf', [...verifiedLines('40 mg'), 'Follow-up: Verlaufskontrolle empfohlen.'], true, (verification) => {
      const followUp = verification.fields.find((field) => field.path === 'followUp.instructions')
      if (!followUp) {
        throw new Error('Expected follow-up instructions.')
      }
      return {
        ...verification,
        fields: verification.fields.map((field) =>
          field.path === 'followUp.instructions' ? { ...field, verification: 'unverified' as const } : field,
        ),
        eligibleForComparison: true,
        reasons: [],
      }
    })
    expect(prepareComparisonInput(unconfirmed, pdfSlot('plan.pdf', verifiedLines('40 mg'))).status).toBe('ineligible')

    const confirmed = pdfSlot('letter.pdf', [...verifiedLines('40 mg'), 'Follow-up: Verlaufskontrolle empfohlen.'])
    const prepared = prepareComparisonInput(confirmed, pdfSlot('plan.pdf', verifiedLines('40 mg')))
    expect(prepared.status).toBe('eligible')
    if (prepared.status !== 'eligible') {
      return
    }

    expect(comparison.compareDocuments(prepared.letter, prepared.plan, reviewChecklist).map((finding) => finding.id)).toContain(
      'FIND-FOLLOW-UP-DATE',
    )
  })

  it('does not call the comparison engine for an ineligible pair and clears stale findings after an edit', () => {
    const spy = vi.spyOn(comparison, 'compareDocuments')
    let state = acceptDocument(
      initialWorkspace(),
      'medication-plan',
      sampleMedicationPlan,
      sampleMedicationPlan.filename,
      true,
    )
    state = beginExtraction(state, 'discharge-letter', 'letter.pdf')
    state = finishExtraction(state, 'discharge-letter', textResult('letter.pdf', verifiedLines('40 mg')))
    state = requestCompare(state)

    expect(state.phase).toBe('blocked')
    expect(completeCompare(state, reviewChecklist).phase).toBe('blocked')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()

    state = confirmReady(state, 'discharge-letter')
    state = beginCompare(requestCompare(state))
    state = completeCompare(state, reviewChecklist)
    expect(state.phase).toBe('ready')
    expect(state.review?.findings.length).toBeGreaterThan(0)

    state = editReviewedField(state, 'discharge-letter', 'patient.name', 'Erika Geändert')
    expect(state.phase).toBe('idle')
    expect(state.review).toBeNull()
    expect(state.comparedDocuments).toBeNull()
  })
})

function jsonSlot(document: ComparisonSlot['document']): ComparisonSlot {
  return { document, verification: null }
}

function verifiedLines(strength: string): string[] {
  return ['Patient name: Erika Beispiel', 'Date of birth: 12 March 1980', `Medication: Pantoprazol ${strength}`]
}

function pdfSlot(
  fileName: string,
  lines: readonly string[],
  confirm = true,
  edit?: (verification: DocumentVerification) => DocumentVerification,
): ComparisonSlot {
  const result = textResult(fileName, lines)
  const structured = extractDocumentData(result)
  let verification = createDocumentVerification(structured, result.pages, result.pageCount)
  if (confirm) {
    verification = verification.fields.reduce((current, field) => confirmField(current, field.path), verification)
  }
  if (edit) {
    verification = edit(verification)
  }

  return { document: null, verification }
}

function confirmReady(
  state: ReturnType<typeof initialWorkspace>,
  type: 'discharge-letter' | 'medication-plan',
) {
  const verification = (type === 'discharge-letter' ? state.letter : state.plan).extraction.verification
  return (verification?.fields ?? []).reduce(
    (current, field) => confirmReviewedField(current, type, field.path),
    state,
  )
}

function textResult(fileName: string, lines: readonly string[]): PdfTextExtractionResult {
  const pages: ExtractedPdfPage[] = lines.map((text, index) => ({
    pageNumber: index + 1,
    text,
    method: 'embedded',
  }))

  return {
    fileName,
    pageCount: pages.length,
    pages,
    fullText: lines.join('\n'),
    hasExtractableText: true,
    source: 'embedded',
  }
}
