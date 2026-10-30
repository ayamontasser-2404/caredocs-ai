import type { DocumentType } from '../../types/document.ts'
import type { ReviewedField } from '../../features/document-review/verification/verification-types.ts'
import type { DocumentVerification } from '../../features/document-review/verification/verification-types.ts'

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
      {verification.reasons.length > 0 ? (
        <ul className="upload-card__errors">
          {verification.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p>Required fields are confirmed. Optional fields that were not in the text are not required.</p>
      )}
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
  return (
    <div className="extraction-panel__edit">
      <p>
        Verification for {field.label}: {statusText(field)}
        {field.required ? '' : '. Optional'}
      </p>
      <p>Original extracted value: {field.originalValue ?? 'None'}</p>
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
      <button
        type="button"
        className="button-secondary"
        disabled={!field.canConfirm}
        onClick={() => onConfirm(documentType, field.path)}
      >
        Confirm {field.label}
      </button>
    </div>
  )
}

function statusText(field: ReviewedField): string {
  if (field.verification === 'confirmed' && field.modified) {
    return 'Correction confirmed'
  }

  if (field.verification === 'confirmed') {
    return 'Confirmed'
  }

  if (field.modified) {
    return 'Corrected'
  }

  return 'Unverified'
}
