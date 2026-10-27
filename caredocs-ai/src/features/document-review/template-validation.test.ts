import { describe, expect, it } from 'vitest'
import { sampleDischargeLetter } from '../../data/sampleDischargeLetter.ts'
import { sampleMedicationPlan } from '../../data/sampleMedicationPlan.ts'
import { parseDocumentUpload, validateDocumentTemplate } from './template-validation.ts'

describe('template validation', () => {
  it('accepts the sample discharge letter and medication plan in their own slots', () => {
    const letter = validateDocumentTemplate(sampleDischargeLetter, 'discharge-letter')
    const plan = validateDocumentTemplate(sampleMedicationPlan, 'medication-plan')

    expect(letter.ok).toBe(true)
    expect(plan.ok).toBe(true)
  })

  it('rejects a medication plan uploaded as a discharge letter', () => {
    const result = validateDocumentTemplate(sampleMedicationPlan, 'discharge-letter')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.messages).toEqual([
        'This slot expects a discharge letter, and the file is a medication plan.',
      ])
      expect(result.messages.join(' ')).not.toContain('Erika')
    }
  })

  it('rejects a discharge letter that is missing follow-up or treatment', () => {
    const withoutFollowUp = {
      ...sampleDischargeLetter,
      sections: sampleDischargeLetter.sections.filter((section) => section.id !== 'follow-up'),
    }
    const withoutTreatment = {
      ...sampleDischargeLetter,
      sections: sampleDischargeLetter.sections.filter((section) => section.id !== 'treatment'),
    }

    const missingFollowUp = validateDocumentTemplate(withoutFollowUp, 'discharge-letter')
    const missingTreatment = validateDocumentTemplate(withoutTreatment, 'discharge-letter')

    expect(missingFollowUp.ok).toBe(false)
    expect(missingTreatment.ok).toBe(false)
    if (!missingFollowUp.ok) {
      expect(missingFollowUp.messages).toContain('Missing section: follow-up.')
    }
    if (!missingTreatment.ok) {
      expect(missingTreatment.messages).toContain('Missing section: treatment.')
    }
  })

  it('rejects a medication plan that is missing the patient section', () => {
    const withoutPatient = {
      ...sampleMedicationPlan,
      sections: sampleMedicationPlan.sections.filter((section) => section.id !== 'patient'),
    }
    const result = validateDocumentTemplate(withoutPatient, 'medication-plan')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.messages).toContain('Missing section: patient.')
      expect(result.messages.join(' ')).not.toContain('Erika')
      expect(result.messages.join(' ')).not.toContain('Pantoprazol')
    }
  })

  it('rejects a duplicate required section and a blank required section', () => {
    const treatment = sampleDischargeLetter.sections.find((section) => section.id === 'treatment')
    const duplicated = validateDocumentTemplate(
      {
        ...sampleDischargeLetter,
        sections: [...sampleDischargeLetter.sections, treatment],
      },
      'discharge-letter',
    )
    const blank = validateDocumentTemplate(
      {
        ...sampleDischargeLetter,
        sections: sampleDischargeLetter.sections.map((section) =>
          section.id === 'follow-up' ? { ...section, content: '   ' } : section,
        ),
      },
      'discharge-letter',
    )

    expect(duplicated.ok).toBe(false)
    expect(blank.ok).toBe(false)
    if (!duplicated.ok) {
      expect(duplicated.messages).toContain('Duplicate section: treatment.')
    }
    if (!blank.ok) {
      expect(blank.messages).toContain('Section follow-up has no content.')
    }
  })

  it('keeps an extra section when the required sections are present', () => {
    const result = validateDocumentTemplate(
      {
        ...sampleMedicationPlan,
        sections: [
          ...sampleMedicationPlan.sections,
          { id: 'notes', title: 'Hinweise', content: 'Zusatz.' },
        ],
      },
      'medication-plan',
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.document.sections.map((section) => section.id)).toContain('notes')
    }
  })

  it('rejects a document with no medication lines and does not quote the line that is incomplete', () => {
    const empty = validateDocumentTemplate(
      { ...sampleDischargeLetter, medications: [] },
      'discharge-letter',
    )
    const incomplete = validateDocumentTemplate(
      {
        ...sampleMedicationPlan,
        medications: [{ name: 'Geheimmittel', strength: '   ', dosage: '1 Tablette' }],
      },
      'medication-plan',
    )

    expect(empty.ok).toBe(false)
    expect(incomplete.ok).toBe(false)
    if (!empty.ok) {
      expect(empty.messages).toContain('The document has no medication lines.')
    }
    if (!incomplete.ok) {
      expect(incomplete.messages).toContain('A medication line is missing a strength.')
      expect(incomplete.messages.join(' ')).not.toContain('Geheimmittel')
    }
  })

  it('rejects invalid JSON', () => {
    const result = parseDocumentUpload('{', 'discharge-letter')

    expect(result).toEqual({ ok: false, messages: ['The file is not valid JSON.'] })
  })
})
