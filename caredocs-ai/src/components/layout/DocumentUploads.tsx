import { templateFor } from '../../features/document-review/template-validation.ts'
import type { DocumentType } from '../../types/document.ts'
import type { DocumentSlot } from './workspace.ts'
import { usingSample } from './workspace.ts'

interface DocumentUploadsProps {
  letter: DocumentSlot
  plan: DocumentSlot
  onUpload: (type: DocumentType, file: File) => void
  onRemove: (type: DocumentType) => void
  onUseSample: (type: DocumentType) => void
}

const slotCopy = {
  'discharge-letter': {
    title: 'Discharge Letter',
    description:
      'Review patient identity, diagnoses, treatment documentation, medication, and follow-up information.',
    choose: 'Choose discharge letter',
    replace: 'Replace discharge letter',
    remove: 'Remove discharge letter',
    sample: 'Use sample discharge letter',
  },
  'medication-plan': {
    title: 'Medication Plan',
    description: 'Compare medication names, strength, dosage, and administration instructions.',
    choose: 'Choose medication plan',
    replace: 'Replace medication plan',
    remove: 'Remove medication plan',
    sample: 'Use sample medication plan',
  },
} as const

export function DocumentUploads({ letter, plan, onUpload, onRemove, onUseSample }: DocumentUploadsProps) {
  const slots = { 'discharge-letter': letter, 'medication-plan': plan } as const

  return (
    <div className="upload-grid">
      {(['discharge-letter', 'medication-plan'] as const).map((type) => {
        const slot = slots[type]
        const copy = slotCopy[type]
        const ready = slot.document !== null
        const errorId = `${type}-upload-errors`
        const sections = templateFor(type).map((section) => section.id).join(', ')

        return (
          <article className="upload-card" key={type}>
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
            <p className="upload-card__limit">
              Upload a JSON file that matches this template. PDF and Word files are not processed.
            </p>
            <p className="upload-card__hint">Required sections: {sections}</p>
            <label className="button-secondary upload-card__file" htmlFor={`${type}-file`}>
              {ready ? copy.replace : copy.choose}
            </label>
            <input
              id={`${type}-file`}
              className="upload-card__input"
              type="file"
              aria-invalid={slot.errors.length > 0}
              aria-describedby={slot.errors.length > 0 ? errorId : undefined}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) {
                  onUpload(type, file)
                }
              }}
            />
            <p className="upload-card__filename">Selected file: {slot.filename ?? 'None'}</p>
            {ready ? (
              <button type="button" className="button-secondary" onClick={() => onRemove(type)}>
                {copy.remove}
              </button>
            ) : null}
            <button
              type="button"
              className="button-secondary"
              onClick={() => onUseSample(type)}
              disabled={usingSample(type, slot)}
            >
              {copy.sample}
            </button>
            {slot.errors.length > 0 ? (
              <ul className="upload-card__errors" id={errorId} role="alert">
                {slot.errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
