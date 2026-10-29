import Tesseract from 'tesseract.js'
import { PdfTextExtractionError } from './extract-pdf-text.ts'

/**
 * Tesseract's language code for German.
 * The supported sample documents are German discharge letters and medication plans.
 * The page image is passed to a local worker. Tesseract.js may download `deu`
 * language data and its WASM core on first use. It does not send the page to an OCR API.
 */
export const ocrLanguage = 'deu'

export interface OcrRecognition {
  text: string
  confidence: number | null
}

interface OcrWorker {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text?: string; confidence?: number } }>
  terminate(): Promise<unknown>
}

export interface OcrSession {
  recognize: (image: HTMLCanvasElement) => Promise<OcrRecognition>
  dispose: () => Promise<void>
}

/**
 * One worker recognizes every scanned page in a document, then it is terminated.
 */
export async function createOcrSession(options?: {
  createWorker?: (language: string) => Promise<OcrWorker>
}): Promise<OcrSession> {
  const createWorker = options?.createWorker ?? createGermanWorker
  let worker: OcrWorker

  try {
    worker = await createWorker(ocrLanguage)
  } catch (error) {
    throw toOcrError(error)
  }

  return {
    async recognize(image: HTMLCanvasElement): Promise<OcrRecognition> {
      try {
        const result = await worker.recognize(image)
        return {
          text: typeof result.data.text === 'string' ? result.data.text : '',
          confidence: readConfidence(result.data.confidence),
        }
      } catch (error) {
        throw toOcrError(error)
      }
    },
    async dispose(): Promise<void> {
      await worker.terminate().catch(() => undefined)
    },
  }
}

async function createGermanWorker(language: string): Promise<OcrWorker> {
  return Tesseract.createWorker(language)
}

function readConfidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toOcrError(error: unknown): PdfTextExtractionError {
  if (error instanceof PdfTextExtractionError) {
    return error
  }

  return new PdfTextExtractionError('Unable to process this document.')
}
