import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HealthcareDocument } from '../../types/document.ts'
import type { ReviewFinding, ReviewState } from '../../types/review.ts'
import { ReviewPanel } from './ReviewPanel.tsx'

const letter = document('DOC-A', 'discharge-letter', 'Discharge letter')
const plan = document('DOC-B', 'medication-plan', 'Medication plan')

afterEach(() => {
  cleanup()
})

describe('ReviewPanel findings', () => {
  it('keeps comparison states distinct', () => {
    const { rerender } = render(panel({ phase: 'idle' }))
    expect(screen.getByRole('heading', { name: 'Your findings will appear here' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'No discrepancies detected by the enabled checks.' })).toBeNull()

    rerender(panel({ phase: 'blocked', blockReasons: [{ code: 'DOCUMENT_NOT_VERIFIED', document: 'discharge-letter', message: 'Patient name has not been confirmed.' }] }))
    expect(screen.getByRole('heading', { name: 'Comparison was not run' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'No discrepancies detected by the enabled checks.' })).toBeNull()

    rerender(panel({ phase: 'error', compareError: 'The documents could not be compared.' }))
    expect(screen.getByRole('alert').textContent).toContain('The documents could not be compared.')
    expect(screen.queryByRole('heading', { name: 'No discrepancies detected by the enabled checks.' })).toBeNull()

    rerender(panel({ phase: 'ready', review: review([]) }))
    expect(screen.getByRole('heading', { name: 'No discrepancies detected by the enabled checks.' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Mismatches/ })).toBeNull()
  })

  it('does not mark a finding reviewed when its evidence is opened', async () => {
    const user = userEvent.setup()
    const onFindingStatusChange = vi.fn()
    render(panel({ phase: 'ready', review: review([nameFinding()]), onFindingStatusChange }))

    expect(screen.getByText('Finding review: Needs review')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show evidence for Abweichender Patientenname' }))
    expect(onFindingStatusChange).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Status for Abweichender Patientenname') as HTMLSelectElement).value).toBe('open')
    expect(screen.getByRole('button', { name: /Discharge letter/ }).textContent).toContain('Page unavailable')

    await user.selectOptions(screen.getByLabelText('Status for Abweichender Patientenname'), 'reviewed')
    expect(onFindingStatusChange).toHaveBeenCalledWith('FIND-IDENTITY-NAME', 'reviewed')
  })

  it('filters findings and keeps counts on the full result', async () => {
    const user = userEvent.setup()
    render(panel({ phase: 'ready', review: review([nameFinding(), followUpFinding()]) }))

    expect(screen.getByRole('button', { name: 'All (2)' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Needs review (2)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mismatches (1)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Missing information (1)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reviewed (0)' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Missing information (1)' }))
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Kein konkretes Nachsorgedatum angegeben' })).toBeTruthy()
    expect(screen.getByText('Showing 1 of 2 findings.')).toBeTruthy()
    expect(screen.getByText('Total findings').nextElementSibling?.textContent).toBe('2')

    await user.click(screen.getByRole('button', { name: 'Reviewed (0)' }))
    expect(screen.getByText('No findings match this filter.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'No discrepancies detected by the enabled checks.' })).toBeNull()
  })
})

function panel(overrides: Partial<Parameters<typeof ReviewPanel>[0]>) {
  return (
    <ReviewPanel
      phase="idle"
      review={null}
      compareError={null}
      blockReasons={[]}
      documents={[letter, plan]}
      sources={[]}
      activeEvidence={null}
      onReviewStatusChange={vi.fn()}
      onFindingStatusChange={vi.fn()}
      onEvidenceSelect={vi.fn()}
      {...overrides}
    />
  )
}

function review(findings: readonly ReviewFinding[]): ReviewState {
  return { status: 'not-started', documentIds: [letter.id, plan.id], findings }
}

function nameFinding(): ReviewFinding {
  return {
    id: 'FIND-IDENTITY-NAME',
    category: 'patient-identity',
    severity: 'high',
    status: 'open',
    title: 'Abweichender Patientenname',
    description: 'The names differ.',
    rationale: 'Check the source.',
    evidence: [
      { documentId: letter.id, sectionId: 'patient', excerpt: 'Erika Beispiel' },
      { documentId: plan.id, sectionId: 'patient', excerpt: 'Erika Beispel' },
    ],
  }
}

function followUpFinding(): ReviewFinding {
  return {
    id: 'FIND-FOLLOW-UP-DATE',
    category: 'completeness',
    severity: 'review-required',
    status: 'open',
    title: 'Kein konkretes Nachsorgedatum angegeben',
    description: 'A follow-up is mentioned without a date.',
    rationale: 'Check the source.',
    evidence: [{ documentId: letter.id, sectionId: 'follow-up', excerpt: 'Hausärztliche Verlaufskontrolle empfohlen.' }],
  }
}

function document(id: string, type: HealthcareDocument['type'], title: string): HealthcareDocument {
  return {
    id,
    type,
    title,
    filename: `${id}.json`,
    createdAt: '2026-03-14',
    patient: { patientId: 'DEMO-4711', name: 'Erika Beispiel', dateOfBirth: '1962-03-14' },
    sections: [{ id: 'patient', title: 'Patient', content: 'Erika Beispiel' }],
    medications: [],
    synthetic: true,
    demoNotice: 'Synthetic test document.',
  }
}
