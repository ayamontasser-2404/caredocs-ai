import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { abortReason, PdfTextExtractionError, racePdfAbort, releasePdfPage, throwIfPdfAborted } from './extract-pdf-text.ts'

/** About 144 DPI. Higher scales use more memory without a matching gain for this phase. */
export const ocrPageScale = 2

/**
 * Draw one PDF page onto a canvas for OCR.
 * The caller must release the canvas after recognition. Rendering does not read text.
 *
 * `getPage` cannot be interrupted. `render().cancel()` asks PDF.js to stop at its
 * next pause; it does not abort the page immediately. The page and a failed canvas
 * are released in `finally` / `catch` even when drawing throws.
 */
export async function renderPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  let page: PDFPageProxy | undefined
  let renderTask: RenderTask | undefined
  const cancelRender = () => {
    renderTask?.cancel()
  }
  signal?.addEventListener('abort', cancelRender)

  try {
    throwIfPdfAborted(signal)
    page = await pdf.getPage(pageNumber)
    throwIfPdfAborted(signal)
    const viewport = page.getViewport({ scale: ocrPageScale })
    const width = Math.ceil(viewport.width)
    const height = Math.ceil(viewport.height)
    if (width < 1 || height < 1) {
      throw new PdfTextExtractionError('Unable to process this document.')
    }

    canvas.width = width
    canvas.height = height
    renderTask = page.render({ canvas, viewport })
    if (signal?.aborted) {
      renderTask.cancel()
      throw abortReason(signal)
    }

    const rendered = renderTask.promise
    try {
      await racePdfAbort(rendered, signal)
    } catch (error) {
      void rendered.then(
        () => undefined,
        () => undefined,
      )
      throw error
    }

    return canvas
  } catch (error) {
    releaseCanvas(canvas)
    if (signal?.aborted) {
      throw abortReason(signal)
    }

    if (error instanceof PdfTextExtractionError) {
      throw error
    }

    throw new PdfTextExtractionError('Unable to process this document.')
  } finally {
    signal?.removeEventListener('abort', cancelRender)
    if (page) {
      releasePdfPage(page)
    }
  }
}

/** Drop the bitmap so a scanned page is not kept after OCR. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}
