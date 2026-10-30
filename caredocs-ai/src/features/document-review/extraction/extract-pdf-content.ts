import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  extractPdfText,
  openValidatedPdf,
  PdfTextExtractionError,
  type OpenPdf,
} from './extract-pdf-text.ts'
import type {
  ExtractedPdfPage,
  PdfExtractionSource,
  PdfTextExtractionResult,
} from './extraction-types.ts'
import { releaseCanvas, renderPdfPage } from './render-pdf-page.ts'
import { createOcrSession, type OcrSession } from './run-ocr.ts'

export interface ExtractionProgress {
  message: string
}

/** Stop before recognizing more scanned pages than this. The file is not partially read. */
export const maxOcrPages = 20

/** Safety stop for one PDF read. This is not a measured performance guarantee. */
export const maxPdfProcessingMs = 3 * 60 * 1000

export const pdfReadCancelledMessage = 'Reading this PDF was cancelled. The document was not saved.'
export const pdfReadTimeoutMessage = 'Reading this PDF took too long. The document was not saved.'

export interface ExtractPdfContentOptions {
  onProgress?: (progress: ExtractionProgress) => void
  readEmbedded?: typeof extractPdfText
  openPdf?: (file: File) => Promise<OpenPdf>
  renderPage?: (pdf: PDFDocumentProxy, pageNumber: number) => Promise<HTMLCanvasElement>
  createRecognizer?: () => Promise<OcrSession>
  signal?: AbortSignal
  processingTimeoutMs?: number
}

/**
 * Read embedded text, then recognize only pages that have none.
 * A text page is not sent to OCR. OCR output is not a review finding.
 */
export async function extractPdfContent(
  file: File,
  options: ExtractPdfContentOptions = {},
): Promise<PdfTextExtractionResult> {
  const stop = new AbortController()
  const timeoutMs = options.processingTimeoutMs ?? maxPdfProcessingMs
  const timer = setTimeout(() => {
    stop.abort(new PdfTextExtractionError(pdfReadTimeoutMessage))
  }, timeoutMs)
  const onCallerAbort = () => {
    const reason = options.signal?.reason
    stop.abort(reason instanceof PdfTextExtractionError ? reason : new PdfTextExtractionError(pdfReadCancelledMessage))
  }

  if (options.signal?.aborted) {
    onCallerAbort()
  } else {
    options.signal?.addEventListener('abort', onCallerAbort)
  }

  try {
    throwIfStopped(stop.signal)
    const readEmbedded = options.readEmbedded ?? extractPdfText
    options.onProgress?.({ message: 'Reading embedded PDF text…' })
    const embedded = await readEmbedded(file)
    throwIfStopped(stop.signal)
    const pages: ExtractedPdfPage[] = embedded.pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      method: 'embedded',
      confidence: null,
    }))
    const pending = pages.filter((page) => !hasUsableText(page.text))

    if (pending.length === 0) {
      return assemble(embedded.fileName, embedded.pageCount, pages)
    }

    if (pending.length > maxOcrPages) {
      throw new PdfTextExtractionError(
        `This PDF has ${pending.length} scanned pages. At most ${maxOcrPages} can be recognized, and the file was not partially read.`,
      )
    }

    options.onProgress?.({ message: 'Scanned pages detected' })
    const openPdf = options.openPdf ?? openValidatedPdf
    const renderPage = options.renderPage ?? renderPdfPage
    const createRecognizer = options.createRecognizer ?? (() => createOcrSession())
    const opened = await openPdf(file)
    let recognizer: OcrSession | null = null

    try {
      throwIfStopped(stop.signal)
      recognizer = await createRecognizer()

      for (const page of pending) {
        throwIfStopped(stop.signal)
        options.onProgress?.({
          message: `Recognizing text on page ${page.pageNumber} of ${embedded.pageCount}`,
        })
        const canvas = await renderPage(opened.pdf, page.pageNumber)

        try {
          const recognized = await Promise.race([recognizer.recognize(canvas), stopPromise(stop.signal)])
          const index = pages.findIndex((item) => item.pageNumber === page.pageNumber)
          if (index >= 0) {
            pages[index] = {
              pageNumber: page.pageNumber,
              text: recognized.text,
              method: 'ocr',
              confidence: recognized.confidence,
            }
          }
        } catch (error) {
          if (error instanceof PdfTextExtractionError) {
            throw error
          }

          throw new PdfTextExtractionError(
            `Text recognition failed on page ${page.pageNumber}. The document was not saved.`,
          )
        } finally {
          releaseCanvas(canvas)
        }
      }
    } catch (error) {
      if (error instanceof PdfTextExtractionError) {
        throw error
      }

      throw new PdfTextExtractionError('Unable to process this document.')
    } finally {
      await recognizer?.dispose()
      await opened.close()
    }

    throwIfStopped(stop.signal)
    return assemble(embedded.fileName, embedded.pageCount, pages)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onCallerAbort)
  }
}

function assemble(
  fileName: string,
  pageCount: number,
  pages: readonly ExtractedPdfPage[],
): PdfTextExtractionResult {
  return {
    fileName,
    pageCount,
    pages: pages.map((page) => ({ ...page })),
    fullText: pages.map((page) => page.text).join('\n'),
    hasExtractableText: pages.some((page) => hasUsableText(page.text)),
    source: sourceFor(pages),
  }
}

function sourceFor(pages: readonly ExtractedPdfPage[]): PdfExtractionSource {
  const usedOcr = pages.some((page) => page.method === 'ocr')
  const usedEmbedded = pages.some((page) => page.method === 'embedded' && hasUsableText(page.text))
  if (usedOcr && usedEmbedded) {
    return 'mixed'
  }

  if (usedOcr) {
    return 'ocr'
  }

  return 'embedded'
}

function hasUsableText(text: string): boolean {
  return text.trim().length > 0
}

function throwIfStopped(signal: AbortSignal): void {
  if (signal.aborted) {
    throw stopError(signal)
  }
}

function stopPromise(signal: AbortSignal): Promise<never> {
  if (signal.aborted) {
    return Promise.reject(stopError(signal))
  }

  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(stopError(signal)), { once: true })
  })
}

function stopError(signal: AbortSignal): PdfTextExtractionError {
  return signal.reason instanceof PdfTextExtractionError
    ? signal.reason
    : new PdfTextExtractionError(pdfReadCancelledMessage)
}
