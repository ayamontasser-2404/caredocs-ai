import type { DocumentType } from '../../types/document.ts'
import { FieldVerification } from './FieldVerification.tsx'
import { StructuredFields } from './StructuredFields.tsx'
import type { SlotExtraction } from './workspace.ts'

interface ExtractionPanelProps {
  documentType: DocumentType
  extraction: SlotExtraction
  onEditField: (type: DocumentType, path: string, value: string) => void
  onConfirmField: (type: DocumentType, path: string) => void
}

/**
 * Shows text read from one PDF.
 * This panel is not the review findings list. Extracting text does not compare documents.
 */
export function ExtractionPanel({ documentType, extraction, onEditField, onConfirmField }: ExtractionPanelProps) {
  if (extraction.status === 'idle') {
    return null
  }

  const result = extraction.result

  return (
    <section
      className="extraction-panel"
      aria-busy={extraction.status === 'extracting'}
      aria-label={`Extracted text for ${extraction.fileName ?? 'the selected file'}`}
    >
      <p className="extraction-panel__document">Document: {extraction.fileName}</p>
      <p role={extraction.status === 'error' ? 'alert' : 'status'}>Status: {statusLabel(extraction)}</p>
      {result ? (
        <>
          <p>Pages: {result.pageCount}</p>
          <h3>Extracted text</h3>
          <p className="extraction-panel__note">
            This text is unverified. It is not a review finding, and the documents have not been compared.
          </p>
          {result.pages.map((page) => (
            <div className="extraction-panel__page" key={page.pageNumber}>
              <h4>Page {page.pageNumber}</h4>
              {page.method ? <p>{page.method === 'ocr' ? 'OCR' : 'Embedded text'}</p> : null}
              {page.method === 'ocr' && typeof page.confidence === 'number' ? (
                <p>Recognizer confidence: {page.confidence}. This score is not a clinical check.</p>
              ) : null}
              {page.text.trim().length > 0 ? (
                <pre className="extraction-panel__text">{page.text}</pre>
              ) : (
                <p className="extraction-panel__text">This page has no readable text.</p>
              )}
            </div>
          ))}
          {extraction.structured ? <StructuredFields extraction={extraction.structured} /> : null}
          {extraction.verification ? (
            <FieldVerification
              documentType={documentType}
              verification={extraction.verification}
              onEdit={onEditField}
              onConfirm={onConfirmField}
            />
          ) : null}
        </>
      ) : null}
    </section>
  )
}

function statusLabel(extraction: SlotExtraction): string {
  switch (extraction.status) {
    case 'extracting':
      return extraction.message ?? 'Extracting text…'
    case 'success':
      return extraction.message ?? 'Text extracted successfully'
    case 'no-text':
      return 'No readable text found'
    case 'error':
      return extraction.message ?? 'Unable to process this document.'
    case 'idle':
      return ''
  }
}
