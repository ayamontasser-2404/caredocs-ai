import {
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
  VerbosityLevel,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { ExtractedPdfPage, PdfTextExtractionResult } from './extraction-types.ts'

/**
 * PDF.js tells Node, including Vitest, to use this legacy build.
 * The browser still needs `workerSrc`. The PDF.js examples set it to
 * `pdf.worker.mjs`; Vite resolves that file from this module URL.
 * Node already loads the worker beside `pdf.mjs`, and replacing that path
 * makes the worker fail to start.
 */
if (!isNodeProcess()) {
  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
}

/** Reject uploads above this size before their bytes are parsed. */
export const maxPdfFileBytes = 20 * 1024 * 1024

/** Reject documents above this page count instead of returning a partial read. */
export const maxPdfPages = 50

export class PdfTextExtractionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfTextExtractionError'
  }
}

export interface OpenPdf {
  pdf: PDFDocumentProxy
  close: () => Promise<void>
}

/**
 * Open a validated PDF. The caller must `close` it.
 * Page images are not retained here.
 */
export async function openValidatedPdf(file: File): Promise<OpenPdf> {
  if (!isPdfFile(file)) {
    throw new PdfTextExtractionError('The file is not a PDF.')
  }

  if (file.name.trim().length === 0) {
    throw new PdfTextExtractionError('The PDF is missing a file name.')
  }

  if (file.size === 0) {
    throw new PdfTextExtractionError('The PDF file is empty.')
  }

  if (file.size > maxPdfFileBytes) {
    throw new PdfTextExtractionError('The PDF is too large to read.')
  }

  const data = new Uint8Array(await file.arrayBuffer())
  if (!hasPdfSignature(data)) {
    throw new PdfTextExtractionError('The file is not a valid PDF.')
  }

  const task = getDocument({
    data,
    verbosity: VerbosityLevel.ERRORS,
  })
  task.onPassword = () => {
    throw new PdfTextExtractionError('The PDF is password-protected and cannot be read.')
  }

  try {
    const pdf = await task.promise
    if (pdf.numPages > maxPdfPages) {
      throw new PdfTextExtractionError('The PDF has too many pages to read.')
    }

    return {
      pdf,
      close: async () => {
        await task.destroy().catch(() => undefined)
      },
    }
  } catch (error) {
    await task.destroy().catch(() => undefined)
    throw toExtractionError(error)
  }
}

/**
 * Read embedded text from a PDF file, one page at a time.
 * A page with no text is kept, with an empty string, so the page count stays honest.
 * A file that cannot be opened throws. It is not returned as an empty document.
 */
export async function extractPdfText(file: File): Promise<PdfTextExtractionResult> {
  const opened = await openValidatedPdf(file)

  try {
    const pages: ExtractedPdfPage[] = []

    for (let pageNumber = 1; pageNumber <= opened.pdf.numPages; pageNumber += 1) {
      const page = await opened.pdf.getPage(pageNumber)

      try {
        const content = await page.getTextContent()
        let text = ''

        for (const item of content.items) {
          if (!('str' in item) || typeof item.str !== 'string') {
            continue
          }

          text += item.str
          if (item.hasEOL) {
            text += '\n'
          }
        }

        pages.push({ pageNumber, text })
      } finally {
        releasePdfPage(page)
      }
    }

    const fullText = pages.map((page) => page.text).join('\n')

    return {
      fileName: file.name,
      pageCount: opened.pdf.numPages,
      pages,
      fullText,
      hasExtractableText: pages.some((page) => page.text.trim().length > 0),
      source: 'embedded',
    }
  } catch (error) {
    throw toExtractionError(error)
  } finally {
    await opened.close()
  }
}

function hasPdfSignature(data: Uint8Array): boolean {
  const length = Math.min(data.byteLength, 1024)
  let prefix = ''

  for (let index = 0; index < length; index += 1) {
    prefix += String.fromCharCode(data[index] ?? 0)
  }

  return prefix.includes('%PDF-')
}

export function releasePdfPage(page: { cleanup?: (resetStats?: boolean) => boolean }): void {
  try {
    page.cleanup?.()
  } catch {
    // Releasing a page cache must not hide the extraction result or its error.
  }
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function isNodeProcess(): boolean {
  const runtime = globalThis as { process?: { versions?: { node?: string } } }
  return typeof runtime.process?.versions?.node === 'string'
}

function toExtractionError(error: unknown): PdfTextExtractionError {
  if (error instanceof PdfTextExtractionError) {
    return error
  }

  if (error instanceof InvalidPDFException) {
    return new PdfTextExtractionError('The file is not a valid PDF.')
  }

  if (error instanceof PasswordException) {
    return new PdfTextExtractionError('The PDF is password-protected and cannot be read.')
  }

  return new PdfTextExtractionError('The PDF text could not be extracted.')
}
