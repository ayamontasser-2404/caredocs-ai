# AGENTS.md — CareDocs AI Development Instructions

These instructions apply to this Vite app. This file sits next to `package.json`. The git repository root is the parent directory. Run npm from this directory. A `package.json` in the git root is not this app.

## 1. Start by understanding the repository

Before implementing a task:

1. Read `ARCHITECTURE.md` for module boundaries and data flow. Read `README.md` for setup and current behavior. Read `spec.md` for acceptance rules.
2. Inspect `package.json` before assuming a script or dependency exists.
3. Inspect the relevant source files, domain types, fixtures, and tests.
4. Identify whether the requested capability already exists.
5. Summarize a short plan for multi-file or architectural changes, then implement it.

Do not assume documentation is more current than code. If they conflict, inspect the implementation, explain the conflict, and update the relevant documentation as part of the change when appropriate.

## 2. Product context

CareDocs AI is a human-reviewed healthcare document comparison prototype. The current workflow uses a discharge letter and a medication plan, compares structured document data, and displays evidence-backed findings.

The primary sidebar has two items:
- Home
- New Review

The Home page introduces the product and starts a review. The New Review page contains the document upload area at the top and the findings section below it.

`src/app/App.tsx` only renders `AppShell`. Page, upload slots, and comparison phase live in `AppShell` and `src/components/layout/workspace.ts`. The initial page is Home and both slots start empty. There is no router. Refreshing the page drops the session.

**Compare Documents** calls `createReviewSession`, which calls `compareDocuments`. Do not call the engine from a React component.

Preserve this experience unless the task explicitly changes it. See `ARCHITECTURE.md` for the state transitions.

## 3. Important capability boundary

Structured JSON upload and template validation exist. PDF.js reads embedded text from an uploaded PDF. Pages with no usable embedded text are rendered and recognized in the browser with Tesseract.js (`deu`, German). That text is shown on the upload card. It is not a `HealthcareDocument` and it is not passed to `compareDocuments`. Word files are still rejected. The original `File` and raw JSON are not stored. A PDF result is kept only in the session's extraction state.

Never:
- claim a Word file has been read;
- claim OCR text is confirmed clinical information, a finding, or a structured document;
- load a sample fixture when upload or parsing fails;
- fabricate extracted fields, excerpts, page numbers, confidence, or evidence;
- describe structured extraction from OCR text as complete. That step is not implemented.

## 4. Architecture and code conventions

- Use the existing React + TypeScript + Vite stack.
- Follow the project's existing naming, file organization, CSS, and component patterns.
- Reuse types from `src/types/document.ts` and `src/types/review.ts`; inspect them before changing domain shapes.
- Keep deterministic comparison rules under `src/features/document-review/comparison/`.
- Keep `template-validation.ts` separate from comparison rules.
- Keep `review-session.ts` as pure functions. Keep UI phase (`idle`, `comparing`, `ready`, `error`) in `workspace.ts`.
- Keep components focused on rendering and user interaction. They must not invent findings.
- Do not move business rules into UI components.
- Do not introduce a new router, state library, UI framework, parser, or other dependency without checking existing capabilities and explaining why it is needed.
- Avoid duplicate domain models and unnecessary abstractions.
- Do not use `any` to bypass type errors. Prefer explicit types, unions, and runtime validation.
- Avoid unrelated refactors and broad formatting churn.

## 5. Healthcare safety and evidence

This application supports human review; it does not independently make clinical decisions.

- Describe discrepancies as potential issues requiring verification.
- Never choose which conflicting medication or patient value is correct.
- Never recommend starting, stopping, or changing treatment based solely on a comparison finding.
- Missing data is not proof of a clinical event (for example, an absent medication entry does not prove discontinuation).
- Compare medication name, strength, dosage, and administration instructions independently.
- Do not equate brand/generic names or units without explicit, validated rules.
- Only run enabled checklist rules.
- Keep evidence linked to the source document and section.
- Do not invent evidence when source provenance is unavailable.
- Do not silently normalize away meaningful clinical differences.
- Keep overall review status separate from individual finding status.
- Completing a review must not automatically resolve findings.
- Do not log real patient data or sensitive document contents.
- Use synthetic data in tests and examples; do not claim regulatory compliance or clinical validation without evidence.

## 6. Domain model and state

Before changing document, finding, checklist, or session structures:

1. Inspect the canonical types and all relevant consumers.
2. Update the canonical type rather than introducing a competing shape.
3. Update fixtures, comparison logic, validation, UI, and tests consistently.
4. Preserve backward compatibility where practical or explain a breaking change.

Comparison functions should be deterministic for identical inputs, must not mutate source documents, and should avoid duplicate findings on reruns.

Do not hardcode counts, statuses, or successful processing results when they should come from real application state.

## 7. UI and accessibility

- Keep the interface professional, clear, and consistent with existing design tokens.
- Preserve the two-item primary sidebar unless requirements change.
- Keep findings below the upload section on the New Review page.
- Keep the existing result states distinct. Before comparison, the findings area is empty. While `phase` is `comparing`, show that comparison is in progress. A comparison error is its own message. Zero findings after a successful comparison is a different message from the empty state. A successful comparison shows the counts and finding cards. Do not add a separate success banner.
- A JSON template can be compared. A PDF can be read, including OCR for pages without embedded text, but that text is not compared. Do not tell the reviewer that a Word file can be read or that a PDF can be compared.
- Ensure buttons and inputs have accessible names, keyboard interaction, visible focus, and adequate contrast.
- Do not communicate severity or status through color alone.
- Avoid horizontal overflow on mobile.

## 8. Testing requirements

The test script is `npm test` (`vitest run`). `npm run build` typechecks with `tsc -b` and builds. `npm run lint` runs Oxlint. Run these from this app directory. Report the commands and their results. If one fails because of the environment, say so. Do not imply it passed.

For behavior changes:
- add or update focused tests;
- test positive and negative cases;
- test malformed or missing inputs where applicable;
- assert meaningful output, evidence, and state transitions;
- reuse the synthetic fixtures where appropriate.

`src/data/expectedFindings.ts` is not the engine's output. Its ids are `FIND-001` through `FIND-004`. It omits `FIND-MED-RAMIPRIL-INSTRUCTIONS` on purpose, and its descriptions and array order differ from `compareDocuments`. `compare-documents.test.ts` matches the four fixture findings by title and related fields, then asserts the Ramipril finding separately. Do not add Ramipril to `expectedFindings`. Do not remove the Ramipril finding, and do not edit the sample documents, to make those files identical.

## 9. Required workflow for changes

For each task:

1. **Inspect:** read relevant code, types, fixtures, tests, and scripts.
2. **Plan:** state a concise plan for multi-file changes.
3. **Implement:** make the smallest complete change that satisfies the requirement.
4. **Test:** add/update tests and run relevant checks.
5. **Review:** inspect the diff for regressions, accidental fixture edits, sensitive logging, and unrelated changes.
6. **Report:** summarize changed files, behavior, tests run/results, limitations, and follow-up work.

Do not stop after writing a plan when the user has asked you to implement. Do not claim tests/builds were run unless they actually were.

## 10. Documentation maintenance

- `ARCHITECTURE.md` describes the implemented system and explicitly labels planned capabilities.
- `README.md` describes setup and the behavior implemented in this app.
- `spec.md` describes product requirements and acceptance criteria, including the intentional `expectedFindings` gap.
- `AGENTS.md` describes instructions for coding agents.

When a change materially alters data flow, module responsibilities, supported formats, dependencies, persistence, or testing, update the relevant documentation. Avoid duplicating the full architecture in `AGENTS.md`; link to `ARCHITECTURE.md` for detail.

## 11. Completion response

At the end of a task, report:
- what changed;
- files created/modified;
- tests, type checks, lint, and build commands actually run;
- pass/fail outcomes;
- known limitations and next step.

Be concise but specific. Never state that the application supports PDF extraction, OCR, persistence, or clinical validation unless the current code and tests demonstrate it.
