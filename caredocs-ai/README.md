# CareDocs AI

CareDocs AI compares a structured discharge letter with a structured medication plan and shows discrepancies and documentation gaps for a person to review.

The comparison does not decide which value is correct, recommend a medication change, or confirm a clinical error. Every patient and clinical string in this repository is fictional.

An uploaded PDF is read in the browser. Embedded text is extracted with PDF.js. Pages without usable embedded text are recognized with Tesseract.js using the German language data (`deu`). Supported labels in that text are turned into structured fields with page evidence. The reviewer can correct and confirm those fields in the current session. Confirmation does not replace the extracted value or its source text. It is not an electronic signature, and it does not compare the PDF. The fields are not a `HealthcareDocument` or a finding. No language model is used. Accounts, reviewer identity, and saved reviews are not implemented. An upload lasts for the browser session only. Refreshing the page returns to Home with empty document slots.

## Run

The Vite app is this directory. `package.json` is here, not in the git root.

```bash
npm install
npm run dev
```

| Script | What it runs |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm test` | `vitest run` in `happy-dom` (`vite.config.ts`) |
| `npm run lint` | Oxlint, using `.oxlintrc.json` |
| `npm run build` | `tsc -b` and the Vite production build |
| `npm run preview` | Preview the production build |

Dependencies used by the app are React 19, TypeScript, `lucide-react`, `pdfjs-dist`, and `tesseract.js`. Tests use Vitest, happy-dom, and React Testing Library. There is no router and no state library.

## Pages

`src/app/App.tsx` renders `AppShell`. Page and review state live in `AppShell` and `src/components/layout/workspace.ts`. The initial page is `home`. Slots start empty.

The sidebar has two items, Home and New Review.

**Home** (`HomePage`) introduces the workspace, the two document types, and three steps: upload, review findings, then verify and complete. **Start New Review** sets the page to `new-review`.

**New Review** (`NewReviewPage`) shows two upload cards, then **Compare Documents**, then the findings. The button is enabled only when both slots hold a document and the phase is not `comparing` (`canCompare`).

Clicking Compare calls `beginCompare`, then `createReviewSession([letter, plan], reviewChecklist)`. That function calls `compareDocuments`. The new review status is `not-started`. New findings are `open`. Previous finding statuses are not copied.

Before a comparison, the findings section says the results will appear there. A finished comparison with zero findings says no discrepancies were detected by the enabled checks. Those two messages are different.

After a comparison with findings, the panel shows three counts taken from the finding list: total, status `open`, and severity `high`. Each card shows title, category, severity, status, description, and rationale. Evidence is behind **Show evidence**. Choosing an excerpt sets `activeEvidence`. `DocumentSurface` highlights that section. A medication excerpt also highlights the matching line. A sentence excerpt is wrapped in `<mark>` when the section text contains it.

`setReviewStatus` changes only `ReviewState.status` and keeps the same findings array. `setFindingStatus` changes one finding and leaves the review status unchanged. Completing a review does not resolve findings.

Accepting a file or sample, or removing a document, clears the current review. A rejected file sets slot errors and leaves the accepted document and the current review in place.

There is no URL route. State is React state in memory.

## Upload

`parseDocumentUpload` in `src/features/document-review/template-validation.ts` reads one JSON file for the selected slot. The slot chooses the template. The file `type` must be `discharge-letter` or `medication-plan`.

A PDF is validated, then read with `extractPdfContent`. Pages that already contain embedded text stay on that path. Pages without usable text are rendered with PDF.js and recognized with one Tesseract.js worker (`deu`). `extractDocumentData` then reads labeled patient, medication, follow-up, and treatment fields from that text. `createDocumentVerification` reviews those fields without changing the extraction. The card shows the file name, page count, page text, extraction method, recognizer confidence when the library returns it, the structured fields with their source page, and a separate verification section. Confidence is not a clinical check. A missing field stays missing. An ambiguous field is shown and not selected until the reviewer types one value and confirms that field. Structural problems, extraction uncertainty, and confirmation are separate. Required fields for this readiness check are patient name, date of birth, and, for each extracted medication, its name and strength. Optional fields may be absent. A required field is ready only when it has source text, a valid reviewed value, and an explicit confirmation. The card then says the PDF is eligible for a later comparison. That flag does not enable Compare Documents and does not build a `HealthcareDocument`. Compare Documents stays disabled until both slots hold structured JSON documents. Review state is not saved.

`AppShell` rejects `.doc` and `.docx` before parsing. The message is: `Word files are not processed. Upload a PDF to extract text, or the structured JSON template.` Invalid JSON returns `The file is not valid JSON.` A PDF that cannot be opened, rendered, or recognized shows a controlled error and is not stored as an empty success. A PDF that opens but yields no readable text is a successful read with status `No readable text found`.

A section counts as present when its id matches the template, it appears once, and its title and content are non-blank after trim. The German titles below are the template labels. The validator does not require the uploaded title to equal that label. Extra sections are allowed. Messages name section ids and missing fields. They do not quote patient or medication values.

Discharge letter section ids, in order: `admission-reason`, `diagnoses`, `findings`, `treatment`, `medication`, `follow-up`. A `patient` section is not required.

Medication plan section ids, in order: `patient`, `medication`.

Also required: document id, title, filename, `createdAt`, `synthetic: true`, a non-blank `demoNotice`, patient id, name, date of birth, and at least one medication line with name, strength, and dosage. Instructions are optional.

The stored JSON document keeps the original clinical strings. The original `File` and the raw JSON text are not kept. A PDF keeps the extraction result and filename in session state and does not set the structured document. A sample filename is shown as `{filename} (sample)`.

Each card can load its built-in fixture: `sampleDischargeLetter` or `sampleMedicationPlan`. That is an explicit button. A failed upload does not switch the slot to the sample.

## Domain model

Types are in `src/types/document.ts` and `src/types/review.ts`. Fixtures are in `src/data/`.

`HealthcareDocument` fields: `id`, `type` (`discharge-letter` or `medication-plan`), `title`, `filename`, `createdAt`, `patient`, `sections`, `medications`, `synthetic: true`, `demoNotice`.

`PatientIdentity`: `patientId`, `name`, `dateOfBirth`.

`DocumentSection`: `id`, `title`, `content`.

`MedicationEntry`: `name`, `strength`, `dosage`, optional `instructions`. Strength and dosage are separate fields. `40 mg` is strength. `1 Tablette morgens` is dosage.

`ReviewCategory`: `medication`, `patient-identity`, `completeness`, `documentation`.

`FindingSeverity`: `high`, `review-required`, `informational`.

`FindingStatus`: `open`, `reviewed`, `resolved`, `follow-up-required`.

`ReviewStatus`: `not-started`, `in-progress`, `completed`.

`FindingEvidence`: `documentId`, `sectionId`, `excerpt`. The excerpt is the source value. It is not a verdict.

`ReviewState`: `status`, `documentIds`, `findings`. Finding status is stored on each finding.

## Comparison

`compareDocuments(documentA, documentB, checklist)` in `src/features/document-review/comparison/compare-documents.ts` returns findings. It does not modify its inputs, does not log patient or medication values, and does not set review status. Invalid input throws `ComparisonInputError` from `assertions.ts`. The message names the missing field, not the patient or medication value.

A checklist item runs only when `enabled` is true. `reviewChecklist` enables all four:

| Checklist id | Module |
| --- | --- |
| `patient-identity-consistency` | `compare-patient-identity.ts` |
| `medication-consistency` | `compare-medications.ts` |
| `follow-up-documentation` | `detect-missing-information.ts` |
| `treatment-documentation` | `detect-missing-information.ts` |

Matching uses `normalizeText`: NFKC, trim, collapsed whitespace, and `de-DE` lowercase. Findings quote the original strings. `normalizeMedicationName` also strips trailing `. , ; :`. Brand and generic names are not treated as the same drug. `1962-03-14` and `14.03.1962` are different because dates are not parsed.

Identity differences are `high` and start `open`: `FIND-IDENTITY-ID`, `FIND-IDENTITY-DOB`, `FIND-IDENTITY-NAME`. Evidence uses section id `patient` and the original field value. The sample discharge letter has no `patient` section. The citation still uses that id, and `DocumentSurface` renders a patient-identity block for it.

Medication lines are paired by normalized name, in document order. Strength, dosage, and instructions are separate comparisons.

| Condition | Finding id | Severity |
| --- | --- | --- |
| Both strengths differ | `FIND-MED-{NAME}-STRENGTH` | `high` |
| Both dosages differ | `FIND-MED-{NAME}-DOSAGE` | `high` |
| Both instructions differ | `FIND-MED-{NAME}-INSTRUCTIONS` | `high` |
| An instruction is present on only one side | `FIND-MED-{NAME}-INSTRUCTIONS` | `review-required` |
| The name exists only in the first document | `FIND-MED-ONLY-A-{NAME}` | `review-required` |
| The name exists only in the second document | `FIND-MED-ONLY-B-{NAME}` | `review-required` |

`{NAME}` is `slug()` of the medication name: uppercase, diacritics removed. The first pair has no extra suffix. The second pair adds `-2`, the third adds `-3`, and so on. A blank instruction and an omitted instruction are both absent. A missing line is not evidence that a medication was stopped. Strength excerpts are `{name} {strength}`. Dosage and instruction excerpts are `{name}: {value}`.

Follow-up (`FIND-FOLLOW-UP-DATE`, `completeness`, `review-required`) runs when a `follow-up` section recommends follow-up (`Verlaufskontrolle empfohlen`, `Kontrolle empfohlen`, or `Nachsorge empfohlen`), that sentence is not negated, and the section has no concrete date. An ISO date, a numeric date, or a written German month date counts as concrete.

Treatment (`FIND-TREATMENT-GENERIC`, `documentation`, `informational`) runs when a `treatment` section contains `ärztlich festgelegte Behandlung` and does not also contain a dose, a concrete date, or Wirkstoff, Prozedur, Intervention, or Behandlungsdauer.

If both documents produce the same finding id, `dedupeFindings` keeps one finding and appends evidence that is not already cited.

## Sample pair

`sampleDischargeLetter` is `DOC-2026-001`, filename `entlassbrief-demo`. `sampleMedicationPlan` is `DOC-2026-002`, filename `medikationsplan-demo`.

Both use patient id `DEMO-4711` and date of birth `1962-03-14`. The names are Erika Beispiel and Erika Beispel. Pantoprazol is `40 mg` in the letter and `20 mg` in the plan. Ramipril matches on name, strength, and dosage. Its instructions are `Dauertherapie` and `Morgens`. The letter recommends follow-up and gives no date. Its treatment section is the generic sentence above.

With `reviewChecklist`, `compareDocuments` returns, in this order:

1. `FIND-IDENTITY-NAME`
2. `FIND-MED-PANTOPRAZOL-STRENGTH`
3. `FIND-MED-RAMIPRIL-INSTRUCTIONS`
4. `FIND-FOLLOW-UP-DATE`
5. `FIND-TREATMENT-GENERIC`

`expectedFindings` in `src/data/expectedFindings.ts` uses ids `FIND-001` through `FIND-004`, a different array order, and description text the test does not require to equal the engine. It records the name, Pantoprazol strength, follow-up, and treatment conditions. It does not list the Ramipril instruction difference. `compare-documents.test.ts` matches those four by title, category, severity, status, rationale, and evidence, and it asserts the Ramipril finding separately. The fixtures are not edited to hide that difference.
