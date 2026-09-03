# Verification: internal-package-dead-code

> **Status:** Active — local package slices verified; TTL and shipping incomplete.

Verified 2026-09-03 in `codex/myk9-328-completion`, baseline `d5a495862`.
The missing `/private/tmp` worktree's recorded patches were recovered into the
durable project worktree. All evidence below comes from this recovered worktree.

## Summary

| Dimension | Result |
| --- | --- |
| Completeness | 7/11 tasks; TTL safety/removal and final shipping gates remain |
| Correctness | 167 removed declarations inventoried; 2,026 retained tests pass |
| Coherence | Internal-only deletion, live consumers protected, email types-only, TTL untouched |
| Plan coverage | 100/100 after expanding the email decision and recovery/verification record |

## Current passing checks

- Affected builds: scoring, scoring-ui, UI, core, ringside, notifications,
  email, secretary. All eight pass.
- Package tests: scoring 66, scoring-ui 198, UI 249, core 253, ringside 371,
  notifications 54, secretary 140 — **1,331** total.
- Email is types-only with no runtime package tests; build/typecheck pass.
- `pnpm exec vitest run supabase/functions/send-confirmation-email`:
  **174 tests / 14 files** pass, including retained production-content assertions.
- From myK9Show:
  `pnpm exec vitest run src/features/at-show src/features/heritage/email src/features/magazine/email`:
  **521 tests / 61 files** pass.
- `pnpm typecheck`: pass, including app, package, test and Edge-test types.
  Existing E2E diagnostic ratchet: 59 current / 62 baseline / 0 new.
- `pnpm lint`: pass; 18 existing warnings, zero errors.
- `pnpm qa:code-quality-ratchet`: pass; oversized files 147, any casts 23,
  TODO markers 17, direct core Supabase bypasses 3. No baseline weakening.
- `pnpm --filter @myk9/show build`: pass including PWA build.
  Existing CSS syntax warnings, dependency annotation warnings, mixed-import
  and large-chunk notices remain; no visual QA is claimed.
- `git diff --check` and OpenSpec validation pass. Changed files formatted;
  comment-only files preserve original formatting to avoid unrelated churn.

## Verification limitations and corrected attempts

- An initial build overlapped dependency reinstallation and could not find tsup.
  Installation was completed, then all eight builds passed. This was local
  dependency setup, not a Supabase or Docker issue.
- A first email-test command named a nonexistent root Vitest config. Running the
  suite without that config passed all 174 tests.
- No Supabase database, function deployment, credentials, or stored user data changed.
- No app source was changed; mounted at-show and email-prop tests exercise the
  retained package consumers. Full app suite/browser QA and independent review
  are not claimed.
- Prior temporary-worktree totals are historical, not reused as current evidence.

## Critical remaining gates

1. Task 2.5: user confirmation of the proposed public replica read/subscription
   test boundary is pending under the TDD skill. After approval, preserve aged
   online/offline rows, subscriptions, dirty edits, authoritative deletion and
   read-error semantics; remove inert TTL methods/constants/providers/filters.
   Never activate TTL or clear IndexedDB.
2. Task 3.1: repeat affected verification after TTL changes.
3. Task 3.3: obtain explicit publication/merge approval, independent review,
   required CI and confirmed merge.
4. Task 3.4: only then post final evidence to Linear, mark MYK9-328 Done,
   archive/sync and clean this worktree.

## Rollback and preservation

Deleted code remains recoverable from Git. Email production builders changed
ownership comments only; their HTML statements are unchanged. Live Tabs,
device detection, UKC timer, grouping, podium/results, gate order, scoring
store and formatter registration/listing remain.

Local checkpoint is not a completed issue. Linear must remain In Progress.
