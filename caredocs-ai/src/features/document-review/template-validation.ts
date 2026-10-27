import type {
  DocumentType,
  HealthcareDocument,
  MedicationEntry,
} from '../../types/document.ts'

export interface TemplateSection {
  id: string
  title: string
}

export const dischargeLetterTemplate = [
  { id: 'admission-reason', title: 'Aufnahmegrund' },
  { id: 'diagnoses', title: 'Diagnosen' },
  { id: 'findings', title: 'Befunde' },
  { id: 'treatment', title: 'Therapie und klinischer Verlauf' },
  { id: 'medication', title: 'Medikation bei Entlassung' },
  { id: 'follow-up', title: 'Empfehlungen zur Weiterbehandlung und Nachsorge' },
] as const satisfies readonly TemplateSection[]

export const medicationPlanTemplate = [
  { id: 'patient', title: 'Patientendaten' },
  { id: 'medication', title: 'Medikamentenübersicht' },
] as const satisfies readonly TemplateSection[]

export type TemplateValidationResult =
  | { ok: true; document: HealthcareDocument }
  | { ok: false; messages: readonly string[] }

interface ParsedSection {
  id: string
  title: string
  content: string
}

/**
 * Read an uploaded JSON file and accept it only when it matches the slot's template.
 * Messages name section ids and missing fields. They do not quote patient or medication values.
 */
export function parseDocumentUpload(
  contents: string,
  expectedType: DocumentType,
): TemplateValidationResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(contents)
  } catch {
    return { ok: false, messages: ['The file is not valid JSON.'] }
  }

  return validateDocumentTemplate(parsed, expectedType)
}

export function validateDocumentTemplate(
  value: unknown,
  expectedType: DocumentType,
): TemplateValidationResult {
  if (!isRecord(value)) {
    return { ok: false, messages: ['The file does not match the document template.'] }
  }

  const typeMessage = typeMismatch(value.type, expectedType)
  if (typeMessage) {
    return { ok: false, messages: [typeMessage] }
  }

  const messages: string[] = []
  const id = requiredText(value.id, 'The document is missing an id.', messages)
  const title = requiredText(value.title, 'The document is missing a title.', messages)
  const filename = requiredText(value.filename, 'The document is missing a filename.', messages)
  const createdAt = requiredText(value.createdAt, 'The document is missing a creation date.', messages)

  if (value.synthetic !== true) {
    messages.push('The document must be marked synthetic.')
  }

  const demoNotice = requiredText(value.demoNotice, 'The document is missing a demo notice.', messages)
  const patient = readPatient(value.patient, messages)
  const sections = readSections(value.sections, expectedType, messages)
  const medications = readMedications(value.medications, messages)

  if (
    messages.length > 0 ||
    !id ||
    !title ||
    !filename ||
    !createdAt ||
    !demoNotice ||
    !patient ||
    !sections ||
    !medications
  ) {
    return { ok: false, messages: uniqueMessages(messages) }
  }

  return {
    ok: true,
    document: {
      id,
      type: expectedType,
      title,
      filename,
      createdAt,
      patient,
      sections,
      medications,
      synthetic: true,
      demoNotice,
    },
  }
}

export function templateFor(type: DocumentType): readonly TemplateSection[] {
  return type === 'discharge-letter' ? dischargeLetterTemplate : medicationPlanTemplate
}

function typeMismatch(value: unknown, expectedType: DocumentType): string | undefined {
  if (value === expectedType) {
    return undefined
  }

  const expectedLabel = expectedType === 'discharge-letter' ? 'discharge letter' : 'medication plan'
  const uploadedLabel =
    value === 'discharge-letter'
      ? 'discharge letter'
      : value === 'medication-plan'
        ? 'medication plan'
        : undefined

  if (!uploadedLabel) {
    return `The document type does not match this ${expectedLabel} slot.`
  }

  return `This slot expects a ${expectedLabel}, and the file is a ${uploadedLabel}.`
}

function readPatient(
  value: unknown,
  messages: string[],
): HealthcareDocument['patient'] | undefined {
  if (!isRecord(value)) {
    messages.push('The document is missing a patient.')
    return undefined
  }

  const patientId = requiredText(value.patientId, 'The document is missing a patient id.', messages)
  const name = requiredText(value.name, 'The document is missing a patient name.', messages)
  const dateOfBirth = requiredText(
    value.dateOfBirth,
    'The document is missing a date of birth.',
    messages,
  )

  if (!patientId || !name || !dateOfBirth) {
    return undefined
  }

  return { patientId, name, dateOfBirth }
}

function readSections(
  value: unknown,
  expectedType: DocumentType,
  messages: string[],
): HealthcareDocument['sections'] | undefined {
  if (!Array.isArray(value)) {
    messages.push('The document is missing sections.')
    return undefined
  }

  const before = messages.length
  const parsed: ParsedSection[] = []
  let invalid = false

  for (const item of value) {
    if (!isRecord(item) || !hasText(item.id)) {
      invalid = true
      continue
    }

    parsed.push({
      id: item.id.trim(),
      title: typeof item.title === 'string' ? item.title : '',
      content: typeof item.content === 'string' ? item.content : '',
    })
  }

  if (invalid) {
    messages.push('The document contains an invalid section.')
  }

  const required = templateFor(expectedType)
  const requiredIds = new Set(required.map((section) => section.id))

  for (const section of required) {
    const matches = parsed.filter((item) => item.id === section.id)

    if (matches.length === 0) {
      messages.push(`Missing section: ${section.id}.`)
      continue
    }

    if (matches.length > 1) {
      messages.push(`Duplicate section: ${section.id}.`)
      continue
    }

    const [match] = matches
    if (!match || !hasText(match.content)) {
      messages.push(`Section ${section.id} has no content.`)
    }

    if (!match || !hasText(match.title)) {
      messages.push(`Section ${section.id} is missing a title.`)
    }
  }

  const extras = new Map<string, number>()
  for (const section of parsed) {
    if (requiredIds.has(section.id)) {
      continue
    }

    extras.set(section.id, (extras.get(section.id) ?? 0) + 1)
  }

  for (const [id, count] of extras) {
    const match = parsed.find((section) => section.id === id)

    if (count > 1) {
      messages.push(`Duplicate section: ${id}.`)
    }

    if (count === 1 && match && !hasText(match.content)) {
      messages.push(`Section ${id} has no content.`)
    }

    if (count === 1 && match && !hasText(match.title)) {
      messages.push(`Section ${id} is missing a title.`)
    }
  }

  if (messages.length !== before) {
    return undefined
  }

  return parsed.map((section) => ({
    id: section.id,
    title: section.title,
    content: section.content,
  }))
}

function readMedications(value: unknown, messages: string[]): MedicationEntry[] | undefined {
  if (!Array.isArray(value)) {
    messages.push('The document is missing medication lines.')
    return undefined
  }

  if (value.length === 0) {
    messages.push('The document has no medication lines.')
    return undefined
  }

  const medications: MedicationEntry[] = []
  let invalid = false

  for (const item of value) {
    if (!isRecord(item)) {
      invalid = true
      continue
    }

    const name = hasText(item.name) ? item.name : undefined
    const strength = hasText(item.strength) ? item.strength : undefined
    const dosage = hasText(item.dosage) ? item.dosage : undefined

    if (!name) {
      messages.push('A medication line is missing a name.')
    }
    if (!strength) {
      messages.push('A medication line is missing a strength.')
    }
    if (!dosage) {
      messages.push('A medication line is missing a dosage.')
    }

    if (item.instructions !== undefined && typeof item.instructions !== 'string') {
      messages.push('A medication line has invalid administration instructions.')
    }

    if (!name || !strength || !dosage) {
      invalid = true
      continue
    }

    const entry: MedicationEntry = { name, strength, dosage }
    if (typeof item.instructions === 'string') {
      entry.instructions = item.instructions
    }
    medications.push(entry)
  }

  if (invalid || medications.length !== value.length) {
    return undefined
  }

  return medications
}

function requiredText(value: unknown, message: string, messages: string[]): string | undefined {
  if (!hasText(value)) {
    messages.push(message)
    return undefined
  }

  return value
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function uniqueMessages(messages: readonly string[]): string[] {
  return [...new Set(messages)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
