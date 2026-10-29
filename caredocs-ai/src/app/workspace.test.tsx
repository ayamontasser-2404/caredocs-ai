import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { reviewChecklist } from '../data/reviewChecklist.ts'
import { sampleDischargeLetter } from '../data/sampleDischargeLetter.ts'
import { sampleMedicationPlan } from '../data/sampleMedicationPlan.ts'
import { createReviewSession } from '../features/document-review/review-session.ts'
import type { HealthcareDocument } from '../types/document.ts'
import { App } from './App.tsx'

afterEach(() => {
  cleanup()
})

describe('workspace pages', () => {
  it('opens on Home and keeps the sidebar to Home and New Review', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Welcome to CareDocs AI' })).toBeTruthy()
    expect(screen.getByText('Your AI-assisted healthcare document review workspace.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Discharge Letters' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Medication Plans' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Document Consistency' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Start New Review' })).toBeNull()

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const items = within(nav).getAllByRole('button')
    expect(items.map((item) => item.textContent)).toEqual(['Home', 'New Review'])
    expect(items[0]?.getAttribute('aria-current')).toBe('page')
    expect(within(nav).queryByRole('button', { name: 'Documents' })).toBeNull()
    expect(within(nav).queryByRole('button', { name: 'Review queue' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Start New Review' }))

    expect(screen.getByRole('heading', { name: 'Start New Review' })).toBeTruthy()
    expect(within(nav).getByRole('button', { name: 'New Review' }).getAttribute('aria-current')).toBe('page')
    expect(uploadPrecedesFindings()).toBe(true)
    expect(screen.getByRole('heading', { name: 'Your findings will appear here' })).toBeTruthy()
    expect(compareButton().disabled).toBe(true)
  })

  it('compares the sample documents with the existing engine and keeps finding status independent', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openNewReview(user)
    await user.click(screen.getByRole('button', { name: 'Use sample discharge letter' }))
    await user.click(screen.getByRole('button', { name: 'Use sample medication plan' }))

    expect(screen.getByText('Selected file: entlassbrief-demo (sample)')).toBeTruthy()
    expect(compareButton().disabled).toBe(false)
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()

    await user.click(compareButton())

    const session = createReviewSession([sampleDischargeLetter, sampleMedicationPlan], reviewChecklist)
    expect(await screen.findByRole('heading', { name: 'Abweichender Patientenname' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Your findings will appear here' })).toBeNull()
    expect(summaryCount('Total findings')).toBe(String(session.findings.length))
    expect(summaryCount('Open findings')).toBe(
      String(session.findings.filter((finding) => finding.status === 'open').length),
    )
    expect(summaryCount('High-priority findings')).toBe(
      String(session.findings.filter((finding) => finding.severity === 'high').length),
    )
    expect(screen.getByRole('heading', { name: 'Source documents' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Show evidence for Abweichender Patientenname' }))
    const evidence = screen.getByRole('button', { name: /Ärztlicher Entlassbrief/ })
    expect(evidence.textContent).toContain('Erika Beispiel')
    expect(screen.getByRole('button', { name: /Medikationsplan/ }).textContent).toContain('Erika Beispel')

    const findingStatus = statusFor('Abweichender Patientenname')
    await user.selectOptions(findingStatus, 'reviewed')
    expect(findingStatus.value).toBe('reviewed')
    expect(summaryCount('Open findings')).toBe(String(session.findings.length - 1))

    const reviewStatus = screen.getByLabelText('Review status') as HTMLSelectElement
    await user.selectOptions(reviewStatus, 'completed')
    expect(reviewStatus.value).toBe('completed')
    expect(findingStatus.value).toBe('reviewed')
    expect(summaryCount('Open findings')).toBe(String(session.findings.length - 1))

    await user.click(screen.getByRole('button', { name: 'Home' }))
    await user.click(screen.getByRole('button', { name: 'New Review' }))
    expect(findingStatus.value).toBe('reviewed')

    await user.click(screen.getByRole('button', { name: 'Remove discharge letter' }))
    expect(screen.getByRole('heading', { name: 'Your findings will appear here' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()
    expect(compareButton().disabled).toBe(true)
  })

  it('shows the no-findings state when the enabled checks return nothing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openNewReview(user)

    await user.upload(screen.getByLabelText('Choose discharge letter'), jsonFile('letter.json', matchingLetter))
    await user.upload(screen.getByLabelText('Choose medication plan'), jsonFile('plan.json', matchingPlan))
    expect(await screen.findByText('Selected file: letter.json')).toBeTruthy()
    expect(screen.getByText('Selected file: plan.json')).toBeTruthy()

    await user.click(compareButton())

    expect(await screen.findByRole('heading', { name: 'No discrepancies detected by the enabled checks.' })).toBeTruthy()
    expect(screen.getByText('This does not guarantee that the documents are complete or clinically correct.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Your findings will appear here' })).toBeNull()
    expect(summaryCount('Total findings')).toBe('0')
  })

  it('rejects a Word file and a corrupt PDF without creating findings', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openNewReview(user)

    const word = new File(['not a document'], 'letter.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    await user.upload(screen.getByLabelText('Choose discharge letter'), word)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Word files are not processed. Upload a PDF to extract text, or the structured JSON template.',
    )
    expect(screen.getAllByText('Selected file: None')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Your findings will appear here' })).toBeTruthy()
    expect(compareButton().disabled).toBe(true)

    const pdf = new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Choose discharge letter'), pdf)

    expect((await screen.findByRole('alert')).textContent).toContain('The file is not a valid PDF.')
    expect(screen.getByText('Document: scan.pdf')).toBeTruthy()
    expect(screen.queryByText('Status: Text extracted successfully')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()
    expect(compareButton().disabled).toBe(true)

    await user.upload(
      screen.getByLabelText('Replace discharge letter'),
      jsonFile('plan-in-letter-slot.json', sampleMedicationPlan),
    )
    expect((await screen.findByRole('alert')).textContent).toContain(
      'This slot expects a discharge letter, and the file is a medication plan.',
    )
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()
  })

  it('shows extracted PDF text without treating it as review findings', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openNewReview(user)

    const pdf = new File([pdfBytes([textStream('Pantoprazol 40 mg'), textStream('Ramipril 5 mg')])], 'letter.pdf', {
      type: 'application/pdf',
    })
    await user.upload(screen.getByLabelText('Choose discharge letter'), pdf)

    expect(await screen.findByText('Status: Text extracted successfully')).toBeTruthy()
    expect(screen.getByText('Document: letter.pdf')).toBeTruthy()
    expect(screen.getByText('Pages: 2')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Page 1' })).toBeTruthy()
    expect(screen.getByText('Pantoprazol 40 mg')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Page 2' })).toBeTruthy()
    expect(screen.getByText('Ramipril 5 mg')).toBeTruthy()
    expect(
      screen.getByText('This is text read from the file. It is not a review finding, and the documents have not been compared.'),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your findings will appear here' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()
    expect(compareButton().disabled).toBe(true)

    const blank = new File([pdfBytes([''])], 'blank.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Choose medication plan'), blank)

    expect(await screen.findByText('Status: No extractable text was found')).toBeTruthy()
    expect(screen.getByText('Document: blank.pdf')).toBeTruthy()
    expect(screen.getByText('Pages: 1')).toBeTruthy()
    expect(screen.getByText('This page has no embedded text.')).toBeTruthy()
    expect(compareButton().disabled).toBe(true)
    expect(screen.getByRole('heading', { name: 'Your findings will appear here' })).toBeTruthy()
  })
})

async function openNewReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'New Review' }))
}

function compareButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Compare Documents' }) as HTMLButtonElement
}

function uploadPrecedesFindings(): boolean {
  const upload = screen.getByRole('region', { name: 'Start New Review' })
  const findings = screen.getByRole('region', { name: 'Review Findings' })
  return (upload.compareDocumentPosition(findings) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

function summaryCount(name: string): string {
  return screen.getByText(name).nextElementSibling?.textContent ?? ''
}

function statusFor(title: string): HTMLSelectElement {
  return screen.getByLabelText(`Status for ${title}`) as HTMLSelectElement
}

function jsonFile(name: string, document: HealthcareDocument): File {
  return new File([JSON.stringify(document)], name, { type: 'application/json' })
}

function pdfBytes(pageStreams: readonly string[]): ArrayBuffer {
  const parts: Uint8Array[] = []
  let length = 0
  const offsets: number[] = []

  function push(text: string) {
    const bytes = new TextEncoder().encode(text)
    parts.push(bytes)
    length += bytes.byteLength
  }

  function addObject(body: string): void {
    offsets.push(length)
    push(`${offsets.length} 0 obj\n${body}\nendobj\n`)
  }

  push('%PDF-1.4\n')
  const kids = pageStreams.map((_, index) => `${4 + index * 2} 0 R`).join(' ')
  addObject('<< /Type /Catalog /Pages 2 0 R >>')
  addObject(`<< /Type /Pages /Count ${pageStreams.length} /Kids [${kids}] >>`)
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  for (const stream of pageStreams) {
    const contentId = offsets.length + 2
    addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    )
    addObject(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
  }

  const startxref = length
  const size = offsets.length + 1
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  push(xref)
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`)

  const bytes = new ArrayBuffer(length)
  const view = new Uint8Array(bytes)
  let cursor = 0
  for (const part of parts) {
    view.set(part, cursor)
    cursor += part.byteLength
  }
  return bytes
}

function textStream(text: string): string {
  const literal = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  return `BT /F1 12 Tf 72 720 Td (${literal}) Tj ET\n`
}

const sharedMedication = {
  name: 'Ramipril',
  strength: '5 mg',
  dosage: '1 Tablette morgens',
  instructions: 'Morgens',
}

const matchingLetter: HealthcareDocument = {
  id: 'DOC-MATCH-LETTER',
  type: 'discharge-letter',
  title: 'Matching letter',
  filename: 'letter-template',
  createdAt: '2026-10-20',
  patient: { patientId: 'DEMO-1', name: 'Erika Beispiel', dateOfBirth: '1962-03-14' },
  sections: [
    { id: 'admission-reason', title: 'Aufnahmegrund', content: 'Stationäre Aufnahme.' },
    { id: 'diagnoses', title: 'Diagnosen', content: 'Testdiagnose.' },
    { id: 'findings', title: 'Befunde', content: 'Testbefund.' },
    { id: 'treatment', title: 'Therapie', content: 'Beobachtung ohne weitere Angabe.' },
    { id: 'medication', title: 'Medikation', content: 'Siehe Liste.' },
    { id: 'follow-up', title: 'Nachsorge', content: 'Keine weitere Angabe.' },
  ],
  medications: [sharedMedication],
  synthetic: true,
  demoNotice: 'Synthetic example.',
}

const matchingPlan: HealthcareDocument = {
  id: 'DOC-MATCH-PLAN',
  type: 'medication-plan',
  title: 'Matching plan',
  filename: 'plan-template',
  createdAt: '2026-10-20',
  patient: { patientId: 'DEMO-1', name: 'Erika Beispiel', dateOfBirth: '1962-03-14' },
  sections: [
    { id: 'patient', title: 'Patientendaten', content: 'Siehe Daten.' },
    { id: 'medication', title: 'Medikamentenübersicht', content: 'Siehe Liste.' },
  ],
  medications: [sharedMedication],
  synthetic: true,
  demoNotice: 'Synthetic example.',
}
