import type { DocumentType } from '../../types/document.ts'
import { fieldHasSourceEvidence } from '../../features/document-review/verification/review-extracted-document.ts'
import type { DocumentVerification, ReviewedField } from '../../features/document-review/verification/verification-types.ts'

interface FieldVerificationProps {
  documentType: DocumentType
  verification: DocumentVerification
  onEdit: (type: DocumentType, path: string, value: string) => void
  onConfirm: (type: DocumentType, path: string) => void
}

/**
 * Reviewer corrections for one PDF.
 * Confirming a field does not compare documents and is not an electronic signature.
 */
export function FieldVerification({ documentType, verification, onEdit, onConfirm }: FieldVerificationProps) {
  return (
    <div className="extraction-panel__page">
      <h3>Verification</h3>
      <p className="extraction-panel__note">
        Confirmation stays in this browser session. It is not an electronic signature. Compare Documents uses these
        confirmed values only when both documents are ready.
      </p>
      <p role="status">
        Comparison readiness: {verification.eligibleForComparison ? 'Eligible for a later comparison' : 'Not eligible'}
      </p>
      <ul className="verification-checklist">
        {verification.fields.map((field) => {
          const confirmed = field.verification === 'confirmed'
          const reason = verification.reasons.find((item) => item.startsWith(field.label))

          return (
            <li
              key={field.path}
              className={`verification-checklist__item verification-checklist__item--${confirmed ? 'confirmed' : 'pending'}`}
            >
              {confirmed ? `${field.label} is confirmed.` : (reason ?? `${field.label} is not confirmed.`)}
            </li>
          )
        })}
        {verification.reasons
          .filter((reason) => !verification.fields.some((field) => reason.startsWith(field.label)))
          .map((reason) => (
            <li key={reason} className="verification-checklist__item verification-checklist__item--pending">
              {reason}
            </li>
          ))}
      </ul>
      {verification.fields.map((field) => (
        <ReviewedFieldRow
          key={field.path}
          documentType={documentType}
          field={field}
          onEdit={onEdit}
          onConfirm={onConfirm}
        />
      ))}
    </div>
  )
}

function ReviewedFieldRow({
  documentType,
  field,
  onEdit,
  onConfirm,
}: {
  documentType: DocumentType
  field: ReviewedField
  onEdit: (type: DocumentType, path: string, value: string) => void
  onConfirm: (type: DocumentType, path: string) => void
}) {
  const confirmed = field.verification === 'confirmed'

  return (
    <div
      className={`extraction-panel__edit verification-field verification-field--${confirmed ? 'confirmed' : 'pending'}`}
    >
      <p>
        {field.label}
        {field.required ? '' : ' · Optional'}
        {' · '}
        {statusText(field)}
      </p>
      <p>Original extracted value: {field.originalValue ?? 'None'}</p>
      {!fieldHasSourceEvidence(field) ? (
        <p className="extraction-panel__note">
          No source evidence was found for {field.label}. A value typed here is not extracted evidence and cannot be
          confirmed for comparison.
        </p>
      ) : null}
      {field.sourceText.map((text, index) => (
        <p key={`${field.path}-${index}`}>
          Verification source page {field.evidencePageNumbers[index]}: {text}
          {field.textSource === 'ocr' ? '. OCR' : ''}
          {field.textSource === 'ocr' && typeof field.ocrConfidence === 'number'
            ? `. Recognizer confidence: ${field.ocrConfidence}. This score is not a clinical check.`
            : ''}
        </p>
      ))}
      {field.structural.map((issue) => (
        <p key={issue.message} role="alert">
          {field.label}: {issue.message}
        </p>
      ))}
      {field.uncertainty.map((issue) => (
        <p key={issue.message}>
          {field.label} uncertainty: {issue.message}
        </p>
      ))}
      {field.normalizedValue ? <p>Read as {field.normalizedValue}</p> : null}
      <label className="extraction-panel__edit">
        Reviewed value for {field.label}
        <input
          aria-label={`Reviewed value for ${field.label}`}
          value={field.reviewedValue}
          onChange={(event) => onEdit(documentType, field.path, event.target.value)}
        />
      </label>
      {confirmed ? null : (
        <button
          type="button"
          className="button-secondary"
          disabled={!field.canConfirm}
          onClick={() => onConfirm(documentType, field.path)}
        >
          Confirm {field.label}
        </button>
      )}
    </div>
  )
}

function statusText(field: ReviewedField): string {
  if (!fieldHasSourceEvidence(field)) {
    return field.reviewedValue.trim().length > 0 ? 'Entered without source evidence' : 'Not confirmed'
  }

  if (field.verification === 'confirmed') {
    return 'Confirmed'
  }

  if (field.modified) {
    return 'Changed'
  }

  return 'Not confirmed'
}
