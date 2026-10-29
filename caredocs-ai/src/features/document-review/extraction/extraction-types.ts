/** How the text on one page was obtained. */
export type PdfPageExtractionMethod = 'embedded' | 'ocr'

/**
 * How the document's text was obtained.
 * `mixed` means some pages used embedded text and others used OCR.
 */
export type PdfExtractionSource = 'embedded' | 'ocr' | 'mixed'

/**
 * Text taken from one PDF page.
 * `pageNumber` is 1-based, matching the page a reviewer would open.
 * `method` is omitted by the embedded-text reader and set when OCR fallback runs.
 * `confidence` is the recognizer's score for an OCR page. It is not a clinical judgment.
 */
export interface ExtractedPdfPage {
  pageNumber: number
  text: string
  method?: PdfPageExtractionMethod
  confidence?: number | null
}

/**
 * Text read from a PDF.
 * This is not a healthcare document and it is not a review finding.
 * Page text stays intact so later evidence can name the page it came from.
 */
export interface PdfTextExtractionResult {
  fileName: string
  pageCount: number
  pages: ExtractedPdfPage[]
  fullText: string
  hasExtractableText: boolean
  source?: PdfExtractionSource
}
