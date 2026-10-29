import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { PdfTextExtractionError } from './extract-pdf-text.ts'
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
})
