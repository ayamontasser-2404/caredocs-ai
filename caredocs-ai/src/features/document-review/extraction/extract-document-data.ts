import { normalizeMedicationName, normalizeText } from '../comparison/normalize.ts'
import type { DocumentType } from '../../../types/document.ts'
import type {
  ExtractedDocumentFields,
  ExtractedField,
  ExtractedFollowUpFields,
  ExtractedMedicationFields,
  ExtractedPatientFields,
  ExtractedPdfPage,
  FieldCandidate,
  FieldEvidence,
  PdfTextExtractionResult,
  StructuredDocumentExtraction,
  StructuredTextSource,
} from './extraction-types.ts'

/**
 * Read labeled fields from text that Phase 1 or Phase 2 already extracted.
 *
 * Supported labels, each followed by a colon, in German or English:
 * patient name, Patientenname, Name, Patient, Patientin;
 * date of birth, Geburtsdatum, geboren am;
 * Patienten-ID, patient id;
 * document type, Dokumenttyp; document date, Dokumentdatum;
 * discharge date, Entlassdatum, Entlassung am;
 * medication, Medikament, Medikation, Arzneimittel;
 * strength, Wirkstärke, Stärke; dosage, Dosierung, Dosis, Einnahme;
 * instructions, Hinweis; route, Applikationsweg; frequency, Häufigkeit;
 * start date, Startdatum, Beginn; end date, Enddatum, Ende;
 * follow-up, Nachsorge, Wiedervorstellung; treatment, Therapie, Behandlung.
 *
 * A line that is only a capitalized name plus a strength, such as `Pantoprazol 40 mg`,
 * is also a medication. Prose is not scanned for drugs.
 *
 * Dates: `YYYY-MM-DD` is ISO. A dotted `D.M.YYYY` is a German day-month-year date.
 * An English or German month name is unambiguous. A slash or hyphen numeric date is
 * normalized only when one side is greater than 12. Two-digit years are not normalized.
 * `40 mg` is strength, not a dose. No drug is renamed, and no missing value is filled in.
 * Nothing here is a review finding.
 */

type LabelId =
  | 'patientName'
  | 'dateOfBirth'
  | 'patientId'
  | 'documentType'
  | 'documentDate'
  | 'dischargeDate'
  | 'medication'
  | 'strength'
  | 'dosage'
  | 'instructions'
  | 'route'
  | 'frequency'
  | 'startDate'
  | 'endDate'
  | 'followUp'
  | 'treatment'

interface LabelHit {
  field: LabelId
  value: string
  evidenceText: string
}

interface MedicationDraft {
  name: ExtractedField
  strength: ExtractedField
  dosage: ExtractedField
  instructions: ExtractedField
  route: ExtractedField
  frequency: ExtractedField
  startDate: ExtractedField
  endDate: ExtractedField
}

const LABEL_DEFS: readonly { field: LabelId; pattern: string }[] = [
  { field: 'dateOfBirth', pattern: 'date of birth' },
  { field: 'patientName', pattern: 'patientenname' },
  { field: 'patientName', pattern: 'patient name' },
  { field: 'dischargeDate', pattern: 'discharge date' },
  { field: 'dischargeDate', pattern: 'entlassdatum' },
  { field: 'dischargeDate', pattern: 'entlassung am' },
  { field: 'documentType', pattern: 'document type' },
  { field: 'documentType', pattern: 'dokumenttyp' },
  { field: 'documentType', pattern: 'dokumentart' },
  { field: 'documentDate', pattern: 'document date' },
  { field: 'documentDate', pattern: 'dokumentdatum' },
  { field: 'patientId', pattern: 'patienten-id' },
  { field: 'patientId', pattern: 'patientenid' },
  { field: 'patientId', pattern: 'patient-id' },
  { field: 'patientId', pattern: 'patient id' },
  { field: 'dateOfBirth', pattern: 'geburtsdatum' },
  { field: 'dateOfBirth', pattern: 'geboren am' },
  { field: 'followUp', pattern: 'wiedervorstellung' },
  { field: 'followUp', pattern: 'follow-up' },
  { field: 'followUp', pattern: 'follow up' },
  { field: 'followUp', pattern: 'nachsorge' },
  { field: 'instructions', pattern: 'einnahmehinweis' },
  { field: 'instructions', pattern: 'instructions' },
  { field: 'medication', pattern: 'medikament' },
  { field: 'medication', pattern: 'medication' },
  { field: 'medication', pattern: 'medikation' },
  { field: 'medication', pattern: 'arzneimittel' },
  { field: 'frequency', pattern: 'häufigkeit' },
  { field: 'frequency', pattern: 'frequency' },
  { field: 'startDate', pattern: 'start date' },
  { field: 'startDate', pattern: 'startdatum' },
  { field: 'strength', pattern: 'wirkstärke' },
  { field: 'strength', pattern: 'strength' },
  { field: 'instructions', pattern: 'instruction' },
  { field: 'instructions', pattern: 'hinweis' },
  { field: 'dosage', pattern: 'dosierung' },
  { field: 'dosage', pattern: 'dosage' },
  { field: 'dosage', pattern: 'einnahme' },
  { field: 'route', pattern: 'applikationsweg' },
  { field: 'route', pattern: 'verabreichung' },
  { field: 'endDate', pattern: 'end date' },
  { field: 'endDate', pattern: 'enddatum' },
  { field: 'treatment', pattern: 'behandlung' },
  { field: 'treatment', pattern: 'treatment' },
  { field: 'strength', pattern: 'stärke' },
  { field: 'patientName', pattern: 'patientin' },
  { field: 'startDate', pattern: 'beginn' },
  { field: 'dosage', pattern: 'dosis' },
  { field: 'treatment', pattern: 'therapie' },
  { field: 'patientName', pattern: 'patient' },
  { field: 'route', pattern: 'route' },
  { field: 'endDate', pattern: 'ende' },
  { field: 'patientName', pattern: 'name' },
]

const LABEL_PATTERN = new RegExp(
  `(?:^|[\\s.;]+)(${[...LABEL_DEFS]
    .sort((left, right) => right.pattern.length - left.pattern.length)
    .map((label) => escapeRegExp(label.pattern))
    .join('|')})\\s*:\\s*`,
  'gimu',
)

const STRENGTH_PATTERN = /\d+(?:[.,]\d+)?\s*(?:mg|g|ml|µg|μg|ug|mcg|ie|i\.e\.)/giu
const BARE_MEDICATION = /^(\p{Lu}[\p{L}'-]*(?:\s+\p{Lu}[\p{L}'-]*)*)\s+(\d+(?:[.,]\d+)?\s*(?:mg|g|ml|µg|μg|ug|mcg|ie|i\.e\.))$/iu

const MONTHS: Readonly<Record<string, number>> = {
  january: 1,
  januar: 1,
  february: 2,
  februar: 2,
  march: 3,
  märz: 3,
  maerz: 3,
  april: 4,
  may: 5,
  mai: 5,
  june: 6,
  juni: 6,
  july: 7,
  juli: 7,
  august: 8,
  september: 9,
  october: 10,
  oktober: 10,
  november: 11,
  december: 12,
  dezember: 12,
}

const MONTH_NAMES = Object.keys(MONTHS).join('|')
const DAY_MONTH = new RegExp(`(\\d{1,2})\\.?\\s+(${MONTH_NAMES})\\.?\\s+(\\d{4})`, 'iu')
const MONTH_DAY = new RegExp(`(${MONTH_NAMES})\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'iu')

/**
 * Turn page text into structured fields.
 * Accepts the Phase 1 and Phase 2 result. A malformed value is `unsupported` and does not throw.
 */
export function extractDocumentData(result: unknown): StructuredDocumentExtraction {
  if (!isTextResult(result)) {
    return {
      fileName: '',
      source: 'unspecified',
      outcome: 'unsupported',
      data: null,
    }
  }

  const patient = emptyPatient()
  const followUp = emptyFollowUp()
  const medications: MedicationDraft[] = []
  const unparsed: FieldEvidence[] = []
  let documentType = missingField()
  let documentDate = missingField()
  let dischargeDate = missingField()
  let treatment = missingField()
  let openMedication: MedicationDraft | null = null

  for (const page of result.pages) {
    const evidenceBase = {
      method: 'rule-based' as const,
      textSource: textSourceOf(page),
      pageNumber: page.pageNumber,
    }
    const consumed = new Set<string>()

    for (const hit of labelHits(page.text)) {
      const evidence: FieldEvidence = { ...evidenceBase, text: hit.evidenceText }
      consumed.add(collapseLine(hit.evidenceText))
      applyHit(hit, evidence)
    }

    for (const line of page.text.split(/\n/)) {
      const trimmed = line.trim()
      if (trimmed.length === 0 || consumed.has(collapseLine(trimmed)) || labelHits(trimmed).length > 0) {
        continue
      }

      const bare = BARE_MEDICATION.exec(trimmed)
      if (!bare) {
        continue
      }

      applyMedication(`${bare[1]} ${bare[2]}`, { ...evidenceBase, text: trimmed })
    }
  }

  const data: ExtractedDocumentFields = {
    patient,
    documentType,
    documentDate,
    dischargeDate,
    medications: medications.map(freezeMedication),
    followUp,
    treatment,
    unparsed,
  }

  return {
    fileName: result.fileName,
    source: result.source ?? 'unspecified',
    outcome: outcomeFor(data),
    data,
  }

  function applyHit(hit: LabelHit, evidence: FieldEvidence): void {
    switch (hit.field) {
      case 'patientName':
        patient.name = observeName(patient.name, hit.value, evidence)
        return
      case 'dateOfBirth':
        patient.dateOfBirth = observeDate(patient.dateOfBirth, hit.value, evidence)
        return
      case 'patientId':
        patient.patientId = observeText(patient.patientId, hit.value, evidence)
        return
      case 'documentType':
        documentType = observeDocumentType(documentType, hit.value, evidence)
        return
      case 'documentDate':
        documentDate = observeDate(documentDate, hit.value, evidence)
        return
      case 'dischargeDate':
        dischargeDate = observeDate(dischargeDate, hit.value, evidence)
        return
      case 'medication':
        applyMedication(hit.value, evidence)
        return
      case 'strength':
        applyDetail('strength', hit.value, evidence, true)
        return
      case 'dosage':
        applyDetail('dosage', hit.value, evidence, false)
        return
      case 'instructions':
        applyDetail('instructions', hit.value, evidence, false)
        return
      case 'route':
        applyDetail('route', hit.value, evidence, false)
        return
      case 'frequency':
        applyDetail('frequency', hit.value, evidence, false)
        return
      case 'startDate':
        applyDatedDetail('startDate', hit.value, evidence)
        return
      case 'endDate':
        applyDatedDetail('endDate', hit.value, evidence)
        return
      case 'followUp':
        applyFollowUp(hit.value, evidence)
        return
      case 'treatment':
        treatment = observeText(treatment, hit.value, evidence)
        return
      default:
        return
    }
  }

  function applyMedication(value: string, evidence: FieldEvidence): void {
    const parsed = parseMedicationValue(value)
    if (!parsed) {
      unparsed.push(evidence)
      return
    }

    const key = normalizeMedicationName(parsed.name)
    const existing = medications.find((medication) => nameKey(medication) === key)
    const target = existing ?? emptyMedication()
    target.name = observeText(target.name, parsed.name, evidence)
    target.strength = observeStrengths(target.strength, parsed.strengths, evidence)
    if (parsed.dosage) {
      target.dosage = observeText(target.dosage, parsed.dosage, evidence)
    }

    if (!existing) {
      medications.push(target)
    }

    openMedication = target
  }

  function applyDetail(
    field: 'strength' | 'dosage' | 'instructions' | 'route' | 'frequency',
    value: string,
    evidence: FieldEvidence,
    asStrength: boolean,
  ): void {
    if (!openMedication) {
      unparsed.push(evidence)
      return
    }

    if (asStrength) {
      const strengths = strengthTokens(value)
      openMedication.strength =
        strengths.length > 0
          ? observeStrengths(openMedication.strength, strengths, evidence)
          : observeUnparsed(openMedication.strength, evidence)
      return
    }

    openMedication[field] = observeText(openMedication[field], value, evidence)
  }

  function applyDatedDetail(
    field: 'startDate' | 'endDate',
    value: string,
    evidence: FieldEvidence,
  ): void {
    if (!openMedication) {
      unparsed.push(evidence)
      return
    }

    openMedication[field] = observeDate(openMedication[field], value, evidence)
  }

  function applyFollowUp(value: string, evidence: FieldEvidence): void {
    const split = splitFollowUp(value)
    if (split.date === 'ambiguous') {
      followUp.date = observeUnparsed(followUp.date, evidence)
      return
    }

    if (split.date) {
      followUp.date = observeFound(followUp.date, split.date.source, evidence, split.date.iso, sameDate)
    }

    if (split.instructions) {
      followUp.instructions = observeText(followUp.instructions, split.instructions, evidence)
    }
  }
}

function labelHits(text: string): LabelHit[] {
  const pattern = new RegExp(LABEL_PATTERN.source, LABEL_PATTERN.flags)
  const matches = [...text.matchAll(pattern)]
  const hits: LabelHit[] = []

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    if (match.index === undefined || !match[1]) {
      continue
    }

    const field = fieldFor(match[1])
    if (!field) {
      continue
    }

    const valueStart = match.index + match[0].length
    const valueEnd = matches[index + 1]?.index ?? text.length
    const value = text.slice(valueStart, valueEnd).trim().replace(/[.;\s]+$/g, '')
    const leading = /^[\s.;]+/u.exec(match[0])
    const rawStart = match.index + (leading?.[0].length ?? 0)
    const evidenceText = text.slice(rawStart, valueEnd).trim().replace(/[.;\s]+$/g, '')
    if (value.length === 0) {
      continue
    }

    hits.push({ field, value, evidenceText })
  }

  return hits
}

function fieldFor(label: string): LabelId | null {
  const key = label.toLocaleLowerCase('de-DE')
  return LABEL_DEFS.find((item) => item.pattern === key)?.field ?? null
}

function parseMedicationValue(value: string): { name: string; strengths: string[]; dosage: string | null } | null {
  const strengths = strengthTokens(value)
  if (strengths.length === 0) {
    const name = value.trim()
    return looksLikeDrugName(name) ? { name, strengths: [], dosage: null } : null
  }

  const first = new RegExp(STRENGTH_PATTERN.source, 'iu').exec(value)
  if (!first || first.index === undefined) {
    return null
  }

  const name = value
    .slice(0, first.index)
    .trim()
    .replace(/[.,;:]+$/g, '')
  if (!looksLikeDrugName(name)) {
    return null
  }

  const after = value.slice(first.index + first[0].length).trim().replace(/^[.,;:\s]+/g, '')
  const later = strengthTokens(after)
  if (later.length > 0) {
    return { name, strengths, dosage: null }
  }

  return { name, strengths, dosage: after.length > 0 ? after : null }
}

function strengthTokens(value: string): string[] {
  return [...value.matchAll(new RegExp(STRENGTH_PATTERN.source, 'giu'))].map((match) => match[0].replace(/\s+/g, ' ').trim())
}

function looksLikeDrugName(value: string): boolean {
  const words = value.trim().split(/\s+/)
  return words.length > 0 && words.length <= 4 && words.every((word) => /^[\p{L}][\p{L}'-]*$/u.test(word))
}

function looksLikePersonName(value: string): boolean {
  const words = value.trim().split(/\s+/)
  return words.length > 0 && words.length <= 6 && words.every((word) => /^[\p{L}][\p{L}'.-]*$/u.test(word))
}

function observeName(current: ExtractedField, value: string, evidence: FieldEvidence): ExtractedField {
  if (!looksLikePersonName(value)) {
    return observeUnparsed(current, evidence)
  }

  return observeText(current, value, evidence)
}

function observeText(current: ExtractedField, value: string, evidence: FieldEvidence): ExtractedField {
  return observeFound(current, value.trim(), evidence, null, (left, right) => normalizeText(left) === normalizeText(right))
}

function observeStrengths(current: ExtractedField, strengths: readonly string[], evidence: FieldEvidence): ExtractedField {
  return strengths.reduce(
    (field, strength) => observeFound(field, strength, evidence, null, sameStrength),
    current,
  )
}

function observeDate(current: ExtractedField, value: string, evidence: FieldEvidence): ExtractedField {
  const parsed = parseDate(value.trim())
  if (parsed.kind === 'date') {
    return observeFound(current, parsed.source, evidence, parsed.iso, sameDate)
  }

  return observeUnparsed(current, evidence)
}

function observeDocumentType(current: ExtractedField, value: string, evidence: FieldEvidence): ExtractedField {
  const mapped = documentTypeValue(value)
  if (!mapped) {
    return observeUnparsed(current, evidence)
  }

  return observeFound(current, value.trim(), evidence, mapped, (left, right) => documentTypeValue(left) === documentTypeValue(right))
}

function observeFound(
  current: ExtractedField,
  sourceValue: string,
  evidence: FieldEvidence,
  normalizedValue: string | null,
  same: (left: string, right: string) => boolean,
): ExtractedField {
  if (current.status === 'missing') {
    return { status: 'found', sourceValue, normalizedValue, evidence: [evidence] }
  }

  if (current.status === 'found') {
    if (same(current.sourceValue, sourceValue)) {
      return { ...current, evidence: [...current.evidence, evidence] }
    }

    const previous = candidateFromFound(current)
    if (!previous) {
      return { status: 'found', sourceValue, normalizedValue, evidence: [evidence] }
    }

    return { status: 'ambiguous', candidates: [previous, { sourceValue, normalizedValue, evidence }] }
  }

  if (current.status === 'unparsed') {
    const previous = current.evidence.map((item) => ({
      sourceValue: item.text,
      normalizedValue: null,
      evidence: item,
    }))
    return { status: 'ambiguous', candidates: [...previous, { sourceValue, normalizedValue, evidence }] }
  }

  const already = current.candidates.some((item) => same(item.sourceValue, sourceValue) && item.normalizedValue === normalizedValue)
  if (already) {
    return current
  }

  return { status: 'ambiguous', candidates: [...current.candidates, { sourceValue, normalizedValue, evidence }] }
}

function observeUnparsed(current: ExtractedField, evidence: FieldEvidence): ExtractedField {
  if (current.status === 'missing') {
    return { status: 'unparsed', evidence: [evidence] }
  }

  if (current.status === 'unparsed') {
    return { status: 'unparsed', evidence: [...current.evidence, evidence] }
  }

  if (current.status === 'found') {
    const previous = candidateFromFound(current)
    if (!previous) {
      return { status: 'unparsed', evidence: [evidence] }
    }

    return {
      status: 'ambiguous',
      candidates: [previous, { sourceValue: evidence.text, normalizedValue: null, evidence }],
    }
  }

  return {
    status: 'ambiguous',
    candidates: [...current.candidates, { sourceValue: evidence.text, normalizedValue: null, evidence }],
  }
}

function candidateFromFound(field: Extract<ExtractedField, { status: 'found' }>): FieldCandidate | null {
  const evidence = field.evidence[0]
  if (!evidence) {
    return null
  }

  return { sourceValue: field.sourceValue, normalizedValue: field.normalizedValue, evidence }
}

/**
 * Read one date without choosing between two possible calendars.
 * A slash or hyphen date is unparsed when both numbers are 12 or less.
 */
export function interpretDate(value: string): { kind: 'date'; source: string; iso: string } | { kind: 'unparsed' } {
  return parseDate(value)
}

function parseDate(value: string): { kind: 'date'; source: string; iso: string } | { kind: 'unparsed' } {
  const source = value.trim()
  if (source.length === 0 || /^\d{1,2}[./-]\d{1,2}[./-]\d{2}$/u.test(source)) {
    return { kind: 'unparsed' }
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(source)
  if (isoMatch) {
    const iso = isoFromParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
    return iso ? { kind: 'date', source, iso } : { kind: 'unparsed' }
  }

  const dayMonth = DAY_MONTH.exec(source)
  if (dayMonth && source === dayMonth[0]) {
    const iso = isoFromParts(Number(dayMonth[3]), monthNumber(dayMonth[2] ?? ''), Number(dayMonth[1]))
    return iso ? { kind: 'date', source, iso } : { kind: 'unparsed' }
  }

  const monthDay = MONTH_DAY.exec(source)
  if (monthDay && source === monthDay[0]) {
    const iso = isoFromParts(Number(monthDay[3]), monthNumber(monthDay[1] ?? ''), Number(monthDay[2]))
    return iso ? { kind: 'date', source, iso } : { kind: 'unparsed' }
  }

  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/u.exec(source)
  if (dotted) {
    const iso = isoFromParts(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]))
    return iso ? { kind: 'date', source, iso } : { kind: 'unparsed' }
  }

  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/u.exec(source)
  if (numeric) {
    const first = Number(numeric[1])
    const second = Number(numeric[2])
    const year = Number(numeric[3])
    if (first > 12 && second <= 12) {
      const iso = isoFromParts(year, second, first)
      return iso ? { kind: 'date', source, iso } : { kind: 'unparsed' }
    }

    if (second > 12 && first <= 12) {
      const iso = isoFromParts(year, first, second)
      return iso ? { kind: 'date', source, iso } : { kind: 'unparsed' }
    }

    return { kind: 'unparsed' }
  }

  return { kind: 'unparsed' }
}

function splitFollowUp(value: string): {
  date: { source: string; iso: string } | 'ambiguous' | null
  instructions: string | null
} {
  const candidates = dateSpans(value)
  if (candidates.length === 0) {
    return { date: null, instructions: value.trim() }
  }

  if (candidates.length > 1) {
    return { date: 'ambiguous', instructions: null }
  }

  const span = candidates[0]
  if (!span) {
    return { date: 'ambiguous', instructions: null }
  }

  const parsed = parseDate(span.token)
  if (parsed.kind !== 'date') {
    return { date: 'ambiguous', instructions: null }
  }

  const instructions = `${value.slice(0, span.start)} ${value.slice(span.end)}`.replace(/\s+/g, ' ').trim().replace(/^[.,;:\s]+|[.,;:\s]+$/g, '')
  return { date: { source: span.token, iso: parsed.iso }, instructions: instructions.length > 0 ? instructions : null }
}

function dateSpans(value: string): { token: string; start: number; end: number }[] {
  const patterns = [
    new RegExp(DAY_MONTH.source, 'giu'),
    new RegExp(MONTH_DAY.source, 'giu'),
    /\d{4}-\d{2}-\d{2}/gu,
    /\d{1,2}\.\d{1,2}\.\d{4}/gu,
    /\d{1,2}[/-]\d{1,2}[/-]\d{4}/gu,
  ]
  const spans: { token: string; start: number; end: number }[] = []

  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      if (match.index === undefined) {
        continue
      }

      const start = match.index
      const end = start + match[0].length
      const overlaps = spans.some((span) => start < span.end && end > span.start)
      if (!overlaps) {
        spans.push({ token: match[0], start, end })
      }
    }
  }

  return spans
}

function documentTypeValue(value: string): DocumentType | null {
  const key = normalizeText(value)
  if (key === 'discharge-letter' || key === 'entlassbrief' || key === 'ärztlicher entlassbrief') {
    return 'discharge-letter'
  }

  if (key === 'medication-plan' || key === 'medikationsplan') {
    return 'medication-plan'
  }

  return null
}

function outcomeFor(data: ExtractedDocumentFields): StructuredDocumentExtraction['outcome'] {
  const fields = allFields(data)
  const found = fields.some((field) => field.status === 'found' || field.status === 'ambiguous')
  const unresolved = fields.some((field) => field.status === 'ambiguous' || field.status === 'unparsed') || data.unparsed.length > 0
  if (!found && !unresolved) {
    return 'no-fields'
  }

  if (unresolved) {
    return 'partial'
  }

  return 'completed'
}

function allFields(data: ExtractedDocumentFields): ExtractedField[] {
  return [
    data.patient.patientId,
    data.patient.name,
    data.patient.dateOfBirth,
    data.documentType,
    data.documentDate,
    data.dischargeDate,
    data.followUp.date,
    data.followUp.instructions,
    data.treatment,
    ...data.medications.flatMap((medication) => [
      medication.name,
      medication.strength,
      medication.dosage,
      medication.instructions,
      medication.route,
      medication.frequency,
      medication.startDate,
      medication.endDate,
    ]),
  ]
}

function emptyPatient(): ExtractedPatientFields {
  return { patientId: missingField(), name: missingField(), dateOfBirth: missingField() }
}

function emptyFollowUp(): ExtractedFollowUpFields {
  return { date: missingField(), instructions: missingField() }
}

function emptyMedication(): MedicationDraft {
  return {
    name: missingField(),
    strength: missingField(),
    dosage: missingField(),
    instructions: missingField(),
    route: missingField(),
    frequency: missingField(),
    startDate: missingField(),
    endDate: missingField(),
  }
}

function freezeMedication(medication: MedicationDraft): ExtractedMedicationFields {
  return { ...medication }
}

function missingField(): ExtractedField {
  return { status: 'missing' }
}

function nameKey(medication: MedicationDraft): string | null {
  return medication.name.status === 'found' ? normalizeMedicationName(medication.name.sourceValue) : null
}

function sameDate(left: string, right: string): boolean {
  const parsedLeft = parseDate(left)
  const parsedRight = parseDate(right)
  if (parsedLeft.kind === 'date' && parsedRight.kind === 'date') {
    return parsedLeft.iso === parsedRight.iso
  }

  return normalizeText(left) === normalizeText(right)
}

function sameStrength(left: string, right: string): boolean {
  return left.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('de-DE') ===
    right.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('de-DE')
}

function monthNumber(name: string): number {
  return MONTHS[name.toLocaleLowerCase('de-DE')] ?? 0
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) {
    return null
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function textSourceOf(page: ExtractedPdfPage): StructuredTextSource {
  return page.method === 'embedded' || page.method === 'ocr' ? page.method : 'unspecified'
}

function collapseLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isTextResult(value: unknown): value is PdfTextExtractionResult {
  if (!isRecord(value) || typeof value.fileName !== 'string' || !Array.isArray(value.pages)) {
    return false
  }

  return value.pages.every(
    (page) =>
      isRecord(page) &&
      typeof page.pageNumber === 'number' &&
      Number.isInteger(page.pageNumber) &&
      page.pageNumber >= 1 &&
      typeof page.text === 'string',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
