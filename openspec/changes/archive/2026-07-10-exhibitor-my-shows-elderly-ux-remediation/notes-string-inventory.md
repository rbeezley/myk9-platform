# Pinned-string inventory (task 1.1)

Grep of `apps/myk9show/src` (code + tests) for the four strings this change is
about to alter on the My Shows page. Files below pin these strings and must be
checked/updated in the same commit as any wording change (task group 4) — this
file only records the inventory; no source files were changed for task 1.1.

## "Please check your connection"

Only the My Shows load-error copy (`index.tsx:277` and its rendering source
`MyEntriesTab.tsx:29`, which is the Show Details "My Entries" tab, a separate
surface) is in scope for this change's error-copy requirement. The others are
unrelated error paths (Stripe, DB error-code map, dog-store sync, generic
toast helper) and are NOT touched by this change.

| File                                                          | Line | Note                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/pages/MyEntriesPage/index.tsx`             | 277  | **In scope** — the entries-load error copy this change replaces (task 4.4). No test currently pins this exact string in `MyEntriesPage.test.tsx` by literal match beyond render presence — re-check when editing. |
| `apps/myk9show/src/components/shows/tabs/MyEntriesTab.tsx`    | 29   | Same copy on the Show Details "My Entries" tab — a different surface (not `/exhibitor/entries`). Out of scope; leave unless the proposal is later extended there.                                                 |
| `apps/myk9show/src/features/payments/useClubStripeAccount.ts` | 116  | Unrelated (Stripe provider fetch failure copy). Out of scope.                                                                                                                                                     |
| `apps/myk9show/src/utils/errorMessages.ts`                    | 22   | Unrelated (Postgres `08000` connection-exception code map). Out of scope.                                                                                                                                         |
| `apps/myk9show/src/hooks/useDogStoreCompat.ts`                | 255  | Unrelated (dog-store local-save sync failure). Out of scope.                                                                                                                                                      |
| `apps/myk9show/src/lib/notifications.tsx`                     | 150  | Unrelated (generic toast-failure helper, `actionText`-templated). Out of scope.                                                                                                                                   |

## "Browse All Shows"

| File                                                         | Line     | Note                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/pages/MyEntriesPage/index.tsx`            | 508      | **In scope** — the current one-size-fits-all empty-state CTA this change replaces with `EMPTY_STATE_BY_TAB` (task 4.4).                                                                                                                         |
| `apps/myk9show/src/test/e2e/my-entries-page-ui.spec.ts`      | 239, 246 | **In scope** — Playwright e2e asserts a button named `/Browse All Shows\|Enter a Show/i` in the empty state; regex already tolerates either label, but confirm behavior still matches when empty-state CTA copy is tab-specific (task 4.4/5.2). |
| `apps/myk9show/src/utils/show-actions.ts`                    | 397      | Unrelated helper (`actionLabel: 'Browse All Shows'` for a different show-action recommendation, not the My Shows empty state). Verify no shared import before editing; currently a separate string literal.                                     |
| `apps/myk9show/src/components/shows/EnhancedEmptyStates.tsx` | 58, 157  | Unrelated general-purpose empty-state component library, not directly imported by MyEntriesPage's empty state (MyEntriesPage inlines its own `EmptyState`). Out of scope unless later reused.                                                   |
| `apps/myk9show/src/pages/CalendarPage.tsx`                   | 79       | Unrelated (Calendar page's own empty state). Out of scope.                                                                                                                                                                                      |

## "Current Entries" (exact string)

| File                                                                      | Line        | Note                                                                                                               |
| ------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/myk9show/src/components/exhibitor/CompactStatsRow.tsx`              | 66          | **In scope** — the summary-card label this change renames to the scope-qualified wording (task 2.1).               |
| `apps/myk9show/src/test/components/CompactStatsRow.test.tsx`              | 27, 59, 122 | **In scope** — must be updated in the same commit as the CompactStatsRow label rename (task 2.1/2.4).              |
| `apps/myk9show/src/components/reports/FinancialReport.tsx`                | 22          | Unrelated — Financial Report's own "current vs waitlisted" variant label, no connection to My Shows. Out of scope. |
| `apps/myk9show/src/components/reports/__tests__/FinancialReport.test.tsx` | 122         | Unrelated, pins the FinancialReport label above. Out of scope.                                                     |
| `apps/myk9show/src/lib/reports/reportRegistry.ts`                         | 314         | Unrelated report-registry dropdown option label. Out of scope.                                                     |
| `apps/myk9show/src/data/fieldDefinitions.ts`                              | 413         | Unrelated field-definition display name (report field picker). Out of scope.                                       |

## "My Entries" (exact string)

The My Shows page itself uses "My Entries" only as the entries-section eyebrow
label (`index.tsx`), which task 2.2 renames to "All entries". Every other hit
below is a different surface (sidebar nav item, support deep-link, Show
Details tab, prototype file) and must NOT be renamed — they refer to
navigation/routing to `/exhibitor/entries`, not the on-page section label.

| File                                                                                 | Line                           | Note                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/pages/MyEntriesPage/index.tsx`                                    | (eyebrow render, see task 2.2) | **In scope** — the entries-section label this change renames to "All entries" + "Includes past shows" note.                                                     |
| `apps/myk9show/src/test/pages/MyEntriesPage.test.tsx`                                | 324-325, 657                   | **In scope** — asserts `screen.getByText('My Entries')` anchoring the entries-section wrapper; must be updated to the new label in the same commit as task 2.2. |
| `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`                | 243                            | Sidebar nav item title — a navigation label, not the page's section eyebrow. Out of scope; do not rename (would break nav, not this page's legibility issue).   |
| `apps/myk9show/src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts` | 216, 255, 261                  | Pins the sidebar nav item above. Out of scope.                                                                                                                  |
| `apps/myk9show/src/features/support/supportDeflection.ts`                            | 41                             | Support deep-link label (`{ label: 'My Entries', href: '/exhibitor/entries' }`). Out of scope — a link label, not the page section heading.                     |
| `apps/myk9show/src/features/support/supportDeflection.test.ts`                       | 56                             | Pins the deep-link label above. Out of scope.                                                                                                                   |
| `apps/myk9show/src/pages/ShowDetailsPage.tsx`                                        | 341                            | Show Details page's own "My Entries" tab label — a different surface. Out of scope.                                                                             |
| `apps/myk9show/src/pages/ShowDetailsPrototype.tsx`                                   | 498                            | Unused/prototype file tab id/label. Out of scope.                                                                                                               |
| `apps/myk9show/src/hooks/moveUpDisplay.ts`                                           | 2 (doc comment)                | Prose reference only, not a rendered string. Out of scope.                                                                                                      |
| `apps/myk9show/src/services/entryDisplay/entryDisplaySelectors.ts`                   | 5 (doc comment)                | Prose reference only, not a rendered string. Out of scope.                                                                                                      |
| `apps/myk9show/src/test/e2e/show/phase4CrossRoleSeams.spec.ts`                       | 26 (comment)                   | Prose reference only. Out of scope.                                                                                                                             |

## Source-text regression tests (`fs.readFileSync` pattern)

Searched every `apps/myk9show/src/**/*.test.ts(x)` that reads source via
`readFileSync` for these four strings (per
`feedback_source_text_regression_tests.md`). Only
`apps/myk9show/src/styles/__tests__/myEntriesResponsiveSource.test.ts` matched,
and only via its `describe('My Entries responsive source guards', ...)` block
name — it does not assert on any of the four literal strings inside source
file contents, so no update is required there.

## Docs (`*.md`) mentioning these strings

A broad `grep -rl` over `docs/**/*.md` returns dozens of historical audits,
plans, and archived specs that reference "My Entries" / "Current Entries" /
"Browse All Shows" in prose (mostly closed/archived planning docs). None of
these are source-text regression tests (no `readFileSync` assertions found
outside `apps/myk9show/src`), so they are informational only and out of scope
for this task; they are not enumerated line-by-line here.
