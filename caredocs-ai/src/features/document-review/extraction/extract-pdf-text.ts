import {
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
  VerbosityLevel,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
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

export const pdfReadCancelledMessage = 'Reading this PDF was cancelled. The document was not saved.'
export const pdfReadTimeoutMessage = 'Reading this PDF took too long. The document was not saved.'

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
 *
 * `Blob.arrayBuffer` and `getDocument` take no `AbortSignal`. Cancellation stops
 * waiting and calls `destroy()` on the loading task. Bytes already being read,
 * and a worker that `destroy()` has not finished, can still run to completion.
 * Their result is not returned.
 *
 * `loadDocument` is PDF.js `getDocument` in the app. Tests replace it because
 * that export cannot be spied on.
 */
export async function openValidatedPdf(
  file: File,
  signal?: AbortSignal,
  loadDocument: (src: Parameters<typeof getDocument>[0]) => PDFDocumentLoadingTask = getDocument,
): Promise<OpenPdf> {
  throwIfPdfAborted(signal)

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

  const data = new Uint8Array(await racePdfAbort(file.arrayBuffer(), signal))
  throwIfPdfAborted(signal)
  if (!hasPdfSignature(data)) {
    throw new PdfTextExtractionError('The file is not a valid PDF.')
  }

  const task = loadDocument({
    data,
    verbosity: VerbosityLevel.ERRORS,
  })
  task.onPassword = () => {
    throw new PdfTextExtractionError('The PDF is password-protected and cannot be read.')
  }
  const abortLoading = () => {
    void task.destroy().catch(() => undefined)
  }
  signal?.addEventListener('abort', abortLoading)
  void task.promise.catch(() => undefined)

  try {
    const pdf = await racePdfAbort(task.promise, signal)
    throwIfPdfAborted(signal)
    if (pdf.numPages > maxPdfPages) {
      throw new PdfTextExtractionError('The PDF has too many pages to read.')
    }

    return {
      pdf,
      close: async () => {
        signal?.removeEventListener('abort', abortLoading)
        await task.destroy().catch(() => undefined)
      },
    }
  } catch (error) {
    signal?.removeEventListener('abort', abortLoading)
    await task.destroy().catch(() => undefined)
    if (signal?.aborted) {
      throw abortReason(signal)
    }

    throw toExtractionError(error)
  }
}

/**
 * Read embedded text from a PDF file, one page at a time.
 * A page with no text is kept, with an empty string, so the page count stays honest.
 * A file that cannot be opened throws. It is not returned as an empty document.
 *
 * `getPage` and `getTextContent` cannot be interrupted. Cancellation is checked
 * before and after each call, and a finished page is discarded when the signal
 * has already aborted. The open document is still closed.
 */
export async function extractPdfText(file: File, signal?: AbortSignal): Promise<PdfTextExtractionResult> {
  const opened = await openValidatedPdf(file, signal)

  try {
    const pages: ExtractedPdfPage[] = []

    for (let pageNumber = 1; pageNumber <= opened.pdf.numPages; pageNumber += 1) {
      throwIfPdfAborted(signal)
      const page = await opened.pdf.getPage(pageNumber)

      try {
        throwIfPdfAborted(signal)
        const content = await page.getTextContent()
        throwIfPdfAborted(signal)
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

    throwIfPdfAborted(signal)

    return {
      fileName: file.name,
      pageCount: opened.pdf.numPages,
      pages,
      fullText,
      hasExtractableText: pages.some((page) => page.text.trim().length > 0),
      source: 'embedded',
    }
  } catch (error) {
    if (signal?.aborted) {
      throw abortReason(signal)
    }

    throw toExtractionError(error)
  } finally {
    await opened.close()
  }
}

/** Prefer the abort reason so a timeout stays distinct from a user cancellation. */
export function abortReason(signal: AbortSignal): PdfTextExtractionError {
  return signal.reason instanceof PdfTextExtractionError
    ? signal.reason
    : new PdfTextExtractionError(pdfReadCancelledMessage)
}

export function throwIfPdfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortReason(signal)
  }
}

/**
 * Stop waiting when `signal` aborts, and remove the listener when the race settles.
 * This does not cancel `work`. A later result must be ignored or released by the caller.
 */
export function racePdfAbort<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return work
  }

  return new Promise((resolve, reject) => {
    const finish = (settle: () => void) => {
      signal.removeEventListener('abort', onAbort)
      settle()
    }
    const onAbort = () => {
      finish(() => reject(abortReason(signal)))
    }

    if (signal.aborted) {
      finish(() => reject(abortReason(signal)))
      void work.then(
        () => undefined,
        () => undefined,
      )
      return
    }

    signal.addEventListener('abort', onAbort)
    work.then(
      (value) => {
        finish(() => {
          if (signal.aborted) {
            reject(abortReason(signal))
            return
          }

          resolve(value)
        })
      },
      (error: unknown) => {
        finish(() => reject(error))
      },
    )
  })
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
