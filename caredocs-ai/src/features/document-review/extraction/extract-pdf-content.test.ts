import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it, vi } from 'vitest'
import {
  extractPdfContent,
  maxOcrPages,
  pdfReadCancelledMessage,
  pdfReadTimeoutMessage,
} from './extract-pdf-content.ts'
import { PdfTextExtractionError } from './extract-pdf-text.ts'
import type { OcrSession } from './run-ocr.ts'

describe('extractPdfContent', () => {
  it('uses embedded text and does not run OCR when every page has text', async () => {
    const createRecognizer = vi.fn(async (): Promise<OcrSession> => {
      throw new Error('OCR should not run')
    })
    const openPdf = vi.fn()
    const progress: string[] = []

    const result = await extractPdfContent(pdfFile('letter.pdf', makePdf([textStream('Pantoprazol 40 mg')])), {
      onProgress: (update) => progress.push(update.message),
      createRecognizer,
      openPdf,
    })

    expect(createRecognizer).not.toHaveBeenCalled()
    expect(openPdf).not.toHaveBeenCalled()
    expect(progress).toEqual(['Reading embedded PDF text…'])
    expect(result.source).toBe('embedded')
    expect(result.hasExtractableText).toBe(true)
    expect(result.pages).toEqual([
      { pageNumber: 1, text: 'Pantoprazol 40 mg', method: 'embedded', confidence: null },
    ])
    expect(result.fullText).toBe('Pantoprazol 40 mg')
  })

  it('recognizes a scanned page and keeps its page number', async () => {
    let renderedPage = 0
    const renderPage = vi.fn(async (_pdf: PDFDocumentProxy, pageNumber: number) => {
      renderedPage = pageNumber
      return document.createElement('canvas')
    })
    const recognize = vi.fn(async () => ({ text: 'Scanned line', confidence: 76 }))
    const dispose = vi.fn(async () => undefined)
    const close = vi.fn(async () => undefined)

    const result = await extractPdfContent(pdfFile('scan.pdf', makePdf([''])), {
      renderPage,
      openPdf: async () => ({ pdf: {} as PDFDocumentProxy, close }),
      createRecognizer: async () => ({ recognize, dispose }),
    })

    expect(renderPage).toHaveBeenCalledTimes(1)
    expect(renderedPage).toBe(1)
    expect(result.source).toBe('ocr')
    expect(result.hasExtractableText).toBe(true)
    expect(result.pages).toEqual([
      { pageNumber: 1, text: 'Scanned line', method: 'ocr', confidence: 76 },
    ])
    expect(result.fullText).toBe('Scanned line')
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('keeps scanned pages in order', async () => {
    const seen: number[] = []
    const recognize = vi.fn(async () => ({ text: `Line ${seen.length}`, confidence: 70 }))

    const result = await extractPdfContent(pdfFile('scan.pdf', makePdf(['', ''])), {
      renderPage: async (_pdf, pageNumber) => {
        seen.push(pageNumber)
        return document.createElement('canvas')
      },
      openPdf: async () => ({ pdf: {} as PDFDocumentProxy, close: async () => undefined }),
      createRecognizer: async () => ({ recognize, dispose: async () => undefined }),
    })

    expect(seen).toEqual([1, 2])
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2])
    expect(result.pages.map((page) => page.text)).toEqual(['Line 1', 'Line 2'])
    expect(result.fullText).toBe('Line 1\nLine 2')
    expect(result.source).toBe('ocr')
  })

  it('runs OCR only on pages without embedded text', async () => {
    const rendered: number[] = []
    const progress: string[] = []

    const result = await extractPdfContent(
      pdfFile('mixed.pdf', makePdf([textStream('Aufnahmegrund'), ''])),
      {
        onProgress: (update) => progress.push(update.message),
        renderPage: async (_pdf, pageNumber) => {
          rendered.push(pageNumber)
          return document.createElement('canvas')
        },
        openPdf: async () => ({ pdf: {} as PDFDocumentProxy, close: async () => undefined }),
        createRecognizer: async () => ({
          recognize: async () => ({ text: 'Scanned medication', confidence: 64 }),
          dispose: async () => undefined,
        }),
      },
    )

    expect(rendered).toEqual([2])
    expect(progress).toContain('Scanned pages detected')
    expect(progress).toContain('Recognizing text on page 2 of 2')
    expect(result.source).toBe('mixed')
    expect(result.pages).toEqual([
      { pageNumber: 1, text: 'Aufnahmegrund', method: 'embedded', confidence: null },
      { pageNumber: 2, text: 'Scanned medication', method: 'ocr', confidence: 64 },
    ])
    expect(result.fullText).toBe('Aufnahmegrund\nScanned medication')
  })

  it('reports no readable text when OCR returns none', async () => {
    const result = await extractPdfContent(pdfFile('blank.pdf', makePdf([''])), {
      renderPage: async () => document.createElement('canvas'),
      openPdf: async () => ({ pdf: {} as PDFDocumentProxy, close: async () => undefined }),
      createRecognizer: async () => ({
        recognize: async () => ({ text: '   ', confidence: 3 }),
        dispose: async () => undefined,
      }),
    })

    expect(result.hasExtractableText).toBe(false)
    expect(result.source).toBe('ocr')
    expect(result.pages).toEqual([{ pageNumber: 1, text: '   ', method: 'ocr', confidence: 3 }])
  })

  it('returns a controlled error when page rendering fails and still closes the PDF', async () => {
    const close = vi.fn(async () => undefined)
    const dispose = vi.fn(async () => undefined)

    await expect(
      extractPdfContent(pdfFile('scan.pdf', makePdf([''])), {
        renderPage: async () => {
          throw new Error('canvas failed')
        },
        openPdf: async () => ({ pdf: {} as PDFDocumentProxy, close }),
        createRecognizer: async () => ({
          recognize: async () => ({ text: 'unused', confidence: 1 }),
          dispose,
        }),
      }),
    ).rejects.toThrow('Unable to process this document.')

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('returns a controlled error when the OCR worker cannot start', async () => {
    const close = vi.fn(async () => undefined)

    await expect(
      extractPdfContent(pdfFile('scan.pdf', makePdf([''])), {
        openPdf: async () => ({ pdf: {} as PDFDocumentProxy, close }),
        createRecognizer: async () => {
          throw new PdfTextExtractionError('Unable to process this document.')
        },
      }),
    ).rejects.toThrow(PdfTextExtractionError)

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('names the failed page and does not keep a partial document or the recognizer error', async () => {
    const close = vi.fn(async () => undefined)
    const dispose = vi.fn(async () => undefined)

    await expect(
      extractPdfContent(pdfFile('scan.pdf', makePdf(['', ''])), {
        renderPage: async () => document.createElement('canvas'),
        openPdf: async () => ({ pdf: {} as PDFDocumentProxy, close }),
        createRecognizer: async () => ({
          recognize: async () => {
            throw new Error('Erika Beispiel')
          },
          dispose,
        }),
      }),
    ).rejects.toThrow('Text recognition failed on page 1. The document was not saved.')

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('refuses to recognize more scanned pages than the limit', async () => {
    const createRecognizer = vi.fn()

    await expect(
      extractPdfContent(pdfFile('many-scans.pdf', makePdf(Array.from({ length: maxOcrPages + 1 }, () => ''))), {
        createRecognizer,
      }),
    ).rejects.toThrow(
      `This PDF has ${maxOcrPages + 1} scanned pages. At most ${maxOcrPages} can be recognized, and the file was not partially read.`,
    )

    expect(createRecognizer).not.toHaveBeenCalled()
  })

  it('stops a hung recognition without saving a partial result', async () => {
    const close = vi.fn(async () => undefined)
    const dispose = vi.fn(async () => undefined)

    await expect(
      extractPdfContent(pdfFile('scan.pdf', makePdf([''])), {
        processingTimeoutMs: 20,
        renderPage: async () => document.createElement('canvas'),
        openPdf: async () => ({ pdf: {} as PDFDocumentProxy, close }),
        createRecognizer: async () => ({
          recognize: () => new Promise(() => undefined),
          dispose,
        }),
      }),
    ).rejects.toThrow(pdfReadTimeoutMessage)

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('cancels an in-progress read when the caller aborts', async () => {
    const close = vi.fn(async () => undefined)
    const dispose = vi.fn(async () => undefined)
    const controller = new AbortController()
    controller.abort()

    await expect(
      extractPdfContent(pdfFile('scan.pdf', makePdf([''])), {
        signal: controller.signal,
        processingTimeoutMs: 60_000,
        openPdf: async () => ({ pdf: {} as PDFDocumentProxy, close }),
        createRecognizer: async () => ({
          recognize: async () => ({ text: 'unused', confidence: 1 }),
          dispose,
        }),
      }),
    ).rejects.toThrow(pdfReadCancelledMessage)

    expect(dispose).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })

  it('releases the PDF and recognizer when a running recognition is cancelled', async () => {
    const close = vi.fn(async () => undefined)
    const dispose = vi.fn(async () => undefined)
    const controller = new AbortController()

    await expect(
      extractPdfContent(pdfFile('scan.pdf', makePdf([''])), {
        signal: controller.signal,
        processingTimeoutMs: 60_000,
        renderPage: async () => document.createElement('canvas'),
        openPdf: async () => ({ pdf: {} as PDFDocumentProxy, close }),
        createRecognizer: async () => ({
          recognize: () => {
            controller.abort()
            return new Promise(() => undefined)
          },
          dispose,
        }),
      }),
    ).rejects.toThrow(pdfReadCancelledMessage)

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })
})

function pdfFile(name: string, bytes: Uint8Array): File {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return new File([copy], name, { type: 'application/pdf' })
}

function makePdf(pageStreams: readonly string[]): Uint8Array {
  const parts: Uint8Array[] = []
  let length = 0
  const offsets: number[] = []

  function push(text: string) {
    const bytes = new TextEncoder().encode(text)
    parts.push(bytes)
    length += bytes.byteLength
  }

  function addObject(body: string): void {
    offsets.push(length)
    push(`${offsets.length} 0 obj\n${body}\nendobj\n`)
  }

  push('%PDF-1.4\n')
  const kids = pageStreams.map((_, index) => `${4 + index * 2} 0 R`).join(' ')
  addObject('<< /Type /Catalog /Pages 2 0 R >>')
  addObject(`<< /Type /Pages /Count ${pageStreams.length} /Kids [${kids}] >>`)
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  for (const stream of pageStreams) {
    const contentId = offsets.length + 2
    addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    )
    addObject(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
  }

  const startxref = length
  const size = offsets.length + 1
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  push(xref)
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`)

  const bytes = new Uint8Array(length)
  let cursor = 0
  for (const part of parts) {
    bytes.set(part, cursor)
    cursor += part.byteLength
  }
  return bytes
}

function textStream(text: string): string {
  const literal = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  return `BT /F1 12 Tf 72 720 Td (${literal}) Tj ET\n`
}
