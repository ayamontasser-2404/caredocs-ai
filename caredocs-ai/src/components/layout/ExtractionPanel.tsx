import type { SlotExtraction } from './workspace.ts'

interface ExtractionPanelProps {
  extraction: SlotExtraction
}

/**
 * Shows text read from one PDF.
 * This panel is not the review findings list. Extracting text does not compare documents.
 */
export function ExtractionPanel({ extraction }: ExtractionPanelProps) {
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
            This is text read from the file. It is not a review finding, and the documents have not been compared.
          </p>
          {result.pages.map((page) => (
            <div className="extraction-panel__page" key={page.pageNumber}>
              <h4>Page {page.pageNumber}</h4>
              {page.text.trim().length > 0 ? (
                <pre className="extraction-panel__text">{page.text}</pre>
              ) : (
                <p className="extraction-panel__text">This page has no embedded text.</p>
              )}
            </div>
          ))}
        </>
      ) : null}
    </section>
  )
}

function statusLabel(extraction: SlotExtraction): string {
  switch (extraction.status) {
    case 'extracting':
      return 'Extracting text…'
    case 'success':
      return 'Text extracted successfully'
    case 'no-text':
      return 'No extractable text was found'
    case 'error':
      return extraction.message ?? 'The PDF text could not be extracted.'
    case 'idle':
      return ''
  }
}
