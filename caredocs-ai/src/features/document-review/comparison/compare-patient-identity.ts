import type { HealthcareDocument } from '../../../types/document.ts'
import type { FindingEvidence, ReviewFinding } from '../../../types/review.ts'
import { normalizeText } from './normalize.ts'

const PATIENT_SECTION_ID = 'patient'

/**
 * Compare patient id, name, and date of birth.
 * Normalization is used only to decide whether a field differs.
 * Evidence quotes the original values and does not correct them.
 */
export function comparePatientIdentity(
  documentA: HealthcareDocument,
  documentB: HealthcareDocument,
): ReviewFinding[] {
  const findings: ReviewFinding[] = []
  const idsPresent = isPresent(documentA.patient.patientId) && isPresent(documentB.patient.patientId)
  const idMatches = idsPresent && sameText(documentA.patient.patientId, documentB.patient.patientId)
  const dobMatches = sameText(documentA.patient.dateOfBirth, documentB.patient.dateOfBirth)
  const nameMatches = sameText(documentA.patient.name, documentB.patient.name)

  if (idsPresent && !idMatches) {
    findings.push(
      identityFinding({
        id: 'FIND-IDENTITY-ID',
        title: 'Abweichende Patienten-ID',
        description: 'Die Patienten-IDs unterscheiden sich zwischen den Dokumenten.',
        rationale:
          'Die Identität muss anhand der autoritativen Quelldokumentation überprüft werden. Die Anwendung entscheidet nicht selbst, welche Angabe korrekt ist.',
        documentA,
        documentB,
        excerptA: documentA.patient.patientId,
        excerptB: documentB.patient.patientId,
      }),
    )
  }

  if (!dobMatches) {
    findings.push(
      identityFinding({
        id: 'FIND-IDENTITY-DOB',
        title: 'Abweichendes Geburtsdatum',
        description: 'Die Geburtsdaten unterscheiden sich zwischen den Dokumenten.',
        rationale:
          'Das Geburtsdatum muss anhand der autoritativen Quelldokumentation überprüft werden. Die Anwendung korrigiert keine Patientendaten automatisch.',
        documentA,
        documentB,
        excerptA: documentA.patient.dateOfBirth,
        excerptB: documentB.patient.dateOfBirth,
      }),
    )
  }

  if (!nameMatches) {
    findings.push(
      identityFinding({
        id: 'FIND-IDENTITY-NAME',
        title: 'Abweichender Patientenname',
        description: nameDescription(idMatches, dobMatches),
        rationale:
          'Die Identität muss anhand der autoritativen Quelldokumentation überprüft werden. Die Anwendung korrigiert den Namen nicht automatisch.',
        documentA,
        documentB,
        excerptA: documentA.patient.name,
        excerptB: documentB.patient.name,
      }),
    )
  }

  return findings
}

function sameText(left: string, right: string): boolean {
  return normalizeText(left) === normalizeText(right)
}

function isPresent(value: string): boolean {
  return value.trim().length > 0
}

function nameDescription(idMatches: boolean, dobMatches: boolean): string {
  if (idMatches && dobMatches) {
    return 'Die Patientennamen unterscheiden sich, während Patienten-ID und Geburtsdatum übereinstimmen.'
  }

  return 'Die Patientennamen unterscheiden sich zwischen den Dokumenten.'
}

function identityFinding(input: {
  id: string
  title: string
  description: string
  rationale: string
  documentA: HealthcareDocument
  documentB: HealthcareDocument
  excerptA: string
  excerptB: string
}): ReviewFinding {
  return {
    id: input.id,
    category: 'patient-identity',
    severity: 'high',
    status: 'open',
    title: input.title,
    description: input.description,
    rationale: input.rationale,
    evidence: [
      evidenceFor(input.documentA, input.excerptA),
      evidenceFor(input.documentB, input.excerptB),
    ],
  }
}

/**
 * Quotes the structured patient field. Some documents, including the sample
 * discharge letter, have no `patient` section; the citation still uses that
 * stable section id so a reviewer can see which field was compared.
 */
function evidenceFor(document: HealthcareDocument, excerpt: string): FindingEvidence {
  const section = document.sections.find((item) => item.id === PATIENT_SECTION_ID)

  return {
    documentId: document.id,
    sectionId: section?.id ?? PATIENT_SECTION_ID,
    excerpt,
  }
}
