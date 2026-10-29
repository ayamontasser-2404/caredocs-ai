/**
 * Text taken from one PDF page.
 * `pageNumber` is 1-based, matching the page a reviewer would open.
 */
export interface ExtractedPdfPage {
  pageNumber: number
  text: string
}

/**
 * Embedded text read from a PDF.
 * This is not a healthcare document and it is not a review finding.
 * Page text stays intact so later evidence can name the page it came from.
 */
export interface PdfTextExtractionResult {
  fileName: string
  pageCount: number
  pages: ExtractedPdfPage[]
  fullText: string
  hasExtractableText: boolean
}
