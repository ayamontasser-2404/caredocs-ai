import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it, vi } from 'vitest'
import { PdfTextExtractionError, pdfReadCancelledMessage } from './extract-pdf-text.ts'
import { renderPdfPage } from './render-pdf-page.ts'

describe('renderPdfPage', () => {
  it('turns a page render failure into a controlled error', async () => {
    const pdf = {
      getPage: async () => {
        throw new Error('missing page')
      },
    } as unknown as PDFDocumentProxy

    await expect(renderPdfPage(pdf, 2)).rejects.toBeInstanceOf(PdfTextExtractionError)
    await expect(renderPdfPage(pdf, 2)).rejects.toThrow('Unable to process this document.')
  })

  it('releases the page and canvas when rendering fails after the page is open', async () => {
    const cleanup = vi.fn()
    const canvases: HTMLCanvasElement[] = []
    const create = document.createElement.bind(document)
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation(((
      tag: string,
      options?: ElementCreationOptions,
    ) => {
      const element = create(tag, options)
      if (tag === 'canvas') {
        canvases.push(element as HTMLCanvasElement)
      }
      return element
    }) as typeof document.createElement)

    try {
      const pdf = {
        getPage: async () => ({
          getViewport: () => ({ width: 10, height: 20 }),
          render: () => ({
            cancel: () => undefined,
            promise: Promise.reject(new Error('draw failed')),
          }),
          cleanup,
        }),
      } as unknown as PDFDocumentProxy

      await expect(renderPdfPage(pdf, 1)).rejects.toThrow('Unable to process this document.')
      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(canvases[0]?.width).toBe(0)
      expect(canvases[0]?.height).toBe(0)
    } finally {
      createSpy.mockRestore()
    }
  })

  it('asks a running page render to cancel and still releases the page', async () => {
    const cleanup = vi.fn()
    const cancel = vi.fn()
    const controller = new AbortController()
    const pdf = {
      getPage: async () => ({
        getViewport: () => ({ width: 10, height: 20 }),
        render: () => {
          controller.abort(new PdfTextExtractionError(pdfReadCancelledMessage))
          return {
            cancel,
            promise: new Promise(() => undefined),
          }
        },
        cleanup,
      }),
    } as unknown as PDFDocumentProxy

    await expect(renderPdfPage(pdf, 1, controller.signal)).rejects.toThrow(pdfReadCancelledMessage)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
