import { sampleDischargeLetter } from '../../data/sampleDischargeLetter.ts'
import { sampleMedicationPlan } from '../../data/sampleMedicationPlan.ts'
import type { PdfTextExtractionResult } from '../../features/document-review/extraction/extraction-types.ts'
import type { DocumentType, HealthcareDocument } from '../../types/document.ts'
import type { FindingEvidence, ReviewState } from '../../types/review.ts'

export type AppPage = 'home' | 'new-review'

export type ComparisonPhase = 'idle' | 'comparing' | 'ready' | 'error'

/** Progress of reading one PDF. This is not the comparison phase and not a finding status. */
export type ExtractionStatus = 'idle' | 'extracting' | 'success' | 'no-text' | 'error'

export interface SlotExtraction {
  status: ExtractionStatus
  fileName: string | null
  result: PdfTextExtractionResult | null
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
  activeEvidence: FindingEvidence | null
}

function idleExtraction(): SlotExtraction {
  return { status: 'idle', fileName: null, result: null, message: null }
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
    activeEvidence: null,
  }
}

export function showPage(state: WorkspaceState, page: AppPage): WorkspaceState {
  return { ...state, page }
}

export function canCompare(state: WorkspaceState): boolean {
  return state.letter.document !== null && state.plan.document !== null && state.phase !== 'comparing'
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
      extraction: { status: 'extracting', fileName, result: null, message: null },
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

  return clearReview(
    assignSlot(state, type, {
      document: null,
      filename: result.fileName,
      errors: [],
      extraction: {
        status: result.hasExtractableText ? 'success' : 'no-text',
        fileName: result.fileName,
        result,
        message: null,
      },
    }),
  )
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

export function beginCompare(state: WorkspaceState): WorkspaceState {
  if (state.letter.document === null || state.plan.document === null) {
    return state
  }

  return {
    ...state,
    phase: 'comparing',
    review: null,
    compareError: null,
    activeEvidence: null,
  }
}

export function finishCompare(state: WorkspaceState, review: ReviewState): WorkspaceState {
  if (state.phase !== 'comparing') {
    return state
  }

  return {
    ...state,
    phase: 'ready',
    review,
    compareError: null,
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
    activeEvidence: null,
  }
}

export function documentsInReview(state: WorkspaceState): readonly HealthcareDocument[] {
  if (state.phase !== 'ready' || state.letter.document === null || state.plan.document === null) {
    return []
  }

  return [state.letter.document, state.plan.document]
}

function clearReview(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    phase: 'idle',
    review: null,
    compareError: null,
    activeEvidence: null,
  }
}

function assignSlot(state: WorkspaceState, type: DocumentType, slot: DocumentSlot): WorkspaceState {
  return type === 'discharge-letter' ? { ...state, letter: slot } : { ...state, plan: slot }
}

function slotFor(state: WorkspaceState, type: DocumentType): DocumentSlot {
  return type === 'discharge-letter' ? state.letter : state.plan
}
