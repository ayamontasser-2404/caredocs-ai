import type {
  ExtractedField,
  ExtractedMedicationFields,
  StructuredDocumentExtraction,
} from '../../features/document-review/extraction/extraction-types.ts'

/**
 * Shows fields read from PDF text.
 * A missing or ambiguous field is not a review finding and does not compare documents.
 */
export function StructuredFields({ extraction }: { extraction: StructuredDocumentExtraction }) {
  const data = extraction.data

  return (
    <div className="extraction-panel__page">
      <h3>Structured data</h3>
      <p role="status">Structured status: {outcomeLabel(extraction.outcome)}</p>
      <p className="extraction-panel__note">
        These fields are unverified. They are not review findings. An ambiguous value was not selected.
      </p>
      {data && extraction.outcome !== 'no-fields' ? (
        <>
          <p>Fields that were not in the text are marked not found.</p>
          <FieldLine label="Patient name" field={data.patient.name} />
          <FieldLine label="Date of birth" field={data.patient.dateOfBirth} />
          <FieldLine label="Patient identifier" field={data.patient.patientId} />
          <PresentField label="Document type" field={data.documentType} />
          <PresentField label="Document date" field={data.documentDate} />
          <PresentField label="Discharge date" field={data.dischargeDate} />
          {data.medications.length === 0 ? <p>Medications: Not found</p> : null}
          {data.medications.map((medication, index) => (
            <MedicationFields key={medicationKey(medication, index)} medication={medication} index={index} />
          ))}
          <FieldLine label="Follow-up date" field={data.followUp.date} />
          <FieldLine label="Follow-up instructions" field={data.followUp.instructions} />
          <FieldLine label="Treatment" field={data.treatment} />
          {data.unparsed.map((item, index) => (
            <p key={`${item.pageNumber}-${index}`}>
              Unattached text, source page {item.pageNumber}: {item.text}
            </p>
          ))}
        </>
      ) : null}
    </div>
  )
}

function MedicationFields({ medication, index }: { medication: ExtractedMedicationFields; index: number }) {
  return (
    <div className="extraction-panel__page">
      <h4>Medication {index + 1}</h4>
      <FieldLine label="Medication name" field={medication.name} />
      <FieldLine label="Strength" field={medication.strength} />
      <FieldLine label="Dosage" field={medication.dosage} />
      <FieldLine label="Instructions" field={medication.instructions} />
      <PresentField label="Route" field={medication.route} />
      <PresentField label="Frequency" field={medication.frequency} />
      <PresentField label="Start date" field={medication.startDate} />
      <PresentField label="End date" field={medication.endDate} />
    </div>
  )
}

function PresentField({ label, field }: { label: string; field: ExtractedField }) {
  if (field.status === 'missing') {
    return null
  }

  return <FieldLine label={label} field={field} />
}

function FieldLine({ label, field }: { label: string; field: ExtractedField }) {
  if (field.status === 'missing') {
    return <p>{label}: Not found</p>
  }

  if (field.status === 'unparsed') {
    return (
      <>
        <p>{label}: Could not be read confidently</p>
        {field.evidence.map((item, index) => (
          <p key={`${item.pageNumber}-${index}`}>
            Source page {item.pageNumber}: {item.text}
          </p>
        ))}
      </>
    )
  }

  if (field.status === 'ambiguous') {
    return (
      <>
        <p>{label}: Ambiguous. No value was selected.</p>
        {field.candidates.map((candidate, index) => (
          <p key={`${candidate.evidence.pageNumber}-${index}`}>
            Candidate: {candidate.sourceValue}
            {candidate.normalizedValue ? ` (${candidate.normalizedValue})` : ''}. Source page{' '}
            {candidate.evidence.pageNumber}: {candidate.evidence.text}
          </p>
        ))}
      </>
    )
  }

  return (
    <>
      <p>
        {label}: {field.sourceValue}
        {field.normalizedValue ? ` (${field.normalizedValue})` : ''}
      </p>
      {field.evidence.map((item, index) => (
        <p key={`${item.pageNumber}-${index}`}>
          Source page {item.pageNumber}: {item.text}
        </p>
      ))}
    </>
  )
}

function medicationKey(medication: ExtractedMedicationFields, index: number): string {
  const name = medication.name.status === 'found' ? medication.name.sourceValue : 'medication'
  return `${name}-${index}`
}

function outcomeLabel(outcome: StructuredDocumentExtraction['outcome']): string {
  switch (outcome) {
    case 'completed':
      return 'Structured data extracted'
    case 'partial':
      return 'Some extracted fields are ambiguous or could not be read'
    case 'no-fields':
      return 'No supported fields recognized'
    case 'unsupported':
      return 'Structured extraction could not read this result'
  }
}
