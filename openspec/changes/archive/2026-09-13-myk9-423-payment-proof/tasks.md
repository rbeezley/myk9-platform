# MYK9-423 proof tasks

> **Status:** Delivery complete; ready for archive

## 1. Regression

- [x] 1.1 Add the real fee-card → router → cart-store/recovery → rendered-items/total integration test; run it green.
- [x] 1.2 Remove hydration temporarily, record the same test failing its item/total contract, restore and rerun green.

## 2. Hosted evidence

- [x] 2.1 Read both hosted money surfaces after the single approved test checkout; capture explicit paid-in-full and zero-due evidence and close the owned browser.
- [x] 2.2 Reconcile the original payment comment and new regression/browser proof against all MYK9-423 criteria in verification-report.md.

## 3. Validation and delivery

- [x] 3.1 Run focused payment tests, test TypeScript, lint/format checks and the required shuffled app suite; record actual outcomes and any blockers. Focused tests passed 9/9, the prior full shuffled run passed 20,039 tests, and current-head CI passed all six shuffled app shards, coverage, quality and build checks.
- [x] 3.2 Validate OpenSpec, review the diff and attach the proof to Linear (comment 7f93bf8e-dd6c-4255-93c0-364486fce5bb).
- [x] 3.3 Ship a PR when authorized; require independent review, CI and merge before archive. PR #2179 passed two adversarial Codex fallback reviews and every required check, merged as `0a802a7a`, and its production Vercel build succeeded.
