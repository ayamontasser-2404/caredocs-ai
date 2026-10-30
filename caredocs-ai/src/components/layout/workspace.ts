import { sampleDischargeLetter } from '../../data/sampleDischargeLetter.ts'
import { sampleMedicationPlan } from '../../data/sampleMedicationPlan.ts'
import type { ComparisonBlockReason } from '../../features/document-review/comparison/prepare-comparison-input.ts'
import { ComparisonInputError } from '../../features/document-review/comparison/assertions.ts'
import { prepareComparisonInput } from '../../features/document-review/comparison/prepare-comparison-input.ts'
import { extractDocumentData } from '../../features/document-review/extraction/extract-document-data.ts'
import type {
  PdfTextExtractionResult,
  StructuredDocumentExtraction,
} from '../../features/document-review/extraction/extraction-types.ts'
import {
  confirmReviewedField as confirmField,
  createDocumentVerification,
  editReviewedValue,
} from '../../features/document-review/verification/review-extracted-document.ts'
import type { DocumentVerification } from '../../features/document-review/verification/verification-types.ts'
import { createReviewSession } from '../../features/document-review/review-session.ts'
import type { DocumentType, HealthcareDocument } from '../../types/document.ts'
import type { FindingEvidence, ReviewChecklistItem, ReviewState } from '../../types/review.ts'

export type AppPage = 'home' | 'new-review'

export type ComparisonPhase = 'idle' | 'comparing' | 'ready' | 'error' | 'blocked'

/** Progress of reading one PDF. This is not the comparison phase and not a finding status. */
export type ExtractionStatus = 'idle' | 'extracting' | 'success' | 'no-text' | 'error'

export interface SlotExtraction {
  status: ExtractionStatus
  fileName: string | null
  result: PdfTextExtractionResult | null
  structured: StructuredDocumentExtraction | null
  verification: DocumentVerification | null
  message: string | null
}

export interface DocumentSlot {
  document: HealthcareDocument | null
  filename: string | null
  errors: readonly string[]
  extraction: SlotExtraction
}

export interface WorkspaceState {
  page: AppPage
  letter: DocumentSlot
  plan: DocumentSlot
  phase: ComparisonPhase
  review: ReviewState | null
  compareError: string | null
  blockReasons: readonly ComparisonBlockReason[]
  /** Documents passed to the last successful comparison. Cleared when inputs change. */
  comparedDocuments: readonly HealthcareDocument[] | null
  activeEvidence: FindingEvidence | null
}

function idleExtraction(): SlotExtraction {
  return { status: 'idle', fileName: null, result: null, structured: null, verification: null, message: null }
}

function emptySlot(): DocumentSlot {
  return { document: null, filename: null, errors: [], extraction: idleExtraction() }
}

export function initialWorkspace(): WorkspaceState {
  return {
    page: 'home',
    letter: emptySlot(),
    plan: emptySlot(),
    phase: 'idle',
    review: null,
    compareError: null,
    blockReasons: [],
    comparedDocuments: null,
    activeEvidence: null,
  }
}

export function showPage(state: WorkspaceState, page: AppPage): WorkspaceState {
  return { ...state, page }
}

export function canCompare(state: WorkspaceState): boolean {
  return slotHasDocument(state.letter) && slotHasDocument(state.plan) && state.phase !== 'comparing'
}

export function usingSample(type: DocumentType, slot: DocumentSlot): boolean {
  const sample = type === 'discharge-letter' ? sampleDischargeLetter : sampleMedicationPlan
  return slot.document === sample
}

export function acceptDocument(
  state: WorkspaceState,
  type: DocumentType,
  document: HealthcareDocument,
  filename: string,
  sample: boolean,
): WorkspaceState {
  const slot: DocumentSlot = {
    document,
    filename: sample ? `${filename} (sample)` : filename,
    errors: [],
    extraction: idleExtraction(),
  }

  return clearReview(assignSlot(state, type, slot))
}

/**
 * Start reading a PDF into this slot.
 * The PDF replaces any structured document in the slot. It does not create findings.
 */
export function beginExtraction(state: WorkspaceState, type: DocumentType, fileName: string): WorkspaceState {
  return clearReview(
    assignSlot(state, type, {
      document: null,
      filename: fileName,
      errors: [],
      extraction: {
        status: 'extracting',
        fileName,
        result: null,
        structured: null,
        verification: null,
        message: 'Reading embedded PDF text…',
      },
    }),
  )
}

/**
 * Store text read from a PDF. Ignored when this slot is no longer extracting.
 * A PDF with no usable text is still a successful read.
 */
export function finishExtraction(
  state: WorkspaceState,
  type: DocumentType,
  result: PdfTextExtractionResult,
): WorkspaceState {
  const current = slotFor(state, type)
  if (current.extraction.status !== 'extracting') {
    return state
  }

  const structured = extractDocumentData(result)

  return clearReview(
    assignSlot(state, type, {
      document: null,
      filename: result.fileName,
      errors: [],
      extraction: {
        status: result.hasExtractableText ? 'success' : 'no-text',
        fileName: result.fileName,
        result,
        structured,
        verification: createDocumentVerification(structured, result.pages, result.pageCount),
        message: completionMessage(result),
      },
    }),
  )
}

/** Store a reviewer's edit without changing the extracted value or its evidence. */
export function editReviewedField(
  state: WorkspaceState,
  type: DocumentType,
  path: string,
  value: string,
): WorkspaceState {
  return mapVerification(state, type, (verification) => editReviewedValue(verification, path, value))
}

/** Confirm one field. Invalid values are left unconfirmed. */
export function confirmReviewedField(state: WorkspaceState, type: DocumentType, path: string): WorkspaceState {
  return mapVerification(state, type, (verification) => confirmField(verification, path))
}

/** Replace the in-progress status text. Ignored once the read has finished. */
export function updateExtractionProgress(
  state: WorkspaceState,
  type: DocumentType,
  message: string,
): WorkspaceState {
  const current = slotFor(state, type)
  if (current.extraction.status !== 'extracting') {
    return state
  }

  return assignSlot(state, type, {
    ...current,
    extraction: { ...current.extraction, message },
  })
}

/** Record a failed read without turning it into an empty extraction result. */
export function failExtraction(state: WorkspaceState, type: DocumentType, message: string): WorkspaceState {
  const current = slotFor(state, type)
  if (current.extraction.status !== 'extracting') {
    return state
  }

  return assignSlot(state, type, {
    ...current,
    extraction: {
      status: 'error',
      fileName: current.extraction.fileName,
      result: null,
      structured: null,
      verification: null,
      message,
    },
  })
}

/** Remove a failed read so a later validation message is the one shown for this slot. */
export function clearExtractionError(state: WorkspaceState, type: DocumentType): WorkspaceState {
  const current = slotFor(state, type)
  if (current.extraction.status !== 'error') {
    return state
  }

  return assignSlot(state, type, { ...current, extraction: idleExtraction() })
}

/** Drop an in-progress read so a newer file selection cannot be overwritten by it. */
export function cancelExtraction(state: WorkspaceState, type: DocumentType): WorkspaceState {
  const current = slotFor(state, type)
  if (current.extraction.status !== 'extracting') {
    return state
  }

  return assignSlot(state, type, { ...current, extraction: idleExtraction() })
}

export function rejectUpload(
  state: WorkspaceState,
  type: DocumentType,
  errors: readonly string[],
): WorkspaceState {
  const current = slotFor(state, type)

  return assignSlot(state, type, { ...current, errors })
}

export function removeDocument(state: WorkspaceState, type: DocumentType): WorkspaceState {
  return clearReview(assignSlot(state, type, emptySlot()))
}

/** Start a comparison, or record why the current pair cannot be compared. */
export function requestCompare(state: WorkspaceState): WorkspaceState {
  const prepared = prepareComparisonInput(slotInput(state.letter), slotInput(state.plan))
  if (prepared.status === 'ineligible') {
    return blockCompare(state, prepared.reasons)
  }

  return beginCompare(state)
}

/**
 * Compare the current pair with the existing engine.
 * Ignored unless a comparison is already in progress.
 * An ineligible pair becomes a blocked result, not an empty finding list.
 */
export function completeCompare(
  state: WorkspaceState,
  checklist: readonly ReviewChecklistItem[],
): WorkspaceState {
  if (state.phase !== 'comparing') {
    return state
  }

  const prepared = prepareComparisonInput(slotInput(state.letter), slotInput(state.plan))
  if (prepared.status === 'ineligible') {
    return blockCompare(state, prepared.reasons)
  }

  try {
    return finishCompare(
      state,
      createReviewSession([prepared.letter, prepared.plan], checklist),
      [prepared.letter, prepared.plan],
    )
  } catch (error) {
    const message =
      error instanceof ComparisonInputError ? error.message : 'The documents could not be compared.'
    return failCompare(state, message)
  }
}

export function beginCompare(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    phase: 'comparing',
    review: null,
    compareError: null,
    blockReasons: [],
    comparedDocuments: null,
    activeEvidence: null,
  }
}

export function finishCompare(
  state: WorkspaceState,
  review: ReviewState,
  documents: readonly HealthcareDocument[],
): WorkspaceState {
  if (state.phase !== 'comparing') {
    return state
  }

  return {
    ...state,
    phase: 'ready',
    review,
    compareError: null,
    blockReasons: [],
    comparedDocuments: documents,
    activeEvidence: null,
  }
}

export function blockCompare(state: WorkspaceState, reasons: readonly ComparisonBlockReason[]): WorkspaceState {
  return {
    ...state,
    phase: 'blocked',
    review: null,
    compareError: null,
    blockReasons: reasons,
    comparedDocuments: null,
    activeEvidence: null,
  }
}

export function failCompare(state: WorkspaceState, message: string): WorkspaceState {
  if (state.phase !== 'comparing') {
    return state
  }

  return {
    ...state,
    phase: 'error',
    review: null,
    compareError: message,
    blockReasons: [],
    comparedDocuments: null,
    activeEvidence: null,
  }
}

export function documentsInReview(state: WorkspaceState): readonly HealthcareDocument[] {
  if (state.phase !== 'ready' || state.comparedDocuments === null) {
    return []
  }

  return state.comparedDocuments
}

function completionMessage(result: PdfTextExtractionResult): string | null {
  if (!result.hasExtractableText) {
    return null
  }

  if (result.source === 'ocr' || result.source === 'mixed') {
    return 'OCR completed'
  }

  return null
}

function clearReview(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    phase: 'idle',
    review: null,
    compareError: null,
    blockReasons: [],
    comparedDocuments: null,
    activeEvidence: null,
  }
}

function slotHasDocument(slot: DocumentSlot): boolean {
  return slot.document !== null || slot.extraction.status === 'success' || slot.extraction.status === 'no-text'
}

function slotInput(slot: DocumentSlot): { document: HealthcareDocument | null; verification: DocumentVerification | null } {
  return { document: slot.document, verification: slot.extraction.verification }
}

function assignSlot(state: WorkspaceState, type: DocumentType, slot: DocumentSlot): WorkspaceState {
  return type === 'discharge-letter' ? { ...state, letter: slot } : { ...state, plan: slot }
}

function slotFor(state: WorkspaceState, type: DocumentType): DocumentSlot {
  return type === 'discharge-letter' ? state.letter : state.plan
}

function mapVerification(
  state: WorkspaceState,
  type: DocumentType,
  update: (verification: DocumentVerification) => DocumentVerification,
): WorkspaceState {
  const current = slotFor(state, type)
  if (!current.extraction.verification) {
    return state
  }

  return clearReview(
    assignSlot(state, type, {
      ...current,
      document: null,
      extraction: {
        ...current.extraction,
        verification: update(current.extraction.verification),
      },
    }),
  )
}
