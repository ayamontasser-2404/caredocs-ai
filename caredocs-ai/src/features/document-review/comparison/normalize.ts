/**
 * Comparison-only normalization. Callers must keep using the original source values
 * in findings and must not write these results back onto a document.
 */

/** Trim, collapse whitespace, and compare case-insensitively for German text. */
export function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')
}

/** Medication names match exactly after normalization. Brand and generic names are not equated. */
export function normalizeMedicationName(value: string): string {
  return normalizeText(value).replace(/[.,;:]+$/g, '')
}

/** Blank optional text is treated as absent, not as a clinical instruction. */
export function normalizeOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = normalizeText(value)
  return normalized.length === 0 ? undefined : normalized
}

export function slug(value: string): string {
  const withoutMarks = value.normalize('NFKD').replace(/\p{M}/gu, '')
  const token = withoutMarks.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  return token.toUpperCase() || 'UNKNOWN'
}
