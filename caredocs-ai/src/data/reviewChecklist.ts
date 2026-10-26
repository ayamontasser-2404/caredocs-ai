/**
 * Prototype checklist for demonstrating document-review behavior.
 * These are illustrative software checks, not an official clinical standard.
 */
import type { ReviewChecklistItem } from "../types/review.ts";

export const reviewChecklist = [
  {
    id: "patient-identity-consistency",
    title: "Patientenidentität",
    description:
      "Patienten-ID, Name und Geburtsdatum zwischen den Dokumenten vergleichen.",
    category: "patient-identity",
    enabled: true,
  },
  {
    id: "medication-consistency",
    title: "Medikationsabgleich",
    description:
      "Medikamentenname, Stärke, Dosierung und Einnahmehinweise zwischen den Dokumenten vergleichen.",
    category: "medication",
    enabled: true,
  },
  {
    id: "follow-up-documentation",
    title: "Nachsorge dokumentiert",
    description:
      "Prüfen, ob die Angaben zur Nachsorge ausreichend dokumentiert sind. Fehlende Angaben sind nicht automatisch ein Fehler.",
    category: "completeness",
    enabled: true,
  },
  {
    id: "treatment-documentation",
    title: "Therapieverlauf dokumentiert",
    description:
      "Prüfen, ob der dokumentierte Therapieverlauf den projektspezifischen Anforderungen entspricht.",
    category: "documentation",
    enabled: true,
  },
] as const satisfies readonly ReviewChecklistItem[];
