import { describe, expect, it } from 'vitest'
import type {
  ExtractedDocumentFields,
  ExtractedField,
  ExtractedPdfPage,
  StructuredDocumentExtraction,
} from '../extraction/extraction-types.ts'
import {
  confirmReviewedField,
  createDocumentVerification,
  editReviewedValue,
} from './review-extracted-document.ts'

const pages: ExtractedPdfPage[] = [{ pageNumber: 1, text: 'Patient name: Erika Beispiel', method: 'embedded' }]

describe('createDocumentVerification', () => {
  it('accepts a complete extracted document and leaves every field unverified', () => {
    const verification = createDocumentVerification(extraction(completeFields()), pages, 1)

    expect(verification.eligibleForComparison).toBe(false)
    expect(verification.fields.find((field) => field.path === 'patient.name')).toMatchObject({
      verification: 'unverified',
      originalValue: 'Erika Beispiel',
      reviewedValue: 'Erika Beispiel',
      structural: [],
    })
    expect(verification.reasons).toContain('Patient name has not been confirmed.')
    expect(verification.reasons).toContain('Date of birth has not been confirmed.')
  })

  it('reports a missing required name and allows a missing patient id', () => {
    const fields = completeFields()
    fields.patient.name = { status: 'missing' }
    fields.patient.patientId = { status: 'missing' }
    const verification = createDocumentVerification(extraction(fields), pages, 1)

    expect(verification.reasons).toContain('Patient name was not found.')
    expect(verification.fields.some((field) => field.path === 'patient.patientId')).toBe(false)
    expect(verification.eligibleForComparison).toBe(false)
  })

  it('flags an ambiguous date without choosing an ISO value', () => {
    const fields = completeFields()
    fields.patient.dateOfBirth = {
      status: 'unparsed',
      evidence: [
        {
          pageNumber: 1,
          text: 'Date of birth: 03/04/1962',
          method: 'rule-based',
          textSource: 'embedded',
        },
      ],
    }
    const verification = createDocumentVerification(extraction(fields), pages, 1)
    const dateOfBirth = verification.fields.find((field) => field.path === 'patient.dateOfBirth')

    expect(dateOfBirth?.normalizedValue).toBeNull()
    expect(dateOfBirth?.reviewedValue).toBe('')
    expect(dateOfBirth?.uncertainty.map((issue) => issue.message)).toContain(
      'The labeled text could not be read confidently.',
    )
    expect(JSON.stringify(dateOfBirth)).not.toContain('1962-04-03')
    expect(JSON.stringify(dateOfBirth)).not.toContain('1962-03-04')

    const edited = editReviewedValue(verification, 'patient.dateOfBirth', '03/04/1962')
    const corrected = edited.fields.find((field) => field.path === 'patient.dateOfBirth')
    expect(corrected?.normalizedValue).toBeNull()
    expect(corrected?.structural.map((issue) => issue.message)).toContain(
      'This date could not be read unambiguously.',
    )
    expect(JSON.stringify(corrected)).not.toContain('1962-04-03')
    expect(JSON.stringify(corrected)).not.toContain('1962-03-04')
  })

  it('keeps OCR uncertainty separate from structural validation', () => {
    const fields = completeFields()
    fields.patient.name = found('Erika Beispiel', null, 1, 'ocr')
    const verification = createDocumentVerification(
      extraction(fields),
      [{ pageNumber: 1, text: 'Patient name: Erika Beispiel', method: 'ocr', confidence: 81 }],
      1,
    )
    const name = verification.fields.find((field) => field.path === 'patient.name')

    expect(name?.structural).toEqual([])
    expect(name?.uncertainty.map((issue) => issue.message)).toContain('This value was read from a scanned page.')
    expect(name?.ocrConfidence).toBe(81)
    expect(name?.verification).toBe('unverified')
    expect(name?.textSource).toBe('ocr')
  })

  it('does not become eligible when required fields are valid but unconfirmed', () => {
    const verification = confirmAll(createDocumentVerification(extraction(completeFields()), pages, 1), [
      'patient.name',
    ])

    expect(verification.fields.find((field) => field.path === 'patient.name')?.verification).toBe('confirmed')
    expect(verification.fields.find((field) => field.path === 'patient.dateOfBirth')?.verification).toBe('unverified')
    expect(verification.eligibleForComparison).toBe(false)
  })

  it('becomes eligible when required fields are confirmed and optional dosage is absent', () => {
    const verification = confirmAll(createDocumentVerification(extraction(completeFields()), pages, 1), [
      'patient.name',
      'patient.dateOfBirth',
      'medications.0.name',
      'medications.0.strength',
    ])

    expect(verification.fields.some((field) => field.path === 'medications.0.dosage')).toBe(false)
    expect(verification.eligibleForComparison).toBe(true)
    expect(verification.reasons).toEqual([])
  })

  it('preserves the extracted strength when the reviewer corrects it', () => {
    let verification = createDocumentVerification(extraction(completeFields()), pages, 1)
    verification = editReviewedValue(verification, 'medications.0.strength', '4O mg')
    const corrected = verification.fields.find((field) => field.path === 'medications.0.strength')

    expect(corrected?.extracted).toMatchObject({ status: 'found', sourceValue: '40 mg' })
    expect(corrected?.originalValue).toBe('40 mg')
    expect(corrected?.reviewedValue).toBe('4O mg')
    expect(corrected?.modified).toBe(true)
    expect(corrected?.verification).toBe('unverified')
    expect(corrected?.sourceText).toEqual(['Medication: Pantoprazol 40 mg'])
    expect(corrected?.structural.map((issue) => issue.message)).toContain(
      'Strength must be a number followed by a unit, such as 40 mg.',
    )
    expect(verification.eligibleForComparison).toBe(false)
  })

  it('revalidates a correction and confirms it without replacing the extraction', () => {
    let verification = createDocumentVerification(extraction(completeFields()), pages, 1)
    verification = editReviewedValue(verification, 'medications.0.strength', '20 mg')
    verification = confirmReviewedField(verification, 'medications.0.strength')
    const strength = verification.fields.find((field) => field.path === 'medications.0.strength')

    expect(strength).toMatchObject({
      originalValue: '40 mg',
      reviewedValue: '20 mg',
      modified: true,
      verification: 'confirmed',
      structural: [],
    })
    expect(strength?.extracted).toMatchObject({ status: 'found', sourceValue: '40 mg' })
  })

  it('does not confirm an invalid correction', () => {
    let verification = createDocumentVerification(extraction(completeFields()), pages, 1)
    verification = editReviewedValue(verification, 'patient.dateOfBirth', '03/04/1962')
    verification = confirmReviewedField(verification, 'patient.dateOfBirth')
    const dateOfBirth = verification.fields.find((field) => field.path === 'patient.dateOfBirth')

    expect(dateOfBirth?.verification).toBe('unverified')
    expect(dateOfBirth?.canConfirm).toBe(false)
    expect(dateOfBirth?.normalizedValue).toBeNull()
    expect(verification.eligibleForComparison).toBe(false)
  })

  it('blocks a required field that has no source text', () => {
    const fields = completeFields()
    fields.patient.name = {
      status: 'found',
      sourceValue: 'Erika Beispiel',
      normalizedValue: null,
      evidence: [],
    }
    let verification = createDocumentVerification(extraction(fields), pages, 1)
    verification = confirmReviewedField(verification, 'patient.name')

    expect(verification.fields.find((field) => field.path === 'patient.name')?.verification).toBe('confirmed')
    expect(verification.reasons).toContain('Patient name has no source text.')
    expect(verification.eligibleForComparison).toBe(false)
  })

  it('flags a page number that is not in the document', () => {
    const fields = completeFields()
    fields.patient.name = found('Erika Beispiel', null, 4)
    const verification = createDocumentVerification(extraction(fields), pages, 1)
    const name = verification.fields.find((field) => field.path === 'patient.name')

    expect(name?.structural.map((issue) => issue.message)).toContain('The source page is not in this document.')
    expect(verification.eligibleForComparison).toBe(false)
  })

  it('keeps an ambiguous strength unresolved until the reviewer confirms one value', () => {
    const fields = completeFields()
    const medication = fields.medications[0]
    if (!medication) {
      throw new Error('Expected a medication in the synthetic extraction.')
    }
    fields.medications = [
      {
        ...medication,
        strength: {
          status: 'ambiguous',
          candidates: [
            {
              sourceValue: '40 mg',
              normalizedValue: null,
              evidence: evidence('Medication: Pantoprazol 40 mg', 1),
            },
            {
              sourceValue: '20 mg',
              normalizedValue: null,
              evidence: evidence('Medication: Pantoprazol 20 mg', 1),
            },
          ],
        },
      },
    ]
    let verification = createDocumentVerification(extraction(fields), pages, 1)
    const before = verification.fields.find((field) => field.path === 'medications.0.strength')
    expect(before?.reviewedValue).toBe('')
    expect(before?.uncertainty.map((issue) => issue.message)).toContain(
      'More than one value was extracted. No value was selected.',
    )
    expect(JSON.stringify(before?.normalizedValue)).not.toContain('40')

    verification = editReviewedValue(verification, 'medications.0.strength', '40 mg')
    verification = confirmReviewedField(verification, 'medications.0.strength')
    const after = verification.fields.find((field) => field.path === 'medications.0.strength')

    expect(after?.extracted.status).toBe('ambiguous')
    expect(after?.reviewedValue).toBe('40 mg')
    expect(after?.verification).toBe('confirmed')
    expect(after?.sourceText).toEqual(['Medication: Pantoprazol 40 mg', 'Medication: Pantoprazol 20 mg'])
  })

  it('lets an optional invalid follow-up block eligibility and an absent dosage stay absent', () => {
    let verification = confirmAll(createDocumentVerification(extraction(completeFields()), pages, 1), [
      'patient.name',
      'patient.dateOfBirth',
      'medications.0.name',
      'medications.0.strength',
    ])
    expect(verification.eligibleForComparison).toBe(true)

    verification = editReviewedValue(verification, 'followUp.date', '03/04/1962')
    expect(verification.eligibleForComparison).toBe(false)
    expect(verification.reasons.some((reason) => reason.startsWith('Follow-up date:'))).toBe(true)
  })

  it('returns no eligible fields when extraction produced no data', () => {
    const verification = createDocumentVerification(
      { fileName: 'scan.pdf', source: 'ocr', outcome: 'unsupported', data: null },
      [],
      0,
    )

    expect(verification.eligibleForComparison).toBe(false)
    expect(verification.reasons).toEqual(['Structured extraction could not read this result.'])
  })
})

function confirmAll(verification: ReturnType<typeof createDocumentVerification>, paths: readonly string[]) {
  return paths.reduce((current, path) => confirmReviewedField(current, path), verification)
}

function extraction(data: ExtractedDocumentFields): StructuredDocumentExtraction {
  return { fileName: 'letter.pdf', source: 'embedded', outcome: 'completed', data }
}

function completeFields(): ExtractedDocumentFields {
  return {
    patient: {
      patientId: { status: 'missing' },
      name: found('Erika Beispiel'),
      dateOfBirth: found('12 March 1980', '1980-03-12'),
    },
    documentType: { status: 'missing' },
    documentDate: { status: 'missing' },
    dischargeDate: { status: 'missing' },
    medications: [
      {
        name: found('Pantoprazol', null, 1),
        strength: {
          status: 'found',
          sourceValue: '40 mg',
          normalizedValue: null,
          evidence: [evidence('Medication: Pantoprazol 40 mg', 1)],
        },
        dosage: { status: 'missing' },
        instructions: { status: 'missing' },
        route: { status: 'missing' },
        frequency: { status: 'missing' },
        startDate: { status: 'missing' },
        endDate: { status: 'missing' },
      },
    ],
    followUp: {
      date: found('15 November 2026', '2026-11-15'),
      instructions: { status: 'missing' },
    },
    treatment: { status: 'missing' },
    unparsed: [],
  }
}

function found(
  source: string,
  normalized: string | null = null,
  pageNumber = 1,
  textSource: 'embedded' | 'ocr' = 'embedded',
): ExtractedField {
  return {
    status: 'found',
    sourceValue: source,
    normalizedValue: normalized,
    evidence: [{ ...evidence(source, pageNumber), textSource }],
  }
}

function evidence(text: string, pageNumber: number) {
  return { pageNumber, text, method: 'rule-based' as const, textSource: 'embedded' as const }
}
