/** How the text on one page was obtained. */
export type PdfPageExtractionMethod = 'embedded' | 'ocr'

/**
 * How the document's text was obtained.
 * `mixed` means some pages used embedded text and others used OCR.
 */
export type PdfExtractionSource = 'embedded' | 'ocr' | 'mixed'

/**
 * Text taken from one PDF page.
 * `pageNumber` is 1-based, matching the page a reviewer would open.
 * `method` is omitted by the embedded-text reader and set when OCR fallback runs.
 * `confidence` is the recognizer's score for an OCR page. It is not a clinical judgment.
 */
export interface ExtractedPdfPage {
  pageNumber: number
  text: string
  method?: PdfPageExtractionMethod
  confidence?: number | null
}

/**
 * Text read from a PDF.
 * This is not a healthcare document and it is not a review finding.
 * Page text stays intact so later evidence can name the page it came from.
 */
export interface PdfTextExtractionResult {
  fileName: string
  pageCount: number
  pages: ExtractedPdfPage[]
  fullText: string
  hasExtractableText: boolean
  source?: PdfExtractionSource
}

/** How a structured field was read from page text. This is not a clinical check. */
export type StructuredFieldMethod = 'rule-based'

/** Where the page text came from. `unspecified` means the page did not say. */
export type StructuredTextSource = PdfPageExtractionMethod | 'unspecified'

/**
 * The labeled span that supports one value.
 * `text` is the source span, not a normalized replacement.
 */
export interface FieldEvidence {
  pageNumber: number
  text: string
  method: StructuredFieldMethod
  textSource: StructuredTextSource
}

export interface FieldCandidate {
  sourceValue: string
  normalizedValue: string | null
  evidence: FieldEvidence
}

/**
 * One structured field.
 * `found` keeps the source text and a normalized value only when parsing is unambiguous.
 * `missing` means no supported label was present. `unparsed` means a label was present but the value was not read confidently.
 * `ambiguous` means more than one candidate was present and none was selected.
 */
export type ExtractedField =
  | {
      status: 'found'
      sourceValue: string
      normalizedValue: string | null
      evidence: readonly FieldEvidence[]
    }
  | { status: 'missing' }
  | { status: 'ambiguous'; candidates: readonly FieldCandidate[] }
  | { status: 'unparsed'; evidence: readonly FieldEvidence[] }

/**
 * Field names match `PatientIdentity`. Any of them may be missing.
 * This is not a `PatientIdentity`, because that type requires every field.
 */
export interface ExtractedPatientFields {
  patientId: ExtractedField
  name: ExtractedField
  dateOfBirth: ExtractedField
}

/**
 * Name, strength, dosage, and instructions match `MedicationEntry`.
 * Route, frequency, and start or end dates are explicit labels only.
 * They are not `MedicationEntry` fields and are not compared.
 * Strength is the preparation. Dosage is how it is taken.
 */
export interface ExtractedMedicationFields {
  name: ExtractedField
  strength: ExtractedField
  dosage: ExtractedField
  instructions: ExtractedField
  route: ExtractedField
  frequency: ExtractedField
  startDate: ExtractedField
  endDate: ExtractedField
}

/** Follow-up is one labeled date and any remaining instruction text. It is not a finding. */
export interface ExtractedFollowUpFields {
  date: ExtractedField
  instructions: ExtractedField
}

export interface ExtractedDocumentFields {
  patient: ExtractedPatientFields
  documentType: ExtractedField
  documentDate: ExtractedField
  dischargeDate: ExtractedField
  medications: readonly ExtractedMedicationFields[]
  followUp: ExtractedFollowUpFields
  treatment: ExtractedField
  unparsed: readonly FieldEvidence[]
}

/**
 * `completed` means at least one field was found and none were ambiguous or unparsed.
 * Missing fields stay missing. `partial` means a field was ambiguous or could not be read.
 * `no-fields` means the text had no supported label. `unsupported` means the input was not page text.
 */
export type StructuredExtractionOutcome = 'completed' | 'partial' | 'no-fields' | 'unsupported'

/**
 * Structured reading of one text extraction result.
 * This is not a `HealthcareDocument` and it is not a review finding.
 */
export interface StructuredDocumentExtraction {
  fileName: string
  source: PdfExtractionSource | 'unspecified'
  outcome: StructuredExtractionOutcome
  data: ExtractedDocumentFields | null
}
