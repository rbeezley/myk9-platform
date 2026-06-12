# Code Quality Wave B Email Parity

Date: 2026-06-12

## Goal

Close the Phase 2 P2 Magazine/Gazette confirmation email duplication finding without broad renderer rewrites.

Audit source:

- `docs/audits/2026-06-code-quality/03-duplication-clusters.md`
- `docs/audits/2026-06-code-quality/09-phase-2-verification.md`

## Scope

- Keep the Magazine and Gazette visual templates separate.
- Extract only Deno-safe shared helpers/data contracts beside the Supabase edge builders.
- Add tests that pin the shared production row shape and prevent preview/production contract drift.
- Update audit/todo tracking after verification.

## Findings To Preserve

- Supabase edge functions cannot import workspace packages at deploy time.
- The real production dispatcher builds `runs` with a `numeral` field.
- Package preview templates use `trialNumeral`; a narrow mapper/contract test should make that translation explicit.
- Outlook caveats still justify separate raw HTML builders and React Email preview templates.

## Tasks

1. Add `confirmation-email-shared.ts` next to the edge builders with:
   - `ConfirmationEmailRunRow` using the production `numeral` field.
   - shared base data for Magazine/Gazette edge builders.
   - escaping, multiline escaping, dog-line, run-count, on-the-day, and preview-run mapping helpers.
2. Refactor `magazine-email.ts` and `gazette-email.ts` to consume those helpers without changing visual output.
3. Add/adjust tests:
   - Shared helper tests for escaping, on-the-day detection, and run-count labels.
   - Magazine test proving production-shaped `runs[].numeral` renders the run table.
   - Gazette test proving the same production-shaped run contract remains supported.
   - Preview/production parity tests rendering the actual `@myk9/email` Magazine and Gazette templates against the production Deno builders.
4. Update code-quality audit tracking to mark this P2 slice implemented.

## Verification

- `pnpm exec vitest run supabase/functions/send-confirmation-email/confirmation-email-shared.test.ts supabase/functions/send-confirmation-email/confirmation-email-parity.test.ts supabase/functions/send-confirmation-email/magazine-email.test.ts supabase/functions/send-confirmation-email/gazette-email.test.ts`
- `pnpm --filter @myk9/email typecheck`
- `pnpm --filter @myk9/email test`
- `git diff --check`
