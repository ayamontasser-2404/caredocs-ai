import { describe, expect, it } from 'vitest'
import { extractDocumentData } from './extract-document-data.ts'
import type { ExtractedField, ExtractedPdfPage, PdfTextExtractionResult } from './extraction-types.ts'

describe('extractDocumentData', () => {
  it('extracts a patient name and keeps the labeled source text', () => {
    const result = extractDocumentData(textResult(['Patient name: Erika Beispiel']))
    const name = result.data?.patient.name

    expect(result.outcome).toBe('completed')
    expect(name).toMatchObject({ status: 'found', sourceValue: 'Erika Beispiel', normalizedValue: null })
    expect(evidence(name)).toEqual([
      { pageNumber: 1, text: 'Patient name: Erika Beispiel', method: 'rule-based', textSource: 'embedded' },
    ])
  })

  it('normalizes an English date of birth and keeps the source wording', () => {
    const result = extractDocumentData(textResult(['Date of birth: 12 March 1980']))
    const dateOfBirth = result.data?.patient.dateOfBirth

    expect(dateOfBirth).toMatchObject({
      status: 'found',
      sourceValue: '12 March 1980',
      normalizedValue: '1980-03-12',
    })
    expect(evidence(dateOfBirth)[0]?.text).toBe('Date of birth: 12 March 1980')
  })

  it('normalizes a German dotted date of birth as day, month, year', () => {
    const result = extractDocumentData(
      textResult(['Patienten-ID: DEMO-4711. Name: Erika Beispel. Geburtsdatum: 14.03.1962.']),
    )

    expect(result.data?.patient.patientId).toMatchObject({ status: 'found', sourceValue: 'DEMO-4711' })
    expect(result.data?.patient.name).toMatchObject({ status: 'found', sourceValue: 'Erika Beispel' })
    expect(evidence(result.data?.patient.name)[0]?.text).toBe('Name: Erika Beispel')
    expect(result.data?.patient.dateOfBirth).toMatchObject({
      status: 'found',
      sourceValue: '14.03.1962',
      normalizedValue: '1962-03-14',
    })
  })

  it('reads a medication name and strength without treating the strength as a dose', () => {
    const result = extractDocumentData(
      textResult(['Medication: Pantoprazol 40 mg', 'Instruction: Take one tablet in the morning.']),
    )
    const medication = result.data?.medications[0]

    expect(result.outcome).toBe('completed')
    expect(medication?.name).toMatchObject({ status: 'found', sourceValue: 'Pantoprazol' })
    expect(medication?.strength).toMatchObject({ status: 'found', sourceValue: '40 mg' })
    expect(medication?.dosage.status).toBe('missing')
    expect(medication?.instructions).toMatchObject({
      status: 'found',
      sourceValue: 'Take one tablet in the morning',
    })
    expect(evidence(medication?.strength)[0]?.text).toBe('Medication: Pantoprazol 40 mg')
  })

  it('keeps an explicit dosage separate from strength, route, and frequency', () => {
    const result = extractDocumentData(
      textResult([
        'Medication: Ramipril 5 mg',
        'Dosage: 1 Tablette morgens',
        'Route: oral',
        'Frequency: einmal täglich',
      ]),
    )
    const medication = result.data?.medications[0]

    expect(medication?.strength).toMatchObject({ status: 'found', sourceValue: '5 mg' })
    expect(medication?.dosage).toMatchObject({ status: 'found', sourceValue: '1 Tablette morgens' })
    expect(medication?.route).toMatchObject({ status: 'found', sourceValue: 'oral' })
    expect(medication?.frequency).toMatchObject({ status: 'found', sourceValue: 'einmal täglich' })
  })

  it('normalizes a follow-up date and leaves instructions missing when none were written', () => {
    const result = extractDocumentData(textResult(['Follow-up: 15 November 2026']))

    expect(result.data?.followUp.date).toMatchObject({
      status: 'found',
      sourceValue: '15 November 2026',
      normalizedValue: '2026-11-15',
    })
    expect(result.data?.followUp.instructions.status).toBe('missing')
    expect(result.data?.dischargeDate.status).toBe('missing')
  })

  it('keeps a follow-up instruction that is not a date', () => {
    const result = extractDocumentData(textResult(['Nachsorge: Hausärztliche Verlaufskontrolle empfohlen']))

    expect(result.data?.followUp.date.status).toBe('missing')
    expect(result.data?.followUp.instructions).toMatchObject({
      status: 'found',
      sourceValue: 'Hausärztliche Verlaufskontrolle empfohlen',
    })
  })

  it('leaves a missing date of birth missing', () => {
    const result = extractDocumentData(textResult(['Patient name: Erika Beispiel']))

    expect(result.data?.patient.name.status).toBe('found')
    expect(result.data?.patient.dateOfBirth.status).toBe('missing')
    expect(result.data?.patient.patientId.status).toBe('missing')
    expect(JSON.stringify(result)).not.toContain('1980')
    expect(JSON.stringify(result)).not.toContain('1962')
  })

  it('does not normalize a numeric date that can be read in two orders', () => {
    const result = extractDocumentData(textResult(['Date of birth: 03/04/1962']))
    const dateOfBirth = result.data?.patient.dateOfBirth

    expect(result.outcome).toBe('partial')
    expect(dateOfBirth?.status).toBe('unparsed')
    expect(JSON.stringify(dateOfBirth)).not.toContain('1962-03-04')
    expect(JSON.stringify(dateOfBirth)).not.toContain('1962-04-03')
    expect(evidence(dateOfBirth)[0]?.text).toBe('Date of birth: 03/04/1962')
  })

  it('does not choose between conflicting medication strengths', () => {
    const result = extractDocumentData(
      textResult(['Medication: Pantoprazol 40 mg', 'Medication: Pantoprazol 20 mg']),
    )
    const strength = result.data?.medications[0]?.strength

    expect(result.data?.medications).toHaveLength(1)
    expect(result.outcome).toBe('partial')
    expect(strength?.status).toBe('ambiguous')
    if (strength?.status === 'ambiguous') {
      expect(strength.candidates.map((candidate) => candidate.sourceValue)).toEqual(['40 mg', '20 mg'])
      expect(strength.candidates.map((candidate) => candidate.evidence.pageNumber)).toEqual([1, 2])
    }
  })

  it('keeps the page number for a value that comes from a later page', () => {
    const result = extractDocumentData(
      textResult(['Patient name: Erika Beispiel', 'Medication: Pantoprazol 40 mg, 1 Tablette morgens']),
    )
    const medication = result.data?.medications[0]

    expect(evidence(result.data?.patient.name)[0]?.pageNumber).toBe(1)
    expect(evidence(medication?.name)[0]?.pageNumber).toBe(2)
    expect(medication?.dosage).toMatchObject({ status: 'found', sourceValue: '1 Tablette morgens' })
    expect(evidence(medication?.dosage)[0]?.text).toBe('Medication: Pantoprazol 40 mg, 1 Tablette morgens')
  })

  it('reads OCR text through the same rules and records that text source', () => {
    const result = extractDocumentData({
      fileName: 'scan.pdf',
      pageCount: 1,
      pages: [{ pageNumber: 3, text: 'Patient name: Erika Beispiel', method: 'ocr', confidence: 81 }],
      fullText: 'Patient name: Erika Beispiel',
      hasExtractableText: true,
      source: 'ocr',
    })

    expect(result.source).toBe('ocr')
    expect(result.data?.patient.name).toMatchObject({ status: 'found', sourceValue: 'Erika Beispiel' })
    expect(evidence(result.data?.patient.name)).toEqual([
      { pageNumber: 3, text: 'Patient name: Erika Beispiel', method: 'rule-based', textSource: 'ocr' },
    ])
  })

  it('returns no fields for prose that has no supported label', () => {
    const result = extractDocumentData(
      textResult(['Die Patientin wurde aufgenommen. Die Dosis im Verlauf betrug 40 mg.']),
    )

    expect(result.outcome).toBe('no-fields')
    expect(result.data?.medications).toEqual([])
    expect(result.data?.patient.name.status).toBe('missing')
    expect(result.data?.treatment.status).toBe('missing')
  })

  it('returns unsupported for malformed input without throwing', () => {
    expect(extractDocumentData(null).outcome).toBe('unsupported')
    expect(extractDocumentData({ fileName: 'bad.pdf', pages: [{ pageNumber: 0, text: 'Name: Erika' }] }).data).toBeNull()
    expect(extractDocumentData({ fileName: 'bad.pdf', pages: [{ pageNumber: 1, text: 12 }] }).outcome).toBe('unsupported')
  })

  it('reads a bare medication line and does not invent a dosage', () => {
    const result = extractDocumentData(textResult(['Pantoprazol 40 mg']))
    const medication = result.data?.medications[0]

    expect(medication?.name).toMatchObject({ status: 'found', sourceValue: 'Pantoprazol' })
    expect(medication?.strength).toMatchObject({ status: 'found', sourceValue: '40 mg' })
    expect(medication?.dosage.status).toBe('missing')
  })

  it('keeps a document date distinct from a discharge date', () => {
    const result = extractDocumentData(
      textResult(['Document date: 2026-10-16', 'Discharge date: 20.10.2026', 'Document type: Entlassbrief']),
    )

    expect(result.data?.documentDate).toMatchObject({ status: 'found', normalizedValue: '2026-10-16' })
    expect(result.data?.dischargeDate).toMatchObject({
      status: 'found',
      sourceValue: '20.10.2026',
      normalizedValue: '2026-10-20',
    })
    expect(result.data?.documentType).toMatchObject({
      status: 'found',
      sourceValue: 'Entlassbrief',
      normalizedValue: 'discharge-letter',
    })
  })
})

function textResult(lines: readonly string[]): PdfTextExtractionResult {
  const pages: ExtractedPdfPage[] = lines.map((text, index) => ({
    pageNumber: index + 1,
    text,
    method: 'embedded',
  }))

  return {
    fileName: 'letter.pdf',
    pageCount: pages.length,
    pages,
    fullText: lines.join('\n'),
    hasExtractableText: lines.some((line) => line.trim().length > 0),
    source: 'embedded',
  }
}

function evidence(field: ExtractedField | undefined) {
  if (!field || field.status === 'missing') {
    return []
  }

  if (field.status === 'ambiguous') {
    return field.candidates.map((candidate) => candidate.evidence)
  }

  return field.evidence
}
