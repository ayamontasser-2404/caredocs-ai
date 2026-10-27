import type { HealthcareDocument, MedicationEntry } from '../../../types/document.ts'
import type { FindingEvidence, ReviewFinding } from '../../../types/review.ts'
import { normalizeMedicationName, normalizeOptional, normalizeText, slug } from './normalize.ts'

const MEDICATION_SECTION_ID = 'medication'

const CONFLICT_RATIONALE =
  'Die Abweichung muss anhand der autoritativen klinischen Dokumentation überprüft werden. Die Anwendung entscheidet nicht selbst, welcher Wert korrekt ist.'

const MISSING_RATIONALE =
  'Die Abweichung muss anhand der autoritativen klinischen Dokumentation überprüft werden. Das Fehlen eines Eintrags ist kein Nachweis, dass ein Medikament abgesetzt wurde.'

type RequiredMedicationField = 'strength' | 'dosage'

/**
 * Compare medication name, strength, dosage, and administration instructions separately.
 * Names match only after case and whitespace normalization. No brand/generic map is applied.
 */
export function compareMedications(
  documentA: HealthcareDocument,
  documentB: HealthcareDocument,
): ReviewFinding[] {
  const findings: ReviewFinding[] = []
  const groupsA = groupByName(documentA.medications)
  const groupsB = groupByName(documentB.medications)
  const seen = new Set<string>()

  for (const key of groupsA.keys()) {
    seen.add(key)
    pairEntries(documentA, documentB, groupsA.get(key) ?? [], groupsB.get(key) ?? [], findings)
  }

  for (const key of groupsB.keys()) {
    if (seen.has(key)) {
      continue
    }

    pairEntries(documentA, documentB, [], groupsB.get(key) ?? [], findings)
  }

  return findings
}

function pairEntries(
  documentA: HealthcareDocument,
  documentB: HealthcareDocument,
  entriesA: readonly MedicationEntry[],
  entriesB: readonly MedicationEntry[],
  findings: ReviewFinding[],
): void {
  const count = Math.max(entriesA.length, entriesB.length)

  for (let index = 0; index < count; index += 1) {
    const entryA = entriesA[index]
    const entryB = entriesB[index]
    const occurrence = index === 0 ? '' : `-${index + 1}`

    if (entryA && entryB) {
      compareMatchedEntry(documentA, documentB, entryA, entryB, occurrence, findings)
      continue
    }

    if (entryA) {
      findings.push(missingFinding(documentA, documentB, entryA, 'A', occurrence))
    } else if (entryB) {
      findings.push(missingFinding(documentB, documentA, entryB, 'B', occurrence))
    }
  }
}

function compareMatchedEntry(
  documentA: HealthcareDocument,
  documentB: HealthcareDocument,
  entryA: MedicationEntry,
  entryB: MedicationEntry,
  occurrence: string,
  findings: ReviewFinding[],
): void {
  compareRequiredField(documentA, documentB, entryA, entryB, 'strength', occurrence, findings)
  compareRequiredField(documentA, documentB, entryA, entryB, 'dosage', occurrence, findings)
  compareInstructions(documentA, documentB, entryA, entryB, occurrence, findings)
}

function compareRequiredField(
  documentA: HealthcareDocument,
  documentB: HealthcareDocument,
  entryA: MedicationEntry,
  entryB: MedicationEntry,
  field: 'strength' | 'dosage',
  occurrence: string,
  findings: ReviewFinding[],
): void {
  const valueA = entryA[field]
  const valueB = entryB[field]

  if (normalizeText(valueA) === normalizeText(valueB)) {
    return
  }

  const label = field === 'strength' ? 'Medikamentenstärke' : 'Dosierung'
  findings.push({
    id: `FIND-MED-${slug(entryA.name)}${occurrence}-${field.toUpperCase()}`,
    category: 'medication',
    severity: 'high',
    status: 'open',
    title: `Abweichende ${label}`,
    description: fieldDescription(field, entryA.name),
    rationale: CONFLICT_RATIONALE,
    evidence: [
      medicationEvidence(documentA, fieldExcerpt(field, entryA.name, valueA)),
      medicationEvidence(documentB, fieldExcerpt(field, entryB.name, valueB)),
    ],
  })
}

function compareInstructions(
  documentA: HealthcareDocument,
  documentB: HealthcareDocument,
  entryA: MedicationEntry,
  entryB: MedicationEntry,
  occurrence: string,
  findings: ReviewFinding[],
): void {
  const valueA = normalizeOptional(entryA.instructions)
  const valueB = normalizeOptional(entryB.instructions)

  if (valueA === valueB) {
    return
  }

  const bothRecorded = valueA !== undefined && valueB !== undefined
  findings.push({
    id: `FIND-MED-${slug(entryA.name)}${occurrence}-INSTRUCTIONS`,
    category: 'medication',
    severity: bothRecorded ? 'high' : 'review-required',
    status: 'open',
    title: 'Abweichende Einnahmehinweise',
    description: instructionDescription(entryA.name, bothRecorded),
    rationale: CONFLICT_RATIONALE,
    evidence: instructionEvidence(documentA, documentB, entryA, entryB),
  })
}

function instructionEvidence(
  documentA: HealthcareDocument,
  documentB: HealthcareDocument,
  entryA: MedicationEntry,
  entryB: MedicationEntry,
): FindingEvidence[] {
  const evidence: FindingEvidence[] = []

  if (normalizeOptional(entryA.instructions) !== undefined) {
    evidence.push(medicationEvidence(documentA, `${entryA.name}: ${entryA.instructions}`))
  }

  if (normalizeOptional(entryB.instructions) !== undefined) {
    evidence.push(medicationEvidence(documentB, `${entryB.name}: ${entryB.instructions}`))
  }

  return evidence
}

function missingFinding(
  presentDocument: HealthcareDocument,
  absentDocument: HealthcareDocument,
  entry: MedicationEntry,
  side: 'A' | 'B',
  occurrence: string,
): ReviewFinding {
  return {
    id: `FIND-MED-ONLY-${side}-${slug(entry.name)}${occurrence}`,
    category: 'medication',
    severity: 'review-required',
    status: 'open',
    title: 'Medikament nur in einem Dokument aufgeführt',
    description: `${entry.name} ist in „${presentDocument.title}“ aufgeführt und in „${absentDocument.title}“ nicht enthalten.`,
    rationale: MISSING_RATIONALE,
    evidence: [medicationEvidence(presentDocument, formatPresentMedication(entry))],
  }
}

function fieldDescription(field: RequiredMedicationField, name: string): string {
  if (field === 'strength') {
    return `Die dokumentierte Stärke von ${name} unterscheidet sich zwischen den Dokumenten.`
  }

  return `Die dokumentierte Dosierung von ${name} unterscheidet sich zwischen den Dokumenten.`
}

function instructionDescription(name: string, bothRecorded: boolean): string {
  if (bothRecorded) {
    return `Die Einnahmehinweise von ${name} unterscheiden sich zwischen den Dokumenten.`
  }

  return `Einnahmehinweise für ${name} sind nur in einem Dokument angegeben.`
}

function fieldExcerpt(field: 'strength' | 'dosage', name: string, value: string): string {
  if (field === 'strength') {
    return `${name} ${value}`
  }

  return `${name}: ${value}`
}

function formatPresentMedication(entry: MedicationEntry): string {
  const instructions = normalizeOptional(entry.instructions)
  const base = `${entry.name} ${entry.strength}; ${entry.dosage}`
  return instructions === undefined ? base : `${base}; ${entry.instructions}`
}

function medicationEvidence(document: HealthcareDocument, excerpt: string): FindingEvidence {
  const section = document.sections.find((item) => item.id === MEDICATION_SECTION_ID)

  return {
    documentId: document.id,
    sectionId: section?.id ?? MEDICATION_SECTION_ID,
    excerpt,
  }
}

function groupByName(medications: readonly MedicationEntry[]): Map<string, MedicationEntry[]> {
  const groups = new Map<string, MedicationEntry[]>()

  for (const medication of medications) {
    const key = normalizeMedicationName(medication.name)
    const existing = groups.get(key)

    if (existing) {
      existing.push(medication)
    } else {
      groups.set(key, [medication])
    }
  }

  return groups
}
