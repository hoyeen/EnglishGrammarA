# MVP Input and Submission Fixes

> Execution: use test-driven implementation and independent review in this session.

**Goal:** Fix duplicate submissions, silent paste truncation, and unreliable local sentence detection using the user-approved behavior.

**Architecture:** Keep the existing successful HTTP response. Protect all submission paths with one synchronous request lock and retain overlong input for correction. Perform deterministic validation locally and on the server; the same model call returns a structured semantic input status before any analysis is displayed.

**Tech stack:** Existing Next.js 16.3.5, React, Zod, OpenAI SDK, Vitest, and Playwright. No new dependencies.

## 1. Frontend submission and length handling

Files: `src/components/SentenceAnalyzer.tsx`, `tests/components/SentenceAnalyzer.test.tsx`, `e2e/analyze.spec.ts`; styles only if required.

- [x] Add failing tests for repeated keyboard/form submissions, input locking and recovery, and complete 499/500/501-character paste behavior.
- [x] Use a synchronous request lock and request generation checks; disable editing during requests and restore it after success/failure.
- [x] Remove native truncation, retain pasted text, show the excess count, and block every submit path while over 500 characters.
- [x] Run the component and browser regressions.

## 2. Basic validation and semantic model response

Files: `src/domain/input.ts`, `src/domain/analysis.ts`, `src/server/analyzeSentence.ts`, `src/server/prompt.ts`, `src/app/api/analyze/route.ts`, and their tests.

- [x] First test raw length boundaries and accepted abbreviations/ambiguous punctuation. Remove local multi-sentence regex; keep empty/length/no-English-letter checks.
- [x] Add the model response contract `{ status, parts, translation }`. Status is `valid`, `not_english`, or `multiple_sentences`. Invalid statuses require empty parts and translation; valid status requires the existing analysis schema and exact original alignment.
- [x] Test semantic rejection without retry, malformed responses with bounded retry, and API mapping to 400 with server-owned messages.
- [x] Update the prompt to judge English sentence meaning, initials, abbreviations, quotations and missing final punctuation in the same request; never execute input instructions.

## 3. Adapter contract and delivery verification

Files: `src/server/modelAnalyzer.ts`, `tests/server/modelAnalyzer.test.ts`, `README.md`, `docs/technical-solution.md`.

- [x] Add failing SDK contract tests; extend the JSON schema with required status while allowing empty analysis fields for rejected input.
- [x] Run the real SDK with a mocked network and verify parsing/error classification. No external services are required for automated tests.
- [x] Update documentation, run all tests, lint, type checks and production build, and review the final diff independently.
- [x] Record real-model validation and its limits below.

Delivery scope: commit only files changed for this task, preserving the user's staged `AGENT.md` and untracked `.pnpm-store/`.

## Verification commands

Use local binaries because the available pnpm 11 attempts to replace the existing pnpm 10 installation:

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build
```

Browser tests use installed Edge against the production build on `127.0.0.1:4173` through a temporary, ignored Playwright configuration, since the default Chromium binary is absent.

## Verification results (2026-09-22)

- TDD failures confirmed before implementation: duplicate submission, input locking, silent paste truncation, initials rejection, raw-length handling, semantic status handling and API error mapping, and SDK response-schema contracts.
- Vitest: 79/79 passed across 12 files. A pre-existing ESLint configuration test exceeded its 5-second timeout under concurrent tooling load; the full suite passed when rerun without lint/build competing for resources.
- Playwright: 5/5 passed against the production build, including real clipboard paste and repeated keyboard/form submission.
- ESLint, TypeScript and production build passed. Independent code review found no actionable correctness issues in the three approved fixes.
- Real DeepSeek checks: 6/6 passed through the actual analysis use case. Initials (`J. K. Rowling`, `A. A. Milne`) and an embedded quotation were accepted; two sentences with omitted final punctuation or a lowercase second sentence and mostly Chinese mixed input were rejected correctly. Observed duration was 0.60–1.13 seconds per sample.
- Sandbox networking returned `EACCES`; the live checks succeeded with approved network access. These six samples validate this regression set, not overall grammar/translation accuracy or P95 latency.
