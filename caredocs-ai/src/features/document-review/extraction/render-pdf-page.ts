import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PdfTextExtractionError } from './extract-pdf-text.ts'

/** About 144 DPI. Higher scales use more memory without a matching gain for this phase. */
export const ocrPageScale = 2

/**
 * Draw one PDF page onto a canvas for OCR.
 * The caller must release the canvas after recognition. Rendering does not read text.
 */
export async function renderPdfPage(pdf: PDFDocumentProxy, pageNumber: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')

  try {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: ocrPageScale })
    const width = Math.ceil(viewport.width)
    const height = Math.ceil(viewport.height)
    if (width < 1 || height < 1) {
      throw new PdfTextExtractionError('Unable to process this document.')
    }

    canvas.width = width
    canvas.height = height
    await page.render({ canvas, viewport }).promise
    return canvas
  } catch (error) {
    releaseCanvas(canvas)
    if (error instanceof PdfTextExtractionError) {
      throw error
    }

    throw new PdfTextExtractionError('Unable to process this document.')
  }
}

/** Drop the bitmap so a scanned page is not kept after OCR. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}
