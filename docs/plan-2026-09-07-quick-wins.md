# Quick-wins remediation plan — 2026-09-07

Tracking: MYK9-437, MYK9-439, MYK9-436, MYK9-438, MYK9-435

## Goal

Implement five bounded Todo/quality findings without changing product scope: remove a
real-clock test flake, add the three missing FK-leading indexes, restore the INTENT sizing
floors, make advisor-array parsing preserve findings, and restore keyboard access for old
month URLs.

## Global constraints

- Preserve offline-first and existing query/mutation architecture; these fixes do not add a
  new page, dialog, or workflow.
- Preserve `docs/INTENT.md`: readable text is at least 14px and non-dense controls are at
  least 44px.
- Add regression coverage for every changed parser, test harness, or user-visible behavior.
- The migration is additive only and must use a new unique timestamp; do not push it to the
  linked database in this session.
- Use pnpm and run Prettier on touched files.

## Tasks

1. MYK9-437: replace the real-clock reset-test timing assumption with deterministic fake-clock
   or event-driven coverage, preserving the behavior under test.
2. MYK9-439: add one additive migration and source-contract/catalog coverage for
   `calendar_feed_tokens.show_id`, `show_officials.person_id`, and `show_officials.created_by`.
3. MYK9-438: support the top-level advisor lint-array payload and add a fixture/regression test.
4. MYK9-435 + MYK9-436: in the shared Find Shows month-strip code, keep a valid bookmarked
   month keyboard-reachable and replace the two arbitrary sizing violations with the project
   tokens/floors; add focused tests.

## Testing phase

- Run the focused Vitest files for the request tracker, advisor parser, and month scrubber.
- Run migration source-contract/sanity tests and `git diff --check`.
- Run Prettier on all changed files, app typecheck if UI code changed, and the app suite
  shuffled once after integration.
- Review the final diff for unrelated changes and verify no shared database mutation occurred.
