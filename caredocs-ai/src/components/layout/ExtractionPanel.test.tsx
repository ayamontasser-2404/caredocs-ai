import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SlotExtraction } from './workspace.ts'
import { ExtractionPanel } from './ExtractionPanel.tsx'

describe('ExtractionPanel', () => {
  it('renders extracted text as text rather than HTML', () => {
    const markup = '<img src="x" onerror="alert(1)"><script>alert(1)</script>'
    const { container } = render(
      <ExtractionPanel
        documentType="discharge-letter"
        extraction={extraction(markup)}
        onEditField={() => undefined}
        onConfirmField={() => undefined}
      />,
    )

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText(markup)).toBeTruthy()
  })
})

function extraction(text: string): SlotExtraction {
  return {
    status: 'success',
    fileName: 'letter.pdf',
    message: null,
    structured: null,
    verification: null,
    result: {
      fileName: 'letter.pdf',
      pageCount: 1,
      fullText: text,
      hasExtractableText: true,
      source: 'embedded',
      pages: [{ pageNumber: 1, text, method: 'embedded', confidence: null }],
    },
  }
}
