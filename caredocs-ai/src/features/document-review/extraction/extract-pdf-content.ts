import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  extractPdfText,
  openValidatedPdf,
  pdfReadCancelledMessage,
  pdfReadTimeoutMessage,
  PdfTextExtractionError,
  racePdfAbort,
  throwIfPdfAborted,
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

export { pdfReadCancelledMessage, pdfReadTimeoutMessage }

export interface ExtractPdfContentOptions {
  onProgress?: (progress: ExtractionProgress) => void
  readEmbedded?: typeof extractPdfText
  openPdf?: (file: File, signal?: AbortSignal) => Promise<OpenPdf>
  renderPage?: (pdf: PDFDocumentProxy, pageNumber: number, signal?: AbortSignal) => Promise<HTMLCanvasElement>
  createRecognizer?: () => Promise<OcrSession>
  signal?: AbortSignal
  processingTimeoutMs?: number
}

/**
 * Read embedded text, then recognize only pages that have none.
 * A text page is not sent to OCR. OCR output is not a review finding.
 *
 * File reading, PDF.js page loading, and `getTextContent` cannot be aborted in
 * place. This function stops waiting, destroys a PDF it opened, and terminates
 * an OCR worker it started. Tesseract has no separate cancel; `dispose` ends
 * recognition by terminating the worker. A result that arrives after
 * cancellation is discarded.
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
    throwIfPdfAborted(stop.signal)
    const readEmbedded = options.readEmbedded ?? extractPdfText
    options.onProgress?.({ message: 'Reading embedded PDF text…' })
    const embedded = await racePdfAbort(readEmbedded(file, stop.signal), stop.signal)
    throwIfPdfAborted(stop.signal)
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
    const opening = openPdf(file, stop.signal)
    let opened: OpenPdf
    try {
      opened = await racePdfAbort(opening, stop.signal)
    } catch (error) {
      closeIfLate(opening)
      throw error
    }

    let recognizer: OcrSession | null = null

    try {
      throwIfPdfAborted(stop.signal)
      const starting = Promise.resolve().then(() => createRecognizer())
      try {
        recognizer = await racePdfAbort(starting, stop.signal)
      } catch (error) {
        disposeIfLate(starting)
        throw error
      }

      for (const page of pending) {
        throwIfPdfAborted(stop.signal)
        options.onProgress?.({
          message: `Recognizing text on page ${page.pageNumber} of ${embedded.pageCount}`,
        })
        const canvas = await renderPage(opened.pdf, page.pageNumber, stop.signal)

        try {
          const recognition = recognizer.recognize(canvas)
          let recognized: Awaited<ReturnType<OcrSession['recognize']>>
          try {
            recognized = await racePdfAbort(recognition, stop.signal)
          } catch (error) {
            void recognition.then(
              () => undefined,
              () => undefined,
            )
            throw error
          }
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

    throwIfPdfAborted(stop.signal)
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

function closeIfLate(opening: Promise<OpenPdf>): void {
  void opening.then(
    (opened) => {
      void opened.close()
    },
    () => undefined,
  )
}

function disposeIfLate(starting: Promise<OcrSession>): void {
  void starting.then(
    (session) => {
      void session.dispose()
    },
    () => undefined,
  )
}
