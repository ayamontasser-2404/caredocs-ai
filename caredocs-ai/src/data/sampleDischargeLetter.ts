/**
 * Synthetic German hospital discharge letter for CareDocs AI.
 * Demo data only: fictional identity and clinical content; not for clinical use.
 */
export const sampleDischargeLetter = {
  id: "DOC-2026-001",
  type: "discharge-letter",
  title: "Ärztlicher Entlassbrief",
  filename: "entlassbrief-demo",
  createdAt: "2026-10-16",
  patient: {
    patientId: "DEMO-4711",
    name: "Erika Beispiel",
    dateOfBirth: "1962-03-14",
  },
  sections: [
    {
      id: "admission-reason",
      title: "Aufnahmegrund",
      content:
        "Die Patientin wurde aufgrund von Fieber, Husten und zunehmender Abgeschlagenheit stationär aufgenommen.",
    },
    {
      id: "diagnoses",
      title: "Diagnosen",
      content:
        "Ambulant erworbene Pneumonie. Arterielle Hypertonie als Begleiterkrankung.",
    },
    {
      id: "findings",
      title: "Befunde",
      content:
        "Bei der Aufnahme zeigten sich klinische Hinweise auf einen Atemwegsinfekt. Die weitere Diagnostik ergab Befunde, die mit der oben genannten Diagnose vereinbar waren. Im Verlauf des stationären Aufenthalts besserte sich der Allgemeinzustand der Patientin.",
    },
    {
      id: "treatment",
      title: "Therapie und klinischer Verlauf",
      content:
        "Die Patientin erhielt während des stationären Aufenthalts eine ärztlich festgelegte Behandlung. Im Verlauf zeigte sich eine klinische Besserung. Bei der Entlassung war die Patientin in einem stabilen Allgemeinzustand.",
    },
    {
      id: "medication",
      title: "Medikation bei Entlassung",
      content:
        "Die folgenden Angaben sind fiktive Testdaten und keine Therapieempfehlung.",
    },
    {
      id: "follow-up",
      title: "Empfehlungen zur Weiterbehandlung und Nachsorge",
      content:
        "Hausärztliche Verlaufskontrolle empfohlen. Erneute ärztliche Beurteilung bei anhaltenden oder zunehmenden Beschwerden. Ein konkretes Datum für die nächste hausärztliche Kontrolle ist in diesem Dokument nicht angegeben.",
    },
  ],
  medications: [
    {
      name: "Pantoprazol",
      strength: "40 mg",
      dosage: "1 Tablette morgens",
      instructions: "Vor dem Frühstück",
    },
    {
      name: "Ramipril",
      strength: "5 mg",
      dosage: "1 Tablette morgens",
      instructions: "Dauertherapie",
    },
  ],
  demoNotice:
    "Synthetisches Beispieldokument. Nicht für medizinische Entscheidungen verwenden.",
} as const;
