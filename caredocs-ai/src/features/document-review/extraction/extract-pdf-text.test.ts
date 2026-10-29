import { describe, expect, it } from 'vitest'
import {
  PdfTextExtractionError,
  extractPdfText,
  maxPdfFileBytes,
  maxPdfPages,
} from './extract-pdf-text.ts'

/**
 * These tests call PDF.js with real PDF bytes. Vitest runs them in happy-dom,
 * and the legacy build reads the file without a separate browser worker.
 */
describe('extractPdfText', () => {
  it('extracts known text from a valid PDF', async () => {
    const file = pdfFile('medication.pdf', makePdf([textStream('Pantoprazol 40 mg')]))

    const result = await extractPdfText(file)

    expect(result.fileName).toBe('medication.pdf')
    expect(result.pageCount).toBe(1)
    expect(result.hasExtractableText).toBe(true)
    expect(result.pages).toEqual([{ pageNumber: 1, text: 'Pantoprazol 40 mg' }])
    expect(result.fullText).toBe('Pantoprazol 40 mg')
  })

  it('records the page number and text of each page', async () => {
    const file = pdfFile(
      'two-pages.pdf',
      makePdf([textStream('Aufnahmegrund'), textStream('Ramipril 5 mg')]),
    )

    const result = await extractPdfText(file)

    expect(result.pageCount).toBe(2)
    expect(result.pages).toEqual([
      { pageNumber: 1, text: 'Aufnahmegrund' },
      { pageNumber: 2, text: 'Ramipril 5 mg' },
    ])
    expect(result.fullText).toBe('Aufnahmegrund\nRamipril 5 mg')
  })

  it('retains an empty page between pages that have text', async () => {
    const file = pdfFile(
      'with-blank-page.pdf',
      makePdf([textStream('Before the blank page'), '', textStream('After the blank page')]),
    )

    const result = await extractPdfText(file)

    expect(result.pageCount).toBe(3)
    expect(result.pages).toEqual([
      { pageNumber: 1, text: 'Before the blank page' },
      { pageNumber: 2, text: '' },
      { pageNumber: 3, text: 'After the blank page' },
    ])
    expect(result.fullText).toBe('Before the blank page\n\nAfter the blank page')
    expect(result.hasExtractableText).toBe(true)
  })

  it('reports a controlled error for a corrupted PDF', async () => {
    const file = new File([new TextEncoder().encode('this is not a pdf')], 'notes.pdf', {
      type: 'application/pdf',
    })

    await expect(extractPdfText(file)).rejects.toBeInstanceOf(PdfTextExtractionError)
    await expect(extractPdfText(file)).rejects.toThrow('The file is not a valid PDF.')
  })

  it('rejects a file that is not a PDF', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })

    await expect(extractPdfText(file)).rejects.toBeInstanceOf(PdfTextExtractionError)
    await expect(extractPdfText(file)).rejects.toThrow('The file is not a PDF.')
  })

  it('reports that a PDF has no embedded text', async () => {
    const result = await extractPdfText(pdfFile('blank.pdf', makePdf([''])))

    expect(result.pageCount).toBe(1)
    expect(result.pages).toEqual([{ pageNumber: 1, text: '' }])
    expect(result.fullText).toBe('')
    expect(result.hasExtractableText).toBe(false)
  })

  it('reports a PDF that opens with zero pages', async () => {
    const result = await extractPdfText(pdfFile('empty-pages.pdf', makePdf([])))

    expect(result.pageCount).toBe(0)
    expect(result.pages).toEqual([])
    expect(result.fullText).toBe('')
    expect(result.hasExtractableText).toBe(false)
  })

  it('treats whitespace-only text as not extractable', async () => {
    const result = await extractPdfText(pdfFile('spaces.pdf', makePdf([textStream('   ')])))

    expect(result.pageCount).toBe(1)
    expect(result.pages).toEqual([{ pageNumber: 1, text: '' }])
    expect(result.fullText).toBe('')
    expect(result.hasExtractableText).toBe(false)
  })

  it('rejects an empty file before parsing it', async () => {
    const file = new File([], 'empty.pdf', { type: 'application/pdf' })

    await expect(extractPdfText(file)).rejects.toThrow('The PDF file is empty.')
  })

  it('rejects a PDF that is too large to read', async () => {
    const file = new File([new Uint8Array(maxPdfFileBytes + 1)], 'large.pdf', {
      type: 'application/pdf',
    })

    await expect(extractPdfText(file)).rejects.toThrow('The PDF is too large to read.')
  })

  it('rejects a PDF with more pages than the review can read', async () => {
    const pages = Array.from({ length: maxPdfPages + 1 }, () => '')
    const file = pdfFile('long.pdf', makePdf(pages))

    await expect(extractPdfText(file)).rejects.toThrow('The PDF has too many pages to read.')
  })

  it('rejects a missing file name', async () => {
    const file = pdfFile('   ', makePdf([textStream('Discharge line')]))

    await expect(extractPdfText(file)).rejects.toThrow('The PDF is missing a file name.')
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
