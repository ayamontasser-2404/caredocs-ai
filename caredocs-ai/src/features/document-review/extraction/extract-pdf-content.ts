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

export interface ExtractPdfContentOptions {
  onProgress?: (progress: ExtractionProgress) => void
  readEmbedded?: typeof extractPdfText
  openPdf?: (file: File) => Promise<OpenPdf>
  renderPage?: (pdf: PDFDocumentProxy, pageNumber: number) => Promise<HTMLCanvasElement>
  createRecognizer?: () => Promise<OcrSession>
}

/**
 * Read embedded text, then recognize only pages that have none.
 * A text page is not sent to OCR. OCR output is not a review finding.
 */
export async function extractPdfContent(
  file: File,
  options: ExtractPdfContentOptions = {},
): Promise<PdfTextExtractionResult> {
  const readEmbedded = options.readEmbedded ?? extractPdfText
  options.onProgress?.({ message: 'Reading embedded PDF text…' })
  const embedded = await readEmbedded(file)
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

  options.onProgress?.({ message: 'Scanned pages detected' })
  const openPdf = options.openPdf ?? openValidatedPdf
  const renderPage = options.renderPage ?? renderPdfPage
  const createRecognizer = options.createRecognizer ?? (() => createOcrSession())
  const opened = await openPdf(file)
  let recognizer: OcrSession | null = null

  try {
    recognizer = await createRecognizer()

    for (const page of pending) {
      options.onProgress?.({
        message: `Recognizing text on page ${page.pageNumber} of ${embedded.pageCount}`,
      })
      const canvas = await renderPage(opened.pdf, page.pageNumber)

      try {
        const recognized = await recognizer.recognize(canvas)
        const index = pages.findIndex((item) => item.pageNumber === page.pageNumber)
        if (index >= 0) {
          pages[index] = {
            pageNumber: page.pageNumber,
            text: recognized.text,
            method: 'ocr',
            confidence: recognized.confidence,
          }
        }
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

  return assemble(embedded.fileName, embedded.pageCount, pages)
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
