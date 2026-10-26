/**
 * Synthetic German medication plan for CareDocs AI.
 * Includes intentional differences from sampleDischargeLetter for testing.
 * Demo data only: not for clinical use.
 */
export const sampleMedicationPlan = {
  id: "DOC-2026-002",
  type: "medication-plan",
  title: "Medikationsplan",
  filename: "medikationsplan-demo",
  createdAt: "2026-10-16",
  patient: {
    patientId: "DEMO-4711",
    // Intentional test discrepancy: spelling differs from the discharge letter.
    name: "Erika Beispel",
    dateOfBirth: "1962-03-14",
  },
  sections: [
    {
      id: "patient",
      title: "Patientendaten",
      content:
        "Patienten-ID: DEMO-4711. Name: Erika Beispel. Geburtsdatum: 14.03.1962.",
    },
    {
      id: "medication",
      title: "Medikamentenübersicht",
      content:
        "Die Angaben sind synthetische Testdaten. Abweichungen müssen anhand der autoritativen klinischen Dokumentation überprüft werden.",
    },
  ],
  medications: [
    {
      name: "Pantoprazol",
      // Intentional test discrepancy: discharge letter says 40 mg.
      strength: "20 mg",
      dosage: "1 Tablette morgens",
      instructions: "Vor dem Frühstück",
    },
    {
      name: "Ramipril",
      strength: "5 mg",
      dosage: "1 Tablette morgens",
      instructions: "Morgens",
    },
  ],
  demoNotice:
    "Synthetisches Beispieldokument. Nicht für medizinische Entscheidungen verwenden.",
} as const;
