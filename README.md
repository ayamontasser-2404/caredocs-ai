# CareDocs AI

### Evidence-based healthcare document comparison with human verification.

CareDocs AI is a React and TypeScript application that helps reviewers compare discharge letters and medication plans, identify potential discrepancies, and inspect supporting source evidence.

It combines browser-based PDF processing, OCR, structured field extraction, validation, human verification, and deterministic comparison in one workflow.

**Project status:** Portfolio prototype

> CareDocs AI supports human review. It does not diagnose, prescribe, recommend medication changes, or determine which conflicting value is correct. All demonstration data is fictional.

## What it does

- **PDF extraction:** Extract embedded text using PDF.js.
- **OCR:** Recognize scanned PDF pages in the browser using Tesseract.js.
- **Structured extraction:** Identify supported patient, medication, and follow-up fields.
- **Validation:** Check extracted values against structural rules.
- **Human verification:** Allow reviewers to correct and confirm fields while preserving original extracted values.
- **Document comparison:** Detect potential mismatches and missing information using deterministic rules.
- **Evidence-based findings:** Show relevant values, document references, page numbers, and supporting text.
- **Review workflow:** Filter findings and manage their review status.

## How it works

```text
Upload Documents
       ↓
PDF Text Extraction / OCR
       ↓
Structured Field Extraction
       ↓
Validation
       ↓
Human Verification
       ↓
Document Comparison
       ↓
Evidence-based Findings
```

## Technology

| Category | Stack |
|---|---|
| Frontend | React 19, TypeScript |
| Build | Vite |
| PDF processing | PDF.js |
| OCR | Tesseract.js |
| Testing | Vitest, React Testing Library |
| Linting | Oxlint |
| Icons | Lucide React |

## Screenshots

<!-- Add actual screenshots to caredocs-ai/docs/screenshots/ and update these paths. -->

### Home

<!-- ![CareDocs AI Home](caredocs-ai/docs/screenshots/home.png) -->

### Document extraction and verification

<!-- ![Document verification](caredocs-ai/docs/screenshots/verification.png) -->

### Review Findings

<!-- ![Review findings](caredocs-ai/docs/screenshots/review-findings.png) -->

## Run locally

Requirements: Node.js and npm.

```bash
git clone https://github.com/ayamontasser-2404/caredocs-ai.git

cd caredocs-ai/caredocs-ai

npm install
npm run dev
```

### Quality checks

```bash
npm test
npm run lint
npm run build
```

## Engineering highlights

- Separation of extraction, validation, verification, and comparison.
- Strongly typed document and review models.
- Deterministic comparison rules.
- Evidence traceability from findings to source documents.
- Explicit handling of blocked, failed, and successful comparison states.
- Asynchronous processing and stale-result protection.
- Privacy-conscious browser-based document processing.

## Architecture and documentation

- [Application documentation](caredocs-ai/README.md)
- [Architecture and data flow](caredocs-ai/ARCHITECTURE.md)
- [Development instructions](caredocs-ai/AGENTS.md)

## Limitations

- Extraction is based on supported document labels, not general-purpose clinical language understanding.
- No LLM is currently used.
- Only the discharge letter and medication plan workflow is supported.
- Word documents are not processed.
- Review sessions are held in memory and are lost on refresh.
- No backend, authentication, database, or persistent audit trail is implemented.
- Comparison rules have not been clinically validated.

This is not a GDPR or HIPAA compliance certification and is not intended for real patient-care decisions.

## Author

**Aya Montasser**

Frontend Engineering · React · TypeScript · Product Engineering

- [GitHub](https://github.com/ayamontasser-2404)
- [LinkedIn](https://www.linkedin.com/in/aya-marzouk-72634237/)

---

Built as an independent engineering portfolio project exploring document processing, evidence-based workflows, and human-centered healthcare software.
