import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentVerification } from '../../features/document-review/verification/verification-types.ts'
import { FieldVerification } from './FieldVerification.tsx'

afterEach(() => {
  cleanup()
})

describe('FieldVerification', () => {
  it('explains that a typed value without source evidence cannot be confirmed', () => {
    const verification: DocumentVerification = {
      fileName: 'letter.pdf',
      pageCount: 1,
      eligibleForComparison: false,
      reasons: ['Patient name was entered without source text from the document. It cannot be compared.'],
      fields: [
        {
          path: 'patient.name',
          label: 'Patient name',
          required: true,
          extracted: { status: 'missing' },
          originalValue: null,
          initialValue: null,
          reviewedValue: 'Erika Beispiel',
          modified: true,
          verification: 'unverified',
          normalizedValue: null,
          structural: [],
          uncertainty: [],
          evidencePageNumbers: [],
          sourceText: [],
          textSource: 'unspecified',
          ocrConfidence: null,
          canConfirm: false,
        },
      ],
    }

    render(
      <FieldVerification
        documentType="discharge-letter"
        verification={verification}
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('Original extracted value: None')).toBeTruthy()
    expect(screen.getByText('Verification for Patient name: Entered without source evidence')).toBeTruthy()
    expect(
      screen.getByText(
        'No source evidence was found for Patient name. A value typed here is not extracted evidence and cannot be confirmed for comparison.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText('Patient name was entered without source text from the document. It cannot be compared.'),
    ).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Confirm Patient name' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
