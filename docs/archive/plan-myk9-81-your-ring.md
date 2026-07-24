# MYK9-81 — At-show “Your ring”

> **Status:** Complete

## Scope

- Identify a signed-in judge through the account’s canonical person ID.
- Read active class assignments only from replicated `judge_assignments`.
- Pin assigned classes in a “Your ring” section on the existing class-list page.
- Keep the existing trial groups, class-row behavior, favorites, and navigation unchanged.
- Hide the section for viewers without assignments and anonymous passcode sessions.

## Implementation

1. Add an offline-only query hook for the current judge’s active show assignments, including replication subscription invalidation.
2. Reuse the existing class-row presentation in the pinned section.
3. Filter assignments before A/B grouping so the section contains exactly the assigned classes.
4. Sort the section live-first without requiring favorites.

## Decisions

- **Duplication:** The pinned rows intentionally repeat assigned classes already present in the
  trial groups. This is a focused shortcut on the canonical class-list page, not a second workflow;
  keeping the original groups unchanged preserves browsing and manual favorites for cover classes.
- **Workflow:** This uses the lightweight Linear workflow instead of OPSX because MYK9-81 already
  provides a narrow PR-sized contract, requires no schema or shared-system design, and stays within
  one existing surface.

## Testing

1. Add page-level tests for exact assignment matching, live-first ordering, and placement above trial groups.
2. Add fallback tests for no assignments and anonymous passcode sessions.
3. Simulate a replication subscription update and verify the section refreshes.
4. Run the focused Vitest file, app typecheck, and the full app test suite.
