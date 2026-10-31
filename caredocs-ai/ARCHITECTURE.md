# CareDocs AI — Architecture

> **Status:** Living architecture document  
> **Last reviewed:** 2026-10-29  
> **Scope:** Current frontend prototype represented by the repository snapshot. Update this document when implementation changes.

## 1. Purpose and product boundary

CareDocs AI is a healthcare-document review prototype. It compares two structured documents—currently represented by a discharge letter and a medication plan—to surface potential discrepancies and missing information for a human reviewer.

The application assists document review. It does **not** diagnose, prescribe, decide which conflicting value is correct, or replace clinical judgment.

### Current capabilities

- React + TypeScript frontend built with Vite.
- Home and New Review pages inside a shared application shell.
- Synthetic TypeScript document fixtures and a review checklist.
- Deterministic comparison of patient identity, medication fields, and configured documentation checks.
- Structured findings with source evidence.
- Review-session and finding-status logic.
- JSON upload parsing and validation for the existing structured document model.

### Not implemented in the reviewed snapshot

- Mapping extracted PDF fields into a `HealthcareDocument` after human verification.
- OCR of image files that are not PDF pages.
- Reliable extraction of unstructured clinical text into the domain model.
- Backend API, database, authentication, or durable multi-user persistence unless separately added after this snapshot.
- Clinical validation of the checklist rules.

Do not describe a planned capability as implemented.

## 2. Technology and runtime

This file lives in the Vite app directory. The git repository root is the parent directory. `package.json` is here. Run npm from this directory.

- **UI:** React 19. Icons come from `lucide-react`.
- **Language:** TypeScript
- **Build/dev server:** Vite. `npm run dev` starts the dev server. `npm run build` runs `tsc -b` and the production build. `npm run preview` serves that build.
- **Tests:** Vitest (`npm test` is `vitest run`) with `happy-dom`, React Testing Library, and user-event. The test environment is set in `vite.config.ts`.
- **Lint:** `npm run lint` runs Oxlint with `.oxlintrc.json`.
- **Styling:** `src/styles/design-tokens.css`, `src/styles/global.css`, `src/components/layout/layout.css`, and `src/components/pages/pages.css`.
- **Navigation:** In-memory page state. There is no router and no URL for Home or New Review. Do not add one unless the task asks for it.

`src/app/App.tsx` only renders `AppShell`. Page selection is not in `App.tsx`.

Avoid adding dependencies unless they provide clear value.

## 3. High-level structure

```text
src/
├── app/
│   ├── App.tsx
│   └── workspace.test.tsx
├── components/
│   ├── layout/
│   │   ├── AppHeader.tsx
│   │   ├── AppShell.tsx
│   │   ├── DocumentSurface.tsx
│   │   ├── DocumentUploads.tsx
│   │   ├── ReviewPanel.tsx
│   │   ├── SideNav.tsx
│   │   ├── layout.css
│   │   ├── section-target.ts
│   │   └── workspace.ts
│   └── pages/
│       ├── HomePage.tsx
│       ├── NewReviewPage.tsx
│       └── pages.css
├── data/
│   ├── expectedFindings.ts
│   ├── reviewChecklist.ts
│   ├── sampleDischargeLetter.ts
│   └── sampleMedicationPlan.ts
├── features/document-review/
│   ├── comparison/
│   │   ├── assertions.ts
│   │   ├── compare-documents.ts
│   │   ├── compare-documents.test.ts
│   │   ├── compare-medications.ts
│   │   ├── compare-patient-identity.ts
│   │   ├── detect-missing-information.ts
│   │   └── normalize.ts
│   ├── review-session.ts
│   ├── review-session.test.ts
│   ├── template-validation.ts
│   └── template-validation.test.ts
├── styles/
│   ├── design-tokens.css
│   └── global.css
├── types/
│   ├── document.ts
│   └── review.ts
└── main.tsx
```

This tree describes the reviewed snapshot. Verify actual paths before editing because the codebase may evolve.

## 4. Responsibilities and boundaries

### `app/`

- `App.tsx` renders `AppShell` and holds no page or review state.
- `workspace.test.tsx` covers Home, New Review, upload rejection, comparison, empty and no-findings states, and finding-status updates.
- Keep comparison rules out of React components.

### `components/layout/`

`AppShell` owns the React state. `workspace.ts` is the pure transition module for that state.

`WorkspaceState` holds:

- `page`: `home` or `new-review`. The initial page is `home`.
- `letter` and `plan`: each slot is a parsed document or null, a filename, and validation errors. Both start empty.
- `phase`: `idle`, `comparing`, `ready`, or `error`.
- `review`: the `ReviewState` from the last successful comparison, or null.
- `compareError` and `activeEvidence`.

`showPage` changes the page and keeps the current review. `acceptDocument` and `removeDocument` clear the review. `rejectUpload` writes errors onto the slot and leaves the accepted document and the current review in place. `canCompare` is true only when both slots have a document and the phase is not `comparing`. `beginCompare` clears the previous review and sets `comparing`. `finishCompare` stores the new review. `failCompare` stores the error message and no findings.

`section-target.ts` builds the DOM id for an evidence citation. `DocumentSurface` uses it to highlight the cited section. The sample discharge letter has no `patient` section. Identity evidence still uses section id `patient`, and the surface renders a patient-identity block for that id.

`DocumentUploads`, `ReviewPanel`, `SideNav`, `AppHeader`, and `DocumentSurface` render state and emit actions. They do not compare documents or invent findings.

### `components/pages/`

- **Home:** introduces CareDocs AI, explains supported review scenarios, and links to starting a review.
- **New Review:** selects/loads supported documents, invokes the review workflow, and presents findings below the upload area. When a comparison finishes, is blocked, or fails, that section is scrolled into view. The findings still come from the review stored by `finishCompare`.

Preserve the requested two-item primary sidebar: **Home** and **New Review**, unless product requirements explicitly change.

### `data/`

Synthetic fixtures and checklist configuration for the prototype. These are development/test inputs, not real patient records or validated medical guidance.

`expectedFindings.ts` is an acceptance reference, not a dump of engine output. Its ids are `FIND-001` through `FIND-004`. The engine ids for the sample pair are `FIND-IDENTITY-NAME`, `FIND-MED-PANTOPRAZOL-STRENGTH`, `FIND-MED-RAMIPRIL-INSTRUCTIONS`, `FIND-FOLLOW-UP-DATE`, and `FIND-TREATMENT-GENERIC`. The fixture omits the Ramipril instruction finding and uses different description wording and array order. `compare-documents.test.ts` matches the four fixture findings by title, category, severity, status, rationale, and evidence, and asserts the Ramipril finding separately. Do not add Ramipril to `expectedFindings` and do not remove that engine finding to force the files to match.

### `features/document-review/comparison/`

The deterministic domain comparison layer.

- `compare-documents.ts`: orchestration and aggregation of comparison rules.
- `compare-patient-identity.ts`: compares identity fields available in the source documents.
- `compare-medications.ts`: compares medication entries and fields independently.
- `detect-missing-information.ts`: applies configured documentation checks.
- `normalize.ts`: comparison-only text normalization. Findings keep the original source strings.
- `assertions.ts`: throws `ComparisonInputError` when a required comparison field is missing. The message names the field, not the patient or medication value. These are not test assertions.

`compareDocuments` runs a rule only when that checklist item is `enabled`. It dedupes findings by id and appends evidence that is not already cited. It does not modify its inputs, does not set review status, and does not import React.

Normalization for matching is NFKC, trim, collapsed whitespace, and `de-DE` lowercase. Medication names also drop trailing `. , ; :`. Dates are not parsed, so `1962-03-14` and `14.03.1962` stay different. A blank instruction and an omitted instruction are both absent.

### `features/document-review/review-session.ts`

Pure session functions. `createReviewSession` requires exactly two documents, calls `compareDocuments`, and returns status `not-started` with every finding `open`. `setReviewStatus` replaces the review status and keeps the same findings array. `setFindingStatus` changes one finding and leaves the review status unchanged. UI phase (`idle`, `comparing`, `ready`, `error`) is not stored here. It lives in `workspace.ts`.

### `features/document-review/template-validation.ts`

`parseDocumentUpload` JSON-parses a file and `validateDocumentTemplate` checks it against the slot template. The accepted result is a `HealthcareDocument`. The original `File` and the raw JSON text are not retained.

### `features/document-review/extraction/`

`extractPdfText` reads embedded PDF.js text, one page at a time, after checking the `%PDF-` signature. The file name and MIME type are not enough. `extractPdfContent` calls that first. A page whose text trims to empty is rendered with PDF.js and recognized by one Tesseract.js worker (`deu`). Pages that already have text are not rendered. The result records `embedded`, `ocr`, or `mixed`, plus page method and recognizer confidence when Tesseract returns it. A render or OCR failure throws `PdfTextExtractionError`, names the page when recognition fails, and is not stored as an empty or partial success. Limits are 20 MiB, 50 pages, and 20 scanned pages. A read that runs longer than 3 minutes is cancelled. Replacing, removing, or leaving the page aborts the in-progress read so an older result cannot overwrite a newer file. A JSON upload above 1 MiB is rejected before it is parsed, and a JSON read that finishes after a newer file is ignored. The worker and the PDF document are closed when the read finishes or fails. The page image is not sent to an OCR API. Tesseract.js may download German language data and its WASM core on first use. That download does not include the page image. There is no application backend, account, or authorization layer.

`extractDocumentData` reads that page text with labeled rules. It does not call a model. Field names follow `PatientIdentity` and `MedicationEntry`, but a missing field stays missing, so the result is not a `HealthcareDocument`. Each found value keeps its source span, page number, and text source. A normalized date is stored only when the source date has one valid reading. Dotted numeric dates are German day-month-year. A slash or hyphen date with both numbers at most 12 is left unparsed. Two different strengths for the same medication name stay ambiguous and neither is selected. Strength is not copied into dosage. The result is not passed to `compareDocuments` until `prepareComparisonInput` accepts it.

### `features/document-review/verification/`

`createDocumentVerification` copies extracted fields into reviewed fields. Editing changes `reviewedValue` only. The extracted field, its source text, and its page numbers stay as they were. `confirmReviewedField` confirms one field when that field has no structural problem and a non-empty reviewed value. Confirming one field does not confirm the others. Editing a confirmed field returns it to unverified.

Structural checks cover a required empty value, a name that is not one to six letter-words, a date `interpretDate` cannot read, a strength that is not a number plus a supported unit, an unsupported document type, and a page number outside the PDF. Uncertainty covers an ambiguous field, an unparsed field, missing source text, and OCR text. OCR confidence is copied only when the page has a finite score. These categories are not combined into one success flag, and a valid structure is not a clinical confirmation.

`eligibleForComparison` is true only when every required field has source text, no structural problem, and status `confirmed`. Required fields are patient name, date of birth, and each extracted medication's name and strength. Patient id, dosage, instructions, route, frequency, other dates, follow-up, treatment, and document metadata are optional. A present optional field with a structural problem blocks readiness. An absent optional field does not. There is no reviewer identity, timestamp, audit log, or persistence. Confirmation is not an electronic signature and is not a regulatory-compliance claim.

### `features/document-review/comparison/prepare-comparison-input.ts`

`prepareComparisonInput` is the only path from a PDF review into `compareDocuments`. A slot that already holds a JSON `HealthcareDocument` is passed through. A PDF slot is accepted when Phase 4 reports `eligibleForComparison` and every extracted field that is present has been confirmed. The adapter copies confirmed reviewed values into a `HealthcareDocument`. Source page text stays in the `patient`, `medication`, `follow-up`, and `treatment` sections. The original extraction is not overwritten. A missing patient id or dosage stays empty. The comparison engine skips those blank optional fields instead of reporting a discrepancy or inventing a value. Name, date of birth, and strength are still required. An ineligible pair returns reason codes and does not call `compareDocuments`. Editing or confirming a field clears the previous findings.

### `types/`

- `document.ts`: canonical document and section domain types.
- `review.ts`: review, finding, evidence, checklist, and status types.

These are the source of truth for domain shapes. Extend existing types before introducing parallel representations.

## 5. Main data flow

### Existing structured-document workflow

```text
Home (initial page)
  └─ Start New Review, or the New Review sidebar item
       └─ New Review
            ├─ Use sample discharge letter / medication plan
            │    └─ acceptDocument stores the fixture and clears the previous review
            ├─ Upload a file
            │    ├─ Word: rejectUpload, no parse, previous document kept
            │    ├─ PDF: extractPdfContent, then extractDocumentData, document stays null
            │    │    ├─ createDocumentVerification keeps the extraction and adds review state
            │    │    ├─ prepareComparisonInput accepts confirmed fields or returns block reasons
            │    │    └─ failure, no readable text, or ambiguous fields do not create findings
            │    ├─ JSON parse + validateDocumentTemplate
            │    ├─ invalid: rejectUpload, previous document and review kept
            │    └─ valid: acceptDocument, previous review cleared
            ├─ Remove: removeDocument clears that slot and the review
            └─ Compare Documents, only when canCompare is true
                 ├─ ineligible: block reasons, no findings
                 └─ eligible: beginCompare, then createReviewSession
                      └─ compareDocuments(letter, plan, reviewChecklist)
                           ├─ enabled patient-identity rule
                           ├─ enabled medication rule
                           ├─ enabled follow-up and treatment rules
                           └─ dedupe findings by id
                 └─ finishCompare renders counts, finding cards, and source documents
```

A comparison that throws `ComparisonInputError` calls `failCompare`. The findings area shows that message. It does not show the pre-comparison empty state or the zero-findings message.

### PDF text through comparison

```text
PDF upload
  └─ File/type/size/page validation
       └─ Embedded PDF.js text
            ├─ page has usable text: keep it, do not run OCR
            └─ page has no usable text: render the page, recognize it with Tesseract.js
                 └─ Page text, method, and confidence shown on the upload card
                      └─ extractDocumentData reads labeled fields and page evidence
                           └─ createDocumentVerification
                                ├─ structural checks, uncertainty, and per-field confirmation stay separate
                                ├─ eligibleForComparison covers required fields
                                └─ prepareComparisonInput
                                     ├─ eligible: compareDocuments
                                     └─ ineligible: block reasons, no findings
```

A reviewer can correct and confirm fields in the current browser session. That confirmation is not an electronic signature, and it is dropped on refresh. Recognizer confidence is not a clinical check. Browser processing is not a regulatory-compliance claim. A detected difference is not a confirmed clinical error.

## 6. Domain and comparison principles

1. **Deterministic core:** the same valid inputs and checklist should produce the same findings.
2. **No input mutation:** comparison must not modify source documents.
3. **Field-level comparison:** medication name, strength, dosage, and administration instructions remain independently reviewable.
4. **Conservative matching:** do not silently equate brand/generic names or infer equivalence without an explicit validated mapping.
5. **Missing is not false:** an absent value is not automatically equal to a present value, and absence in one document does not prove discontinuation.
6. **Evidence provenance:** each finding retains the source document, section, and excerpt from `compareDocuments`. Page numbers and source quotes are read from the matched reviewed PDF field when one exists. They are not invented for JSON or for a field that has no usable page.
7. **Human review:** findings identify potential discrepancies; they do not select the authoritative value or make treatment recommendations.
8. **Checklist-driven checks:** only run checks configured/enabled by the existing checklist.
9. **No fabricated evidence:** never invent excerpts, page numbers, or source fields.
10. **Status separation:** overall review lifecycle and individual finding lifecycle are separate.

Use the exact enum values and required fields defined in `src/types/`; do not assume field names from examples.

## 7. Upload and validation boundary

`parseDocumentUpload` accepts JSON with the `HealthcareDocument` shape for the selected slot. The file `type` must match the slot. Required discharge-letter section ids are `admission-reason`, `diagnoses`, `findings`, `treatment`, `medication`, and `follow-up`. Required medication-plan section ids are `patient` and `medication`. A section is present when its id matches, it appears once, and its title and content are non-blank after trim. The uploaded title does not have to equal the German template label. `synthetic` must be `true`, and `demoNotice` must be non-blank. At least one medication line needs a name, strength, and dosage.

`AppShell` reads a PDF with `extractPdfContent` and rejects `.doc` and `.docx` before parsing. The UI says Word files are not processed. A PDF result does not enable Compare Documents.

For unsupported formats or malformed data:

- show the validation messages on that slot;
- do not replace the accepted document;
- do not load a sample fixture as a fallback;
- do not pass the rejected file to `compareDocuments`.

The current app stores the parsed document and a filename string. It does not keep the original `File` or the raw JSON. A sample is stored only when the reviewer uses the sample button, and its filename is shown with ` (sample)`.

PDF limits are 20 MiB and 50 pages. Encrypted, empty, and malformed PDFs fail with a controlled message. A PDF with no readable text is a successful read, not a failure. Do not send page images to an external OCR API. Tesseract.js language data and WASM are a separate download from the document contents.

## 8. State and persistence

`AppShell` holds one `useState<WorkspaceState>`. Transitions go through `workspace.ts`. There is no `localStorage`, session storage, API, or database. Refreshing the page constructs `initialWorkspace()` again: Home, empty slots, and no findings.

Compare replaces the previous `ReviewState`. It does not append findings onto an older review. Accepting or removing a document clears that review before the next comparison. A rejected upload does not.

When changing session state:
- ensure displayed findings belong to the active review;
- avoid duplicate findings when a comparison is rerun;
- update a finding's status consistently wherever it appears;
- do not mark every finding resolved when a review is completed;
- do not claim data survives refresh or is shared across users unless persistence is implemented and tested.

Before adding persistence, define ownership, retention, deletion, and privacy requirements for healthcare data.

## 9. Error handling and privacy

- Do not log document text, patient names, IDs, dates of birth, or medication details.
- Prefer synthetic fixtures for development and automated tests.
- Make parsing and validation failures visible to the user.
- Avoid silent defaults for required clinical fields.
- Do not claim regulatory compliance or clinical validation without evidence.
- Treat all findings as prompts for qualified human verification.

## 10. Testing strategy

Use the project's existing test runner and patterns.

Test at multiple levels:

- **Unit:** normalization, identity checks, medication field checks, checklist rules, evidence construction, stable IDs, duplicate handling, and input immutability.
- **Validation:** valid/invalid structured uploads, missing fields, malformed JSON, unsupported format.
- **Session:** review creation, comparison invocation, status transitions, and stale-finding prevention.
- **UI integration:** Home/New Review navigation, upload validation, compare action, findings below upload controls, empty/no-findings/error states, and finding-status updates.

Use the existing synthetic fixtures. Add isolated cases for specific rules. Do not write tests that only assert a function does not throw.

## 11. Quality gates

Before considering a change complete, run the scripts actually available in `package.json`, typically:

```bash
npm test
npm run lint
npm run build
```

`npm run build` is the typecheck. Report commands and actual results accurately; do not claim success if a command was not run. Run them from this app directory.

## 12. Change policy

- Inspect existing code and tests before editing.
- Make the smallest coherent change.
- Reuse canonical types and existing components.
- Keep UI, domain logic, parsing, and session orchestration separated.
- Do not rewrite working logic just to match a preferred folder layout.
- Update this document when architecture or supported capabilities materially change.
