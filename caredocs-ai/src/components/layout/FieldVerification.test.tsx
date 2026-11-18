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
    expect(screen.getByText('Patient name · Entered without source evidence')).toBeTruthy()
    expect(screen.getByText('Patient name was entered without source text from the document. It cannot be compared.')).toBeTruthy()
    expect(
      screen.getByText(
        'No source evidence was found for Patient name. A value typed here is not extracted evidence and cannot be confirmed for comparison.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText('Patient name was entered without source text from the document. It cannot be compared.'),
    ).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Confirm Patient name' }) as HTMLButtonElement).disabled).toBe(true)
    expect(document.querySelector('.verification-checklist__item--confirmed')).toBeNull()
    expect(document.querySelector('.verification-field--pending')).toBeTruthy()
  })

  it('turns a confirmed field green and keeps an unconfirmed field red', () => {
    render(
      <FieldVerification
        documentType="discharge-letter"
        verification={{
          fileName: 'letter.pdf',
          pageCount: 1,
          eligibleForComparison: false,
          reasons: ['Date of birth has not been confirmed.'],
          fields: [
            confirmedField('patient.name', 'Patient name'),
            { ...confirmedField('patient.dateOfBirth', 'Date of birth'), verification: 'unverified', canConfirm: true },
          ],
        }}
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('Patient name is confirmed.')).toBeTruthy()
    expect(screen.getByText('Date of birth has not been confirmed.')).toBeTruthy()
    expect(document.querySelector('.verification-checklist__item--confirmed')?.textContent).toBe(
      'Patient name is confirmed.',
    )
    expect(document.querySelector('.verification-checklist__item--pending')?.textContent).toBe(
      'Date of birth has not been confirmed.',
    )
    expect(document.querySelectorAll('.verification-field--confirmed')).toHaveLength(1)
    expect(document.querySelectorAll('.verification-field--pending')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Confirm Patient name' })).toBeNull()
  })
})

function confirmedField(path: string, label: string) {
  return {
    path,
    label,
    required: true,
    extracted: { status: 'found' as const, sourceValue: 'Erika Beispiel', normalizedValue: null, evidence: [] },
    originalValue: 'Erika Beispiel',
    initialValue: 'Erika Beispiel',
    reviewedValue: 'Erika Beispiel',
    modified: false,
    verification: 'confirmed' as const,
    normalizedValue: null,
    structural: [],
    uncertainty: [],
    evidencePageNumbers: [1],
    sourceText: ['Patient name: Erika Beispiel'],
    textSource: 'embedded' as const,
    ocrConfidence: null,
    canConfirm: true,
  }
}
