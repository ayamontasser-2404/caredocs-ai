/**
 * Expected findings for the synthetic CareDocs AI demo scenario.
 * These are acceptance-test fixtures, not results from an AI model.
 * Completeness and documentation findings are review prompts, not confirmed clinical errors.
 */
import type { ReviewFinding } from "../types/review.ts";

export const expectedFindings = [
  {
    id: "FIND-001",
    category: "medication",
    severity: "high",
    status: "open",
    title: "Abweichende Medikamentenstärke",
    description:
      "Die dokumentierte Stärke von Pantoprazol unterscheidet sich zwischen Entlassbrief und Medikationsplan.",
    rationale:
      "Die Abweichung muss anhand der autoritativen klinischen Dokumentation überprüft werden. Die Anwendung entscheidet nicht selbst, welcher Wert korrekt ist.",
    evidence: [
      {
        documentId: "DOC-2026-001",
        sectionId: "medication",
        excerpt: "Pantoprazol 40 mg",
      },
      {
        documentId: "DOC-2026-002",
        sectionId: "medication",
        excerpt: "Pantoprazol 20 mg",
      },
    ],
  },
  {
    id: "FIND-002",
    category: "patient-identity",
    severity: "high",
    status: "open",
    title: "Abweichender Patientenname",
    description:
      "Die Patientennamen unterscheiden sich, während Patienten-ID und Geburtsdatum übereinstimmen.",
    rationale:
      "Die Identität muss anhand der autoritativen Quelldokumentation überprüft werden. Die Anwendung korrigiert den Namen nicht automatisch.",
    evidence: [
      {
        documentId: "DOC-2026-001",
        sectionId: "patient",
        excerpt: "Erika Beispiel",
      },
      {
        documentId: "DOC-2026-002",
        sectionId: "patient",
        excerpt: "Erika Beispel",
      },
    ],
  },
  {
    id: "FIND-003",
    category: "completeness",
    severity: "review-required",
    status: "open",
    title: "Kein konkretes Nachsorgedatum angegeben",
    description:
      "Eine hausärztliche Verlaufskontrolle wird empfohlen, aber ein konkretes Datum fehlt.",
    rationale:
      "Die prüfende Person muss anhand der geltenden Prüfrichtlinie entscheiden, ob ein konkretes Datum erforderlich ist.",
    evidence: [
      {
        documentId: "DOC-2026-001",
        sectionId: "follow-up",
        excerpt: "Hausärztliche Verlaufskontrolle empfohlen.",
      },
    ],
  },
  {
    id: "FIND-004",
    category: "documentation",
    severity: "informational",
    status: "open",
    title: "Therapiedokumentation prüfen",
    description:
      "Der Therapieverlauf wird allgemein beschrieben; konkrete Behandlungsdetails sind im Beispieldokument nicht enthalten.",
    rationale:
      "Die prüfende Person muss anhand der projektspezifischen Prüfrichtlinie entscheiden, ob weitere Angaben erforderlich sind.",
    evidence: [
      {
        documentId: "DOC-2026-001",
        sectionId: "treatment",
        excerpt:
          "Die Patientin erhielt während des stationären Aufenthalts eine ärztlich festgelegte Behandlung.",
      },
    ],
  },
] as const satisfies readonly ReviewFinding[];
