import type { DocumentType } from '../../types/document.ts'

const sampleFiles = {
  'discharge-letter': {
    url: new URL('../../../docs/sample-documents/discharge-letter.pdf', import.meta.url),
    name: 'discharge-letter.pdf',
  },
  'medication-plan': {
    url: new URL('../../../docs/sample-documents/medication-plan.pdf', import.meta.url),
    name: 'medication-plan.pdf',
  },
} as const

/** Load one bundled sample PDF. This does not read or confirm its fields. */
export async function loadSamplePdf(type: DocumentType): Promise<File> {
  const sample = sampleFiles[type]
  const response = await fetch(sample.url)
  if (!response.ok) {
    throw new Error('The sample document could not be loaded.')
  }

  const bytes = await response.arrayBuffer()
  const header = new TextDecoder().decode(bytes.slice(0, 5))
  if (!header.startsWith('%PDF-')) {
    throw new Error('The sample document could not be loaded.')
  }

  return new File([bytes], sample.name, { type: 'application/pdf' })
}
