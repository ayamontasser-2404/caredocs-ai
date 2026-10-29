# CareDocs AI specification

CareDocs AI is a synthetic document-review prototype. It compares a hospital discharge letter with a medication plan and presents discrepancies and documentation gaps for a person to review.

The application does not decide which value is clinically correct, recommend a medication change, or confirm a clinical error.

All patient and clinical content in this repository is fictional.

## Scope

In scope:

- Structured healthcare documents, a review checklist, and review findings.
- Upload of one discharge letter and one medication plan.
- Validation that an uploaded file matches the template for its document type, including the known sections.
- A deterministic comparison of two documents that passed validation.
- A review session whose status is independent of each finding's status.
- A home page and a new-review page. Home introduces the workspace. New Review accepts the two documents, runs the comparison when the reviewer asks, and lists the findings underneath, with each excerpt traceable to its document.

Out of scope:

- PDF, Word, or free-text extraction. An uploaded file must already be the structured template.
- A language model, brand/generic drug mapping, or clinical decision support.
- Accounts, a server API, or a database. An upload lasts for the browser session only.
- Editing the source documents from the review.

## Domain model

Types live in `src/types/`. Fixtures live in `src/data/`.

### Documents

A `HealthcareDocument` has a stable id, a type of `discharge-letter` or `medication-plan`, a title, a filename, a creation date, patient identity, sections, medication lines, and synthetic-data metadata (`synthetic: true` and `demoNotice`).

`PatientIdentity` is a patient id, a name, and a date of birth (`YYYY-MM-DD` in the fixtures).

A `DocumentSection` has a stable id, a title, and content. Findings cite that id.

A `MedicationEntry` keeps these fields separate:

| Field | Meaning | Example |
| --- | --- | --- |
| `name` | Medication name | Pantoprazol |
| `strength` | Preparation strength | `40 mg` |
| `dosage` | How it is taken | `1 Tablette morgens` |
| `instructions` | Optional administration note | `Vor dem Frühstück` |

Strength and dosage are never stored as one field. A strength mismatch is not a dosage change.

### Review

`ReviewCategory` is `medication`, `patient-identity`, `completeness`, or `documentation`. Checklist items and findings share this taxonomy.

`FindingSeverity` is `high`, `review-required`, or `informational`.

`FindingStatus` is `open`, `reviewed`, `resolved`, or `follow-up-required`.

`ReviewStatus` is `not-started`, `in-progress`, or `completed`.

A `ReviewFinding` has a stable id, category, severity, status, title, description, rationale, and evidence. Evidence is a document id, a section id, and an excerpt or structured value taken from the source. The finding does not copy the document and does not say which source is correct.

`ReviewState` holds the review status, the document ids, and the findings. Finding status lives on each finding. It is not derived from the review status.

## Upload and template validation

The reviewer can upload a file into the discharge-letter slot and a file into the medication-plan slot. Each slot can also load its built-in synthetic document. Nothing is compared until the reviewer selects Compare Documents, and that action stays unavailable until both slots hold a valid document.

An accepted file is JSON with the `HealthcareDocument` shape. The selected slot decides which template applies. The file's `type` must match that slot: `discharge-letter` or `medication-plan`. A medication plan uploaded as a discharge letter is rejected, and the reverse is rejected. `.pdf`, `.doc`, and `.docx` files, including the PDF and Word MIME types, are rejected before JSON parsing. The message says PDF and Word files are not processed.

Validation is structural. It checks that the known sections are present. It does not judge whether the clinical content is adequate, and it does not create review findings. A file that fails validation is not shown as a source document and is not passed to `compareDocuments`. A failed upload does not load the sample fixture.

A section counts as present only when its id matches the template, it appears once, and its title and content are non-blank after trimming. Matching uses the section id. The uploaded title does not have to equal the template label in the tables below. Unknown extra sections do not satisfy a missing required section. The message names each missing or duplicate section id and does not quote patient or medication values.

The upload must also include a document id, title, filename, creation date, `synthetic: true`, and a non-blank `demoNotice`. The accepted result keeps the original clinical strings. The original file and the raw JSON text are not stored.

### Discharge letter

Required section ids, in template order:

| Section id | Template label, not a checked title |
| --- | --- |
| `admission-reason` | Aufnahmegrund |
| `diagnoses` | Diagnosen |
| `findings` | Befunde |
| `treatment` | Therapie und klinischer Verlauf |
| `medication` | Medikation bei Entlassung |
| `follow-up` | Empfehlungen zur Weiterbehandlung und Nachsorge |

Patient identity is required as structured fields: patient id, name, and date of birth. A `patient` section is not required on a discharge letter.

The `medication` section must be accompanied by at least one medication line. Each line needs a name, strength, and dosage. Instructions may be absent.

### Medication plan

Required section ids, in template order:

| Section id | Template label, not a checked title |
| --- | --- |
| `patient` | Patientendaten |
| `medication` | Medikamentenübersicht |

The same patient-identity fields and medication-line rules apply. The `patient` section is required for this template.

### After a valid upload

A valid file replaces only its slot. It does not start a comparison, and the previous findings are cleared so a new document is not shown with the previous review. Removing a document does the same. A rejected file leaves the accepted document and the current review in place.

Compare Documents calls `createReviewSession` for the two accepted documents. Previous finding statuses are not carried onto the new findings. The new review starts as `not-started`, and the new findings start as `open`. Before that action, the findings section is empty. A comparison that returns no findings says so, and that message is separate from the empty state. If comparison throws `ComparisonInputError`, the findings area shows that error and does not use either of those two messages. Completing the review does not resolve the findings.

## Comparison

`compareDocuments(documentA, documentB, checklist)` in `src/features/document-review/comparison/` returns findings. It does not modify its inputs, does not log patient or medication values, and returns the same findings for the same inputs.

A checklist item runs only when `enabled` is true. These are the rule ids:

| Checklist id | Rule |
| --- | --- |
| `patient-identity-consistency` | Compare patient id, name, and date of birth |
| `medication-consistency` | Compare medication lines |
| `follow-up-documentation` | Look for a recommended follow-up with no concrete date |
| `treatment-documentation` | Look for the prototype's generic treatment sentence |

Comparison text is normalized only for matching: Unicode compatibility normalization, trimmed ends, collapsed whitespace, and German case folding. Original values are what findings quote. Trailing punctuation is ignored on medication names. Different spellings, brand names, and generic names are not treated as the same drug. `1962-03-14` and `14.03.1962` are different values because date formats are not parsed into one calendar date.

### Patient identity

Each field is compared on its own. A difference is `high` severity and starts `open`.

| Finding id | When |
| --- | --- |
| `FIND-IDENTITY-ID` | Patient ids differ |
| `FIND-IDENTITY-DOB` | Dates of birth differ |
| `FIND-IDENTITY-NAME` | Names differ |

Evidence uses section id `patient` and the original field value. The sample discharge letter has no `patient` section; the citation still uses that id, and the workspace shows a patient-identity block for it. The sample medication plan does have a `patient` section.

When the id and date of birth match, the name finding says so. It does not claim they match if another identity field also differs.

### Medications

Lines are paired by normalized name, in document order. A repeated name in one document is paired in order; an extra line is reported on its own.

Matching normalized strength, dosage, and instructions produce no finding. Those three fields are never combined into one comparison.

| Condition | Finding id | Severity |
| --- | --- | --- |
| Both strengths differ | `FIND-MED-{NAME}-STRENGTH` | `high` |
| Both dosages differ | `FIND-MED-{NAME}-DOSAGE` | `high` |
| Both instructions differ | `FIND-MED-{NAME}-INSTRUCTIONS` | `high` |
| An instruction is present on only one side | `FIND-MED-{NAME}-INSTRUCTIONS` | `review-required` |
| The name exists only in the first document | `FIND-MED-ONLY-A-{NAME}` | `review-required` |
| The name exists only in the second document | `FIND-MED-ONLY-B-{NAME}` | `review-required` |

A blank instruction and an omitted instruction are both absent. A missing line is not evidence that a medication was stopped. Evidence for a missing line cites only the document that contains it. Strength excerpts use `{name} {strength}`. Dosage and instruction excerpts use `{name}: {value}`.

`{NAME}` is the uppercased medication name with diacritics removed. The first pair has no extra suffix. The second pair inserts `-2` before the field, as in `FIND-MED-PANTOPRAZOL-2-STRENGTH`. Later pairs use `-3`, `-4`, and so on. A repeated name that exists on only one side puts that same suffix at the end, as in `FIND-MED-ONLY-A-PANTOPRAZOL-2`.

### Documentation prompts

These are review prompts, not confirmed errors.

Follow-up runs when the document has a `follow-up` section, a sentence recommends follow-up (`Verlaufskontrolle empfohlen`, `Kontrolle empfohlen`, or `Nachsorge empfohlen`), that sentence is not negated, and the section contains no concrete date. An ISO date, a numeric date, or a written German month date counts as concrete. The finding id is `FIND-FOLLOW-UP-DATE`, category `completeness`, severity `review-required`. The excerpt is the recommendation sentence from the source.

Treatment runs when a `treatment` section contains the phrase `ärztlich festgelegte Behandlung` and does not also contain a dose, a concrete date, or an explicit treatment detail such as Wirkstoff, Prozedur, Intervention, or Behandlungsdauer. The finding id is `FIND-TREATMENT-GENERIC`, category `documentation`, severity `informational`. Other vague wording is left alone.

If both documents raise the same documentation finding id, the result is one finding whose evidence lists both documents.

Invalid input throws `ComparisonInputError` and names the missing field, not the patient or medication value. Required fields are document id, patient id, name, date of birth, sections, medications, and each medication's name, strength, and dosage.

## Review session

`createReviewSession` compares exactly two documents and stores the findings. The review starts as `not-started`. Every finding starts as `open`.

`setReviewStatus` changes only the review status. Completing a review does not resolve, close, or rewrite findings.

`setFindingStatus` changes one finding. It does not change the review status.

## Workspace

`App.tsx` renders `AppShell`. Page, slots, and comparison phase live in `AppShell` and `workspace.ts`. There is no router. The initial state is Home with both slots empty. Refreshing the page returns to that state.

The shell is a header and a side navigation with two pages, Home and New Review. Home introduces the workspace, the two supported document types, and the review steps. Start New Review opens the New Review page. Switching pages does not clear a review that is already on screen.

New Review shows the two upload cards first and the findings underneath. Each card accepts the JSON template for that slot, shows the selected filename, and can replace or remove that file. A rejected file explains which template check failed and is not passed to `compareDocuments`. PDF and Word files are not read.

Compare Documents runs only when both documents are valid. The findings section then shows the counts, and each finding shows its category, severity, status, description, rationale, and evidence. Evidence names the source document, the section, and the excerpt. The source documents are shown with the results, and activating an excerpt highlights that section. A medication excerpt also highlights the matching line. A sentence excerpt is marked inside the section text.

The reviewer can set the review to `not-started`, `in-progress`, or `completed`, and can set each finding to `open`, `reviewed`, `resolved`, or `follow-up-required`. A completed review can still contain open and follow-up findings.

## Synthetic scenario

The demo compares `sampleDischargeLetter` (`DOC-2026-001`) with `sampleMedicationPlan` (`DOC-2026-002`) using `reviewChecklist`, which enables all four rules.

Both documents use patient id `DEMO-4711` and date of birth `1962-03-14`. The names differ: Erika Beispiel and Erika Beispel. Pantoprazol is `40 mg` in the letter and `20 mg` in the plan. Ramipril matches on name, strength, and dosage. Its instructions differ: `Dauertherapie` and `Morgens`. The letter recommends follow-up and gives no date. Its treatment section is the generic prototype sentence.

With the checklist enabled, the session contains:

1. `FIND-IDENTITY-NAME`
2. `FIND-MED-PANTOPRAZOL-STRENGTH`
3. `FIND-MED-RAMIPRIL-INSTRUCTIONS`
4. `FIND-FOLLOW-UP-DATE`
5. `FIND-TREATMENT-GENERIC`

`expectedFindings` records the name, Pantoprazol strength, follow-up, and treatment conditions. Its ids are `FIND-001`, `FIND-002`, `FIND-003`, and `FIND-004`, in that array order: Pantoprazol strength, patient name, follow-up, then treatment. Those ids are not the engine ids. Its descriptions are not required to match the engine text. The comparison test matches each fixture finding by title, category, severity, status, rationale, and evidence. It does not compare description text.

`expectedFindings` does not list the Ramipril instruction difference. The engine reports `FIND-MED-RAMIPRIL-INSTRUCTIONS` because the source documents differ and the medication rule compares instructions separately. The fixtures are not edited to hide it, and that finding is not added to `expectedFindings`.

## Verification

Upload acceptance checks:

- A file is accepted only when its type, `synthetic: true`, `demoNotice`, and required section ids match the selected slot.
- A discharge letter missing `follow-up` or `treatment` is rejected.
- A medication plan missing `patient` is rejected.
- A section title may differ from the template label. A blank title is rejected.
- A PDF or Word file is rejected and is not compared.
- A rejected file does not replace the accepted document and does not load the sample.

Current checks, run from this directory (the directory that contains `package.json`, not the git root):

- `npm test` runs the comparison, template-validation, review-session, and workspace-page tests.
- `npm run lint` runs Oxlint.
- `npm run build` typechecks and builds the Vite app.
- `npm run dev` starts the workspace.
