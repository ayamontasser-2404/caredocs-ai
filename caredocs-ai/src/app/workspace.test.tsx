import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const createOcrSession = vi.hoisted(() => vi.fn())
const renderPdfPage = vi.hoisted(() => vi.fn())

vi.mock('../features/document-review/extraction/run-ocr.ts', () => ({
  createOcrSession,
  ocrLanguage: 'deu',
}))

vi.mock('../features/document-review/extraction/render-pdf-page.ts', () => ({
  renderPdfPage,
  ocrPageScale: 2,
  releaseCanvas(canvas: HTMLCanvasElement) {
    canvas.width = 0
    canvas.height = 0
  },
}))
import { extractionPageElementId } from '../components/layout/section-target.ts'
import { reviewChecklist } from '../data/reviewChecklist.ts'
import { sampleDischargeLetter } from '../data/sampleDischargeLetter.ts'
import { sampleMedicationPlan } from '../data/sampleMedicationPlan.ts'
import { createReviewSession } from '../features/document-review/review-session.ts'
import type { HealthcareDocument } from '../types/document.ts'
import { App } from './App.tsx'

afterEach(() => {
  cleanup()
  createOcrSession.mockReset()
  renderPdfPage.mockReset()
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
    const nameCard = screen.getByRole('heading', { name: 'Abweichender Patientenname' }).closest('article')
    expect(nameCard?.textContent).toContain('Erika Beispiel')
    expect(nameCard?.textContent).toContain('Erika Beispel')
    expect(nameCard?.textContent).toContain('Page unavailable')
    expect(nameCard?.textContent).toContain('Supporting text unavailable')
    expect(nameCard?.textContent).toContain('Field verification: Verification status unavailable')
    expect(nameCard?.textContent).toContain('Finding review: Needs review')
    expect(statusFor('Abweichender Patientenname').value).toBe('open')

    await user.click(screen.getByRole('button', { name: /Missing information \(/ }))
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Kein konkretes Nachsorgedatum angegeben' })).toBeTruthy()
    expect(screen.getAllByText('No matching value was in the compared data.').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Show evidence for Kein konkretes Nachsorgedatum angegeben' }))
    expect(statusFor('Kein konkretes Nachsorgedatum angegeben').value).toBe('open')

    await user.click(screen.getByRole('button', { name: /Mismatches \(/ }))
    expect(screen.getByRole('heading', { name: 'Abweichender Patientenname' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Kein konkretes Nachsorgedatum angegeben' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^All \(/ }))

    const findingStatus = statusFor('Abweichender Patientenname')
    await user.selectOptions(findingStatus, 'reviewed')
    expect(findingStatus.value).toBe('reviewed')
    expect(summaryCount('Open findings')).toBe(String(session.findings.length - 1))
    expect(screen.getByRole('button', { name: 'Reviewed (1)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: `Needs review (${session.findings.length - 1})` })).toBeTruthy()

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
    expect(screen.getAllByText('Embedded text')).toHaveLength(2)
    expect(screen.getByText('Structured status: Structured data extracted')).toBeTruthy()
    expect(screen.getByText('Medication name: Pantoprazol')).toBeTruthy()
    expect(screen.getByText('Strength: 40 mg')).toBeTruthy()
    expect(screen.getByText('Medication name: Ramipril')).toBeTruthy()
    expect(screen.getByText('Strength: 5 mg')).toBeTruthy()
    expect(screen.getAllByText('Dosage: Not found')).toHaveLength(2)
    expect(screen.getByText('Patient name: Not found')).toBeTruthy()
    expect(
      screen.getByText('This text is unverified. It is not a review finding, and the documents have not been compared.'),
    ).toBeTruthy()
    expect(createOcrSession).not.toHaveBeenCalled()
    expect(renderPdfPage).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Your findings will appear here' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()
    expect(compareButton().disabled).toBe(true)

    createOcrSession.mockImplementation(async () => ({
      recognize: async () => ({ text: '   ', confidence: 12 }),
      dispose: async () => undefined,
    }))
    renderPdfPage.mockImplementation(async () => document.createElement('canvas'))

    const blank = new File([pdfBytes([''])], 'blank.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Choose medication plan'), blank)

    expect(await screen.findByText('Status: No readable text found')).toBeTruthy()
    expect(screen.getByText('Document: blank.pdf')).toBeTruthy()
    expect(screen.getByText('Pages: 1')).toBeTruthy()
    expect(screen.getByText('OCR')).toBeTruthy()
    expect(screen.getByText('This page has no readable text.')).toBeTruthy()
    expect(screen.getByText('Structured status: No supported fields recognized')).toBeTruthy()
    expect(createOcrSession).toHaveBeenCalledTimes(1)
    expect(renderPdfPage).toHaveBeenCalledTimes(1)
    expect(compareButton().disabled).toBe(false)
    await user.click(compareButton())
    expect(await screen.findByRole('heading', { name: 'Comparison was not run' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'No discrepancies detected by the enabled checks.' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()
  })

  it('shows recognized text from a scanned PDF without creating findings', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openNewReview(user)

    createOcrSession.mockImplementation(async () => ({
      recognize: async () => ({ text: 'Entlassbrief', confidence: 81 }),
      dispose: async () => undefined,
    }))
    renderPdfPage.mockImplementation(async () => document.createElement('canvas'))

    const scan = new File([pdfBytes([''])], 'scan.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Choose discharge letter'), scan)

    expect(await screen.findByText('Status: OCR completed')).toBeTruthy()
    expect(screen.getByText('Document: scan.pdf')).toBeTruthy()
    expect(screen.getByText('Entlassbrief')).toBeTruthy()
    expect(screen.getByText('Recognizer confidence: 81. This score is not a clinical check.')).toBeTruthy()
    expect(screen.getByText('Structured status: No supported fields recognized')).toBeTruthy()
    expect(screen.queryByText('Medication name: Entlassbrief')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Your findings will appear here' })).toBeTruthy()
    expect(compareButton().disabled).toBe(true)
  })

  it('shows structured fields from labeled PDF text without creating findings', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openNewReview(user)

    const labeled = new File(
      [
        pdfBytes([
          textStream('Patient name: Erika Beispiel'),
          textStream('Date of birth: 12 March 1980'),
          textStream('Medication: Pantoprazol 40 mg'),
          textStream('Instruction: Take one tablet in the morning.'),
          textStream('Follow-up: 15 November 2026'),
        ]),
      ],
      'labeled.pdf',
      { type: 'application/pdf' },
    )
    await user.upload(screen.getByLabelText('Choose discharge letter'), labeled)

    expect(await screen.findByText('Structured status: Structured data extracted')).toBeTruthy()
    expect(screen.getAllByText('Patient name: Erika Beispiel')).toHaveLength(2)
    expect(screen.getByText('Date of birth: 12 March 1980 (1980-03-12)')).toBeTruthy()
    expect(screen.getByText('Medication name: Pantoprazol')).toBeTruthy()
    expect(screen.getByText('Strength: 40 mg')).toBeTruthy()
    expect(screen.getByText('Dosage: Not found')).toBeTruthy()
    expect(screen.getByText('Instructions: Take one tablet in the morning')).toBeTruthy()
    expect(screen.getByText('Follow-up date: 15 November 2026 (2026-11-15)')).toBeTruthy()
    expect(screen.getByText('Source page 1: Patient name: Erika Beispiel')).toBeTruthy()
    expect(screen.getAllByText('Source page 3: Medication: Pantoprazol 40 mg')).toHaveLength(2)
    expect(screen.getByText('Source page 5: Follow-up: 15 November 2026')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your findings will appear here' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()
    expect(compareButton().disabled).toBe(true)
    expect(createOcrSession).not.toHaveBeenCalled()
  })

  it('keeps a corrected PDF field unverified until it is confirmed and does not compare it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openNewReview(user)
    await user.upload(screen.getByLabelText('Choose discharge letter'), labeledPdf())

    expect(await screen.findByText('Comparison readiness: Not eligible')).toBeTruthy()
    expect(screen.getByText('Verification for Patient name: Unverified')).toBeTruthy()
    expect(screen.getByText('Original extracted value: 40 mg')).toBeTruthy()

    const dateOfBirth = screen.getByRole('textbox', { name: 'Reviewed value for Date of birth' })
    await user.clear(dateOfBirth)
    await user.type(dateOfBirth, '03/04/1962')

    expect(screen.getAllByText('Date of birth: This date could not be read unambiguously.')).toHaveLength(2)
    expect((screen.getByRole('button', { name: 'Confirm Date of birth' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Comparison readiness: Not eligible')).toBeTruthy()

    await user.clear(dateOfBirth)
    await user.type(dateOfBirth, '12 March 1980')
    const strength = screen.getByRole('textbox', { name: 'Reviewed value for Medication 1 strength' })
    await user.clear(strength)
    await user.type(strength, '20 mg')

    expect(screen.getByText('Strength: 40 mg')).toBeTruthy()
    expect(screen.getByText('Original extracted value: 40 mg')).toBeTruthy()
    expect(screen.getByText('Verification for Medication 1 strength: Corrected')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Confirm Patient name' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Date of birth' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Medication 1 name' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Medication 1 strength' }))

    expect(screen.getByText('Verification for Follow-up date: Unverified. Optional')).toBeTruthy()
    expect(screen.getByText('Verification for Medication 1 strength: Correction confirmed')).toBeTruthy()
    expect(screen.getByText('Comparison readiness: Eligible for a later comparison')).toBeTruthy()
    expect(compareButton().disabled).toBe(true)
    expect(screen.getByRole('heading', { name: 'Your findings will appear here' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Abweichender Patientenname' })).toBeNull()
  })

  it('blocks comparison until PDF fields are confirmed, then compares confirmed values', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openNewReview(user)
    await user.upload(screen.getByLabelText('Choose discharge letter'), medicationPdf('letter.pdf', '40 mg'))
    await user.click(screen.getByRole('button', { name: 'Use sample medication plan' }))

    expect(await screen.findByText('Comparison readiness: Not eligible')).toBeTruthy()
    expect(compareButton().disabled).toBe(false)
    await user.click(compareButton())

    expect(await screen.findByRole('heading', { name: 'Comparison was not run' })).toBeTruthy()
    expect(screen.getByText('The documents are not ready. This is not a result of zero differences.')).toBeTruthy()
    expect(screen.getByText('Discharge letter: Patient name has not been confirmed.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Abweichende Medikamentenstärke' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'No discrepancies detected by the enabled checks.' })).toBeNull()

    await user.upload(screen.getByLabelText('Replace medication plan'), medicationPdf('plan.pdf', '20 mg'))
    expect(await screen.findByText('Selected file: plan.pdf')).toBeTruthy()
    await confirmVisibleFields(user)
    await user.click(compareButton())

    expect(await screen.findByRole('heading', { name: 'Abweichende Medikamentenstärke' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Comparison was not run' })).toBeNull()
    expect(screen.getAllByText('Original extracted value: 40 mg').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Original extracted value: 20 mg').length).toBeGreaterThan(0)
    const strengthCard = screen.getByRole('heading', { name: 'Abweichende Medikamentenstärke' }).closest('article')
    expect(strengthCard?.textContent).toContain('Page 3')
    expect(strengthCard?.textContent).toContain('Medication: Pantoprazol 40 mg')
    expect(strengthCard?.textContent).toContain('Medication: Pantoprazol 20 mg')
    expect(strengthCard?.textContent).toContain('Field verification: Verified against source')
    expect(strengthCard?.textContent).toContain('Finding review: Needs review')
    expect(statusFor('Abweichende Medikamentenstärke').value).toBe('open')
    await user.click(screen.getByRole('button', { name: 'Show evidence for Abweichende Medikamentenstärke' }))
    expect(statusFor('Abweichende Medikamentenstärke').value).toBe('open')
    await user.click(screen.getByRole('button', { name: /Discharge letter/ }))
    expect(document.activeElement?.id).toBe(extractionPageElementId('discharge-letter', 'letter.pdf', 3))

    const strength = screen.getAllByRole('textbox', { name: 'Reviewed value for Medication 1 strength' })[0]
    if (!strength) {
      throw new Error('Expected a strength field.')
    }
    await user.clear(strength)
    await user.type(strength, '10 mg')

    expect(screen.getByRole('heading', { name: 'Your findings will appear here' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Abweichende Medikamentenstärke' })).toBeNull()
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

async function confirmVisibleFields(user: ReturnType<typeof userEvent.setup>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pending = screen.getAllByRole('button', { name: /^Confirm / }).filter((button) => {
      const row = button.closest('.extraction-panel__edit')
      const text = row?.textContent ?? ''
      return text.includes('Unverified') || text.includes(': Corrected')
    })
    const next = pending[0]
    if (!next) {
      return
    }
    await user.click(next)
  }
}

function medicationPdf(name: string, strength: string): File {
  return new File(
    [
      pdfBytes([
        textStream('Patient name: Erika Beispiel'),
        textStream('Date of birth: 12 March 1980'),
        textStream(`Medication: Pantoprazol ${strength}`),
      ]),
    ],
    name,
    { type: 'application/pdf' },
  )
}

function labeledPdf(): File {
  return new File(
    [
      pdfBytes([
        textStream('Patient name: Erika Beispiel'),
        textStream('Date of birth: 12 March 1980'),
        textStream('Medication: Pantoprazol 40 mg'),
        textStream('Instruction: Take one tablet in the morning.'),
        textStream('Follow-up: 15 November 2026'),
      ]),
    ],
    'labeled.pdf',
    { type: 'application/pdf' },
  )
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
