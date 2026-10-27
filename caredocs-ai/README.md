# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Domain model

Types live in `src/types/`. Synthetic fixtures live in `src/data/` and are checked against those types. Nothing here is real patient data, and none of it is a clinical decision.

| Type | Role |
| --- | --- |
| `HealthcareDocument` | A discharge letter or medication plan: identity, sections, medication lines, and a synthetic-data notice. |
| `PatientIdentity` | Patient id, name, and date of birth. These are the fields a later comparison can line up. |
| `DocumentSection` | A stable block of document text. Findings cite `id`. |
| `MedicationEntry` | One medication line. |
| `ReviewChecklistItem` | An illustrative check a reviewer can run. `enabled` marks whether it is active. |
| `ReviewFinding` | A discrepancy or a documentation prompt, kept separate from the source documents. |
| `FindingEvidence` | The document, section, and excerpt a finding relies on. |
| `ReviewState` | Which documents are in the review, the review's own status, and its findings. |

A finding does not copy the source text into a second document. `FindingEvidence.documentId` selects a `HealthcareDocument`, `sectionId` selects a `DocumentSection.id` on that document, and `excerpt` is the passage or structured value the finding is about. The comparison does not decide which value is correct.

## Comparison engine

`compareDocuments` in `src/features/document-review/comparison/` compares two synthetic documents against the review checklist. It is deterministic and does not call a model. Each checklist item gates its rule. Findings are returned with status `open`. The engine does not change review status and does not modify the source documents.

The review panel lists those findings. Each excerpt selects the document and section it came from. Setting the review to completed does not change finding status.

Patient id, name, and date of birth are compared separately. Medication strength, dosage, and administration instructions are compared separately. A medication name matches only after whitespace and case normalization. Brand and generic names are not treated as the same drug. A medication listed in only one document is a review prompt, not evidence that it was stopped.

The follow-up and treatment checks run only when those checklist items are enabled. They report missing documentation for a person to review. They do not confirm a clinical error.

Medication `strength` and `dosage` are different properties. `40 mg` is the preparation; `1 Tablette morgens` is how it is taken. A strength mismatch, such as Pantoprazol 40 mg versus 20 mg, must not be stored as a dosage change.

`ReviewStatus` (`not-started`, `in-progress`, `completed`) describes the review. `FindingStatus` (`open`, `reviewed`, `resolved`, `follow-up-required`) describes one finding. Completing a review does not resolve its findings. A completed review may still contain follow-up.

The fixtures are the acceptance data for that comparison:

- Both documents use patient id `DEMO-4711` and date of birth `1962-03-14`.
- The names differ on purpose: Erika Beispiel and Erika Beispel.
- Pantoprazol strength differs on purpose: `40 mg` and `20 mg`. Ramipril name, strength, and dosage match.
- The discharge letter recommends follow-up and gives no follow-up date.
- The treatment section is a general description, not a detailed treatment record.

`expectedFindings` states those conditions. Completeness and documentation findings are review prompts, not confirmed clinical errors. The source documents are not edited so that the findings disappear.
