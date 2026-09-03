# MYK9-366 — Career show calendar dates

Request: implement fix for myk9-366

Narrow display correction; lightweight workflow because the shared formatter and existing surface already exist. No duplicate UI or new date logic.

- [x] Reproduce the previous-day value with an assertion-first component regression using calendar dates and midnight timestamp representations, including January 1 and a month boundary.
- [x] Use the established `formatEntryDate` helper for platform Career entries; preserve external-show behavior.
- [x] Run focused component/date tests in America/Chicago, UTC, and Asia/Tokyo, plus focused lint/type verification.
- [x] Replay Overview, Career, My Shows, and show detail at 1440×900, 768×1024, and 390×844; retain settled-state screenshots.
- [ ] Attach screenshot/test evidence to Linear after user approval; keep issue open until closure evidence and merge.

## Implementation and verification

- Root cause: migration 035 stores show dates as `TIMESTAMPTZ`, including midnight-UTC calendar dates. `formatDateMMDDYYYY` preserves bare dates but uses local instant getters for timestamp strings. Chicago therefore displayed the previous day. Existing show/entry display helpers preserve the calendar portion.
- Career platform rows now call `formatEntryDate`, the app's established weekday competition-date formatter. External shows retain their existing formatter.
- Assertion-first component run before the change: 6 failed / 26 passed in America/Chicago. Midnight timestamp fixtures shifted January 9 to January 8, January 1 to December 31, and March 1 to February 28. Bare dates passed.
- After the change: all 32 component tests pass in America/Chicago, UTC, and Asia/Tokyo. Component plus shared formatter suite: 65/65 in Chicago and UTC; Tokyo 63/65 because two unchanged `formatShortDate` tests hardcode July 3 for an instant that is July 4 in Tokyo. No unrelated formatter behavior changed.
- Focused ESLint and app `tsc --noEmit` pass. Diff whitespace check passes.
- Browser: local worktree app at port 5366, real seeded exhibitor against configured staging, Chrome/America/Chicago. Same load-show fixture agrees: Overview Jan 9, Career Sat Jan 9 2027 (all four rows), My Shows Sat Jan 9 2027, show header Jan 9–11. No seed data edits.

- Settled screenshots were visually inspected for all four surfaces at 1440×900, 768×1024, and 390×844. Initial resize-only captures were discarded; each final viewport was loaded independently. Evidence bundle: `/private/tmp/myk9-366-evidence.zip`.
- Existing mobile Overview text wrapping/overlap remains outside this date-only fix. Review/merge remains pending; no deployment or database mutation.

## Remaining gate

Automatic approval review rejected the evidence archive upload to Linear because authenticated staging captures/logs require explicit export authorization. No artifact was uploaded. The bundle remains local; user approval is needed before attaching it. Local implementation and verification are complete.
