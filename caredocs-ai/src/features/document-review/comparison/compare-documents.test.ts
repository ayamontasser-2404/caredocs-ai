import { describe, expect, it, vi } from 'vitest'
import { expectedFindings } from '../../../data/expectedFindings.ts'
import { reviewChecklist } from '../../../data/reviewChecklist.ts'
import { sampleDischargeLetter } from '../../../data/sampleDischargeLetter.ts'
import { sampleMedicationPlan } from '../../../data/sampleMedicationPlan.ts'
import type { HealthcareDocument, MedicationEntry } from '../../../types/document.ts'
import type { ReviewChecklistItem, ReviewFinding } from '../../../types/review.ts'
import {
  compareDocuments,
  ComparisonInputError,
  MEDICATION_RULE_ID,
  PATIENT_IDENTITY_RULE_ID,
} from './compare-documents.ts'
import { FOLLOW_UP_RULE_ID, TREATMENT_RULE_ID } from './detect-missing-information.ts'

const basePatient = {
  patientId: 'DEMO-4711',
  name: 'Erika Beispiel',
  dateOfBirth: '1962-03-14',
} as const

function makeDocument(
  id: string,
  overrides: {
    type?: HealthcareDocument['type']
    title?: string
    patient?: HealthcareDocument['patient']
    sections?: HealthcareDocument['sections']
    medications?: readonly MedicationEntry[]
  } = {},
): HealthcareDocument {
  return {
    id,
    type: overrides.type ?? 'discharge-letter',
    title: overrides.title ?? `Dokument ${id}`,
    filename: `${id}.txt`,
    createdAt: '2026-10-16',
    patient: overrides.patient ?? { ...basePatient },
    sections: overrides.sections ?? [],
    medications: overrides.medications ?? [],
    synthetic: true,
    demoNotice: 'Synthetisches Beispieldokument.',
  }
}

function medication(overrides: Partial<MedicationEntry> = {}): MedicationEntry {
  return {
    name: 'Pantoprazol',
    strength: '40 mg',
    dosage: '1 Tablette morgens',
    instructions: 'Vor dem Frühstück',
    ...overrides,
  }
}

function disable(ruleIds: readonly string[]): ReviewChecklistItem[] {
  return reviewChecklist.map((item) => ({
    ...item,
    enabled: ruleIds.includes(item.id) ? false : item.enabled,
  }))
}

function ids(findings: readonly ReviewFinding[]): string[] {
  return findings.map((finding) => finding.id)
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) {
      deepFreeze(child)
    }
  }

  return value
}

describe('synthetic demo scenario', () => {
  it('reproduces the expected findings and reports the Ramipril instruction mismatch', () => {
    const findings = compareDocuments(
      sampleDischargeLetter,
      sampleMedicationPlan,
      reviewChecklist,
    )

    // expectedFindings does not list Ramipril. The source documents do differ:
    // discharge letter "Dauertherapie", medication plan "Morgens".
    expect(ids(findings)).toEqual([
      'FIND-IDENTITY-NAME',
      'FIND-MED-PANTOPRAZOL-STRENGTH',
      'FIND-MED-RAMIPRIL-INSTRUCTIONS',
      'FIND-FOLLOW-UP-DATE',
      'FIND-TREATMENT-GENERIC',
    ])

    for (const expected of expectedFindings) {
      const actual = findings.find((finding) => finding.title === expected.title)

      expect(actual, expected.id).toMatchObject({
        category: expected.category,
        severity: expected.severity,
        status: expected.status,
        title: expected.title,
        rationale: expected.rationale,
      })
      expect(actual?.evidence).toEqual(expected.evidence)
    }

    const instructionFinding = findings.find(
      (finding) => finding.id === 'FIND-MED-RAMIPRIL-INSTRUCTIONS',
    )
    expect(instructionFinding).toMatchObject({
      category: 'medication',
      severity: 'high',
      status: 'open',
      evidence: [
        {
          documentId: 'DOC-2026-001',
          sectionId: 'medication',
          excerpt: 'Ramipril: Dauertherapie',
        },
        {
          documentId: 'DOC-2026-002',
          sectionId: 'medication',
          excerpt: 'Ramipril: Morgens',
        },
      ],
    })
    expect(instructionFinding?.rationale).toContain('nicht selbst')
  })

  it('does not flag matching patient id, date of birth, or matching Ramipril strength and dosage', () => {
    const findings = compareDocuments(
      sampleDischargeLetter,
      sampleMedicationPlan,
      reviewChecklist,
    )

    expect(findings.some((finding) => finding.id === 'FIND-IDENTITY-ID')).toBe(false)
    expect(findings.some((finding) => finding.id === 'FIND-IDENTITY-DOB')).toBe(false)
    expect(findings.some((finding) => finding.id.includes('RAMIPRIL-STRENGTH'))).toBe(false)
    expect(findings.some((finding) => finding.id.includes('RAMIPRIL-DOSAGE'))).toBe(false)
  })

  it('returns the same findings when the same documents are compared again', () => {
    const first = compareDocuments(sampleDischargeLetter, sampleMedicationPlan, reviewChecklist)
    const second = compareDocuments(sampleDischargeLetter, sampleMedicationPlan, reviewChecklist)

    expect(second).toEqual(first)
    expect(new Set(ids(second)).size).toBe(second.length)
  })
})

describe('patient identity', () => {
  const letter = makeDocument('DOC-A')

  it('does not flag names that differ only by case or whitespace', () => {
    const noisy = makeDocument('DOC-B', {
      patient: { ...basePatient, name: '  ERIKA   beispiel ' },
    })

    expect(ids(compareDocuments(letter, noisy, reviewChecklist))).not.toContain('FIND-IDENTITY-NAME')
  })

  it('flags a different patient id and keeps the original values as evidence', () => {
    const changed = makeDocument('DOC-B', {
      patient: { ...basePatient, patientId: 'DEMO-9999' },
    })
    const finding = compareDocuments(letter, changed, reviewChecklist).find(
      (item) => item.id === 'FIND-IDENTITY-ID',
    )

    expect(finding).toMatchObject({
      category: 'patient-identity',
      severity: 'high',
      status: 'open',
      evidence: [
        { documentId: 'DOC-A', sectionId: 'patient', excerpt: 'DEMO-4711' },
        { documentId: 'DOC-B', sectionId: 'patient', excerpt: 'DEMO-9999' },
      ],
    })
    expect(finding?.description.toLowerCase()).not.toContain('korrekt')
  })

  it('flags a different date of birth', () => {
    const changed = makeDocument('DOC-B', {
      patient: { ...basePatient, dateOfBirth: '1962-04-14' },
    })

    expect(ids(compareDocuments(letter, changed, reviewChecklist))).toContain('FIND-IDENTITY-DOB')
  })

  it('does not treat a different date format as the same date', () => {
    const changed = makeDocument('DOC-B', {
      patient: { ...basePatient, dateOfBirth: '14.03.1962' },
    })

    expect(ids(compareDocuments(letter, changed, reviewChecklist))).toContain('FIND-IDENTITY-DOB')
  })

  it('does not flag a patient id that differs only by case or surrounding space', () => {
    const changed = makeDocument('DOC-B', {
      patient: { ...basePatient, patientId: ' demo-4711 ' },
    })

    expect(ids(compareDocuments(letter, changed, reviewChecklist))).not.toContain('FIND-IDENTITY-ID')
  })

  it('describes a name mismatch without claiming the other identity fields differ when they match', () => {
    const changed = makeDocument('DOC-B', {
      patient: { ...basePatient, name: 'Erika Beispel' },
    })
    const finding = compareDocuments(letter, changed, reviewChecklist).find(
      (item) => item.id === 'FIND-IDENTITY-NAME',
    )

    expect(finding?.description).toBe(
      'Die Patientennamen unterscheiden sich, während Patienten-ID und Geburtsdatum übereinstimmen.',
    )
    expect(finding?.evidence).toEqual([
      { documentId: 'DOC-A', sectionId: 'patient', excerpt: 'Erika Beispiel' },
      { documentId: 'DOC-B', sectionId: 'patient', excerpt: 'Erika Beispel' },
    ])
  })

  it('produces no identity findings when the identity rule is disabled', () => {
    const changed = makeDocument('DOC-B', {
      patient: { patientId: 'OTHER', name: 'Andere Person', dateOfBirth: '1900-01-01' },
    })

    expect(
      compareDocuments(letter, changed, disable([PATIENT_IDENTITY_RULE_ID])).some(
        (finding) => finding.category === 'patient-identity',
      ),
    ).toBe(false)
  })
})

describe('medications', () => {
  const shared = medication()

  it('does not flag identical medication fields', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', { medications: [shared] }),
      makeDocument('DOC-B', { medications: [{ ...shared }] }),
      reviewChecklist,
    )

    expect(findings.some((finding) => finding.category === 'medication')).toBe(false)
  })

  it('does not flag fields that match after case and whitespace normalization', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', { medications: [medication({ name: 'Pantoprazol.' })] }),
      makeDocument('DOC-B', {
        medications: [
          medication({
            name: ' pantoprazol ',
            strength: ' 40 MG ',
            dosage: ' 1 TABLETTE   morgens ',
            instructions: ' vor dem frühstück ',
          }),
        ],
      }),
      reviewChecklist,
    )

    expect(findings.some((finding) => finding.category === 'medication')).toBe(false)
  })

  it('flags strength, dosage, and instructions as separate findings', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', { medications: [shared] }),
      makeDocument('DOC-B', {
        medications: [
          medication({
            strength: '20 mg',
            dosage: '1 Tablette abends',
            instructions: 'Nach dem Essen',
          }),
        ],
      }),
      reviewChecklist,
    )

    expect(ids(findings)).toEqual([
      'FIND-MED-PANTOPRAZOL-STRENGTH',
      'FIND-MED-PANTOPRAZOL-DOSAGE',
      'FIND-MED-PANTOPRAZOL-INSTRUCTIONS',
    ])
    const strength = findings[0]
    const dosage = findings[1]
    expect(strength?.evidence[0]?.excerpt).toBe('Pantoprazol 40 mg')
    expect(strength?.evidence[0]?.excerpt).not.toContain('Tablette')
    expect(dosage?.evidence[1]?.excerpt).toBe('Pantoprazol: 1 Tablette abends')
    expect(dosage?.evidence[1]?.excerpt).not.toContain('mg')
    expect(findings.every((finding) => finding.severity === 'high' && finding.status === 'open')).toBe(
      true,
    )
  })

  it('flags a medication that appears in only one document without calling it discontinued', () => {
    const onlyFirst = compareDocuments(
      makeDocument('DOC-A', { title: 'Brief', medications: [medication({ name: 'Ibuprofen', strength: '400 mg', instructions: 'Bei Bedarf' })] }),
      makeDocument('DOC-B', { title: 'Plan', medications: [] }),
      reviewChecklist,
    )
    const onlySecond = compareDocuments(
      makeDocument('DOC-A', { title: 'Brief', medications: [] }),
      makeDocument('DOC-B', { title: 'Plan', medications: [medication({ name: 'Ibuprofen', strength: '400 mg' })] }),
      reviewChecklist,
    )

    expect(onlyFirst[0]).toMatchObject({
      id: 'FIND-MED-ONLY-A-IBUPROFEN',
      severity: 'review-required',
      description: 'Ibuprofen ist in „Brief“ aufgeführt und in „Plan“ nicht enthalten.',
      evidence: [
        {
          documentId: 'DOC-A',
          sectionId: 'medication',
          excerpt: 'Ibuprofen 400 mg; 1 Tablette morgens; Bei Bedarf',
        },
      ],
    })
    expect(onlyFirst[0]?.rationale).toContain('kein Nachweis')
    expect(onlyFirst[0]?.rationale.toLowerCase()).not.toContain('absetzen')
    expect(onlySecond.map((finding) => finding.id)).toEqual(['FIND-MED-ONLY-B-IBUPROFEN'])
    expect(onlySecond[0]?.evidence).toHaveLength(1)
    expect(onlySecond[0]?.evidence[0]?.documentId).toBe('DOC-B')
  })

  it('does not equate a brand name with a generic name', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', { medications: [medication({ name: 'Pantozol' })] }),
      makeDocument('DOC-B', { medications: [medication({ name: 'Pantoprazol', strength: '20 mg' })] }),
      reviewChecklist,
    )

    expect(ids(findings)).toEqual(['FIND-MED-ONLY-A-PANTOZOL', 'FIND-MED-ONLY-B-PANTOPRAZOL'])
    expect(findings.some((finding) => finding.id.includes('STRENGTH'))).toBe(false)
  })

  it('flags an extra entry when the same name appears twice in one document', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', { medications: [shared, shared] }),
      makeDocument('DOC-B', { medications: [shared] }),
      reviewChecklist,
    )

    expect(ids(findings)).toEqual(['FIND-MED-ONLY-A-PANTOPRAZOL-2'])
  })

  it('flags a recorded instruction against a missing instruction without inventing the missing text', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', { medications: [medication({ instructions: 'Morgens' })] }),
      makeDocument('DOC-B', { medications: [medication({ instructions: undefined })] }),
      reviewChecklist,
    )

    expect(findings[0]).toMatchObject({
      id: 'FIND-MED-PANTOPRAZOL-INSTRUCTIONS',
      severity: 'review-required',
      evidence: [{ documentId: 'DOC-A', sectionId: 'medication', excerpt: 'Pantoprazol: Morgens' }],
    })
    expect(findings[0]?.evidence).toHaveLength(1)
  })

  it('treats a blank instruction and an omitted instruction as equally absent', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', { medications: [medication({ instructions: '   ' })] }),
      makeDocument('DOC-B', { medications: [medication({ instructions: undefined })] }),
      reviewChecklist,
    )

    expect(findings).toEqual([])
  })

  it('produces no medication findings for two empty medication lists', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A'),
      makeDocument('DOC-B'),
      reviewChecklist,
    )

    expect(findings).toEqual([])
  })

  it('produces no medication findings when the medication rule is disabled', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', { medications: [shared] }),
      makeDocument('DOC-B', { medications: [medication({ strength: '20 mg' })] }),
      disable([MEDICATION_RULE_ID]),
    )

    expect(findings.some((finding) => finding.category === 'medication')).toBe(false)
  })
})

describe('missing documentation', () => {
  const followUpSection = {
    id: 'follow-up',
    title: 'Nachsorge',
    content:
      'Hausärztliche Verlaufskontrolle empfohlen. Ein konkretes Datum ist nicht angegeben.',
  }
  const genericTreatment = {
    id: 'treatment',
    title: 'Therapie',
    content:
      'Die Patientin erhielt während des stationären Aufenthalts eine ärztlich festgelegte Behandlung.',
  }

  it('flags follow-up without a date and generic treatment when those rules are enabled', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', { sections: [followUpSection, genericTreatment] }),
      makeDocument('DOC-B', { type: 'medication-plan' }),
      reviewChecklist,
    )

    expect(ids(findings)).toEqual(['FIND-FOLLOW-UP-DATE', 'FIND-TREATMENT-GENERIC'])
    expect(findings[0]).toMatchObject({
      category: 'completeness',
      severity: 'review-required',
      evidence: [
        {
          documentId: 'DOC-A',
          sectionId: 'follow-up',
          excerpt: 'Hausärztliche Verlaufskontrolle empfohlen.',
        },
      ],
    })
    expect(findings[1]?.severity).toBe('informational')
    expect(findings[1]?.evidence[0]?.excerpt).toBe(genericTreatment.content)
  })

  it('does not infer a missing date when the section contains one', () => {
    const dated = {
      ...followUpSection,
      content: 'Kontrolle empfohlen am 2026-11-02. Kein konkretes Datum ist nicht der Wortlaut, der Termin steht oben.',
    }
    const writtenMonth = {
      ...followUpSection,
      content: 'Nachsorge empfohlen am 2. November 2026.',
    }

    expect(
      compareDocuments(
        makeDocument('DOC-A', { sections: [dated] }),
        makeDocument('DOC-B'),
        reviewChecklist,
      ),
    ).toEqual([])
    expect(
      compareDocuments(
        makeDocument('DOC-A', { sections: [writtenMonth] }),
        makeDocument('DOC-B'),
        reviewChecklist,
      ),
    ).toEqual([])
  })

  it('does not flag a follow-up section that does not recommend follow-up', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', {
        sections: [{ id: 'follow-up', title: 'Nachsorge', content: 'Keine Nachsorge erforderlich.' }],
      }),
      makeDocument('DOC-B'),
      reviewChecklist,
    )

    expect(findings).toEqual([])
  })

  it('does not flag a negated follow-up recommendation', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', {
        sections: [
          { id: 'follow-up', title: 'Nachsorge', content: 'Keine Kontrolle empfohlen.' },
        ],
      }),
      makeDocument('DOC-B'),
      reviewChecklist,
    )

    expect(findings).toEqual([])
  })

  it('does not flag treatment text that includes a concrete dose', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', {
        sections: [
          {
            id: 'treatment',
            title: 'Therapie',
            content:
              'Die Patientin erhielt eine ärztlich festgelegte Behandlung mit Amoxicillin 500 mg.',
          },
        ],
      }),
      makeDocument('DOC-B'),
      reviewChecklist,
    )

    expect(findings).toEqual([])
  })

  it('skips a documentation rule when that checklist item is disabled', () => {
    const documents = [
      makeDocument('DOC-A', { sections: [followUpSection, genericTreatment] }),
      makeDocument('DOC-B'),
    ] as const

    const withoutFollowUp = compareDocuments(...documents, disable([FOLLOW_UP_RULE_ID]))
    const withoutTreatment = compareDocuments(...documents, disable([TREATMENT_RULE_ID]))

    expect(ids(withoutFollowUp)).toEqual(['FIND-TREATMENT-GENERIC'])
    expect(ids(withoutTreatment)).toEqual(['FIND-FOLLOW-UP-DATE'])
  })

  it('merges the same documentation finding from both documents into one finding', () => {
    const findings = compareDocuments(
      makeDocument('DOC-A', { sections: [followUpSection] }),
      makeDocument('DOC-B', { sections: [followUpSection] }),
      reviewChecklist,
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]?.id).toBe('FIND-FOLLOW-UP-DATE')
    expect(findings[0]?.evidence.map((item) => item.documentId)).toEqual(['DOC-A', 'DOC-B'])
  })
})

describe('comparison safety', () => {
  it('returns no findings when every checklist rule is disabled', () => {
    const findings = compareDocuments(
      sampleDischargeLetter,
      sampleMedicationPlan,
      reviewChecklist.map((item) => ({ ...item, enabled: false })),
    )

    expect(findings).toEqual([])
  })

  it('does not modify the input documents or checklist', () => {
    const letter = structuredClone(sampleDischargeLetter)
    const plan = structuredClone(sampleMedicationPlan)
    const checklist = reviewChecklist.map((item) => ({ ...item }))
    const before = {
      letter: structuredClone(letter),
      plan: structuredClone(plan),
      checklist: structuredClone(checklist),
    }

    deepFreeze(letter)
    deepFreeze(plan)
    deepFreeze(checklist)
    compareDocuments(letter, plan, checklist)

    expect(letter).toEqual(before.letter)
    expect(plan).toEqual(before.plan)
    expect(checklist).toEqual(before.checklist)
  })

  it('does not log patient or medication values', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    compareDocuments(sampleDischargeLetter, sampleMedicationPlan, reviewChecklist)

    expect(log).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()

    log.mockRestore()
    info.mockRestore()
    warn.mockRestore()
    error.mockRestore()
  })

  it('rejects a missing patient name without repeating another patient name', () => {
    const secret = 'Erika Geheimname'
    const invalid = makeDocument('DOC-A', {
      patient: { patientId: 'DEMO-4711', name: '   ', dateOfBirth: '1962-03-14' },
    })
    const other = makeDocument('DOC-B', {
      patient: { ...basePatient, name: secret },
    })

    expect(() => compareDocuments(invalid, other, reviewChecklist)).toThrow(ComparisonInputError)
    try {
      compareDocuments(invalid, other, reviewChecklist)
    } catch (caught) {
      expect(caught).toBeInstanceOf(ComparisonInputError)
      expect((caught as Error).message).not.toContain(secret)
      expect((caught as Error).message).toContain('patient name')
    }
  })

  it('rejects a missing checklist', () => {
    expect(() =>
      compareDocuments(
        makeDocument('DOC-A'),
        makeDocument('DOC-B'),
        undefined as unknown as readonly ReviewChecklistItem[],
      ),
    ).toThrow(/Checklist is missing/)
  })
})
