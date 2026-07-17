# Verification evidence

Verified 2026-07-17 on the seeded Heartland Scent Work Classic show.

## Automated checks

- `pnpm typecheck`: 26/26 tasks passed.
- `pnpm lint`: 14/14 tasks passed.
- Focused myK9Show tests: 12 files, 214 tests passed.
- Focused ringside tests: 3 files, 29 tests passed.
- Shared UI status grammar tests: 1 file, 3 tests passed.
- `pnpm openspec validate status-icon-grammar --strict`: passed.

Independent-review hardening was reverified after the initial sweep:

- Focused myK9Show status, schedule, My Entries, ClassCard, and analytics tests: 5 files, 55 tests passed.
- Shared UI package suite: 18 files, 294 tests passed.
- Scoring UI package suite: 26 files, 278 tests passed.
- `pnpm typecheck`: 26/26 tasks passed.
- `pnpm lint`: 14/14 tasks passed.
- `pnpm openspec validate status-icon-grammar --strict`: passed.

This review pass added cancelled-trial coverage, restored the accepted/payment-due indicator, routed the schedule timeline through the shared shape grammar, tied coverage to canonical entry/class statuses, and removed the shared component's runtime dependency on mocked icon exports.

The second independent-review pass also verified cancelled trials with zero classes, neutral-outline badge contrast, Entry Management's composed status line, and the secretary run-sheet check-in selector. The expanded app regression set passed 83 tests across 10 files; the shared UI suite passed 295 tests across 18 files. Typecheck (26/26), lint (14/14), and strict OpenSpec validation remained clean.

The third independent-review pass removed the final parallel class/check-in presentation maps, routed both active at-show class renderers through the shared badge, corrected the scored-result badge contrast, and tied entry coverage to the canonical lifecycle type. Assertion-first coverage failed on all four leaks before the fixes. Afterward, the focused regression set passed 66 tests across 10 files and the shared UI suite passed 295 tests across 18 files. Typecheck (26/26), lint (14/14), and strict OpenSpec validation remained clean.

The fourth independent-review pass removed the remaining presentation owners from the shared ClassCard, core class/check-in constants, ringside formatting helpers, check-in class rows, and multi-dog schedule. A recursive ownership test now scans all production TypeScript sources in myK9Show, core, shared UI, and ringside for the retired maps and helpers. Assertion-first coverage failed on the remaining leaks before the fixes. Afterward, the focused app regression set passed 69 tests across 10 files; the full shared UI, core, and ringside suites passed 295, 360, and 370 tests respectively. Typecheck (26/26) and lint (14/14) remained clean.

An owner-authorized additional review cycle found and removed the last local presentation paths in scoring navigation, the at-show check-in picker, and ringside class-list formatting. Ringside now derives only an effective operational class status; the app passes that key directly to the shared badge. The recursive ownership gate was expanded to cover these retired helpers and renderers. Assertion-first tests failed on all reported leaks before the fixes. Afterward, the focused app set passed 23 tests across 4 files; the full shared UI, core, and ringside suites passed 295, 360, and 369 tests respectively. Final typecheck (26/26), lint (14/14), and strict OpenSpec validation passed.

The subsequent clean-review loop removed the scoring navigation's remaining lifecycle dots, hard-coded status icons, card color variants, and status-text colors. It added exact shared descriptors for navigation `in-progress` and exhibitor `not-opened`, tied exhaustive coverage to the exhibitor status union, and expanded ownership scanning to production CSS. Assertion-first coverage failed on each leak before remediation. Afterward, the focused app set passed 14 tests across 4 files, the full shared UI suite passed 295 tests, typecheck passed 26/26 tasks, lint passed 14/14 tasks, and strict OpenSpec validation passed.

The next two-axis review corrected the remaining ringside and scoring lifecycle presentation owners, centralized semantic badge surfaces in the shared grammar, restored compact check-in badge geometry, retained a non-layout-shifting 44px interactive hit area, and raised changed 10–11px status text to the 14px application floor. The ownership, lifecycle, and badge-geometry assertions failed before remediation. Afterward, 46 focused app tests across 5 files, 26 ringside tests across 3 files, and all 296 shared UI tests passed. Typecheck (26/26), lint (14/14), and strict OpenSpec validation remained clean.

The following review loop migrated the Class Details compact header's final local class-status variant map and moved the newly added component tests onto the required application test renderer. The ownership and shared-shape assertions failed before the migration; the focused 47-test app set passed afterward.

The next standards pass found six other modified status tests still using raw Testing Library render. They now use the application renderer (with router mocks/wrappers adjusted to avoid nesting), and all 74 tests across those 6 files pass. The parallel spec review reported no actionable findings.

The subsequent spec pass removed TV Display's class and in-ring entry presentation maps, removed an unused status-to-Lucide map from the grouped class sidebar, and restored the ringside header's pre-migration status visibility set. Assertion-first ownership, shared-shape, and visibility tests failed before remediation; 19 focused TV/source tests and the new ringside visibility test pass afterward.

The next spec pass migrated the exhibitor check-in summary and entry lifecycle stepper to shared shapes, removed Class Management's parallel lifecycle label/tone maps, and expanded the ownership gate for all three patterns. Assertion-first checks failed on each path before remediation; 45 focused ownership/component/helper tests and 9 Class Management lifecycle/judge tests pass afterward.

The broad myK9Show suite was also started. It exposed three contextual My Entries label regressions, which were fixed and covered by the focused 67-test card suite, then reached the repository's known 60-second hang threshold and was stopped. CI remains the broad-suite gate.

The sixth two-axis review removed the ringside card's parallel lifecycle border colors, moved Show Desk roster and entry-history status rendering onto the shared descriptors, paired check-in progress and in-ring indicators with shared shapes, and restored the protected 48px ringside-row intent comment. The exhibitor-facing at-show wording remains intentionally role-specific while its badge now uses the shared shape grammar. Assertion-first tests failed on every reported path before remediation. Afterward, 62 focused app tests across 8 files and 19 ringside tests across 2 files passed; typecheck passed 26/26 tasks, lint passed 14/14 tasks, and strict OpenSpec validation passed.

The seventh two-axis review moved trial lifecycle derivation into core so stored trial state and child-class progress cannot disagree, added the persisted `scratch_requested` and `move_up_requested` aliases, fixed icon-only check-in accessibility and duplicate ClassCard announcements, and migrated the last four reported production renderers (pipeline cards, scoring-day summaries, run-order boards, and trial lists). Assertion-first tests failed on every reported path before remediation. Afterward, 39 focused app tests across 6 files, all 363 core tests across 16 files, and all 296 shared UI tests across 18 files passed. Typecheck passed 26/26 tasks, lint passed 14/14 tasks, and strict OpenSpec validation passed.

The eighth two-axis review aligned Trials filtering and Show Map trial badges with child-derived lifecycle progress, normalized the remaining persisted class and entry aliases, removed three legacy CSS status maps and five unused trial renderers, corrected the secretary dashboard's completed/cancelled mapping, and eliminated redundant screen-reader announcements. Tablet layouts now defer dense rows and action groups until the large breakpoint. Assertion-first coverage failed on the reported paths before remediation. Afterward, 75 focused app tests across 10 files, all 296 shared UI tests, all 363 core tests, and all 371 ringside tests passed. Typecheck passed 26/26 tasks, lint passed 14/14 tasks, and strict OpenSpec validation passed.

The ninth two-axis review made active-child trial derivation consistent across Show Map and the Trials tab, including the zero-completed-class case in both warm replicated and public fallback stats. Class Details check-in selectors now display shared human-readable labels instead of raw keys. The out-of-scope class-query fallback used during an earlier evidence attempt was removed; browser QA instead hydrated the existing show-scoped replica through its normal full-sync path. The status inventory now lists every supported descriptor and accepted class alias, and the referenced light/dark browser artifacts are tracked with the change. Assertion-first coverage failed on the reported paths before remediation. Afterward, 83 focused app tests across 11 files passed. Typecheck passed 26/26 tasks, lint passed 14/14 tasks, and strict OpenSpec validation passed.

The tenth two-axis review added a neutral `no-status` fallback for unknown or missing trial values so they cannot be misannounced as “No classes yet,” expanded the renderer inventory to every migrated in-scope surface, and replaced the shared ClassCard's final unlabeled amber in-ring dot with the accessible shared entry icon. Assertion-first tests failed for both behavior gaps before remediation. Afterward, all 297 shared UI tests across 18 files and the 7-test recursive ownership suite passed. The code-quality ratchet also returned to baseline after the Show Details trial-stat change was kept below the 500-line source limit.

## Browser sweep

Playwright CLI was run at the 768×1024 tablet viewport in light and dark themes against the authenticated seeded Heartland Scent Work Classic show. Each route was held until its page heading and populated status content were visible, then captured as a full-page screenshot and accessibility snapshot:

- Entry Management: `/shows/dededede-0000-0000-0000-000000000010/entry-management` — `.playwright-cli/myk9-52-entry-management-{light,dark}-tablet-r8.{png,yml}`
- Class Management: `/shows/dededede-0000-0000-0000-000000000010/classes/dededede-0000-0000-0000-000000000021` — `.playwright-cli/myk9-52-class-management-{light,dark}-tablet-r8.{png,yml}`
- Class Details: `/shows/dededede-0000-0000-0000-000000000010/trials/dededede-0000-0000-0000-000000000021/classes/dec1a55e-0000-0000-0000-000000000031` — `.playwright-cli/myk9-52-class-details-{light,dark}-tablet-r9.{png,yml}`
- Show Desk: `/shows/dededede-0000-0000-0000-000000000010/show-desk` — `.playwright-cli/myk9-52-show-desk-{light,dark}-tablet-r9.{png,yml}`

The QA session hydrated the show-scoped entries replica through its normal full-sync path (26 rows) before opening Class Details; no entry-query behavior was added to this presentation change. The screenshots and snapshots show populated pending/scored entry states, all 8 seeded Class Details entries with readiness progress and human-readable check-in labels, class not-started/in-progress/completed states, and child-derived Show Desk trial states using the shared grammar in both themes. Entry Management, Class Management, and Class Details remain readable without clipped titles, actions, status labels, or overlapping controls at the tablet viewport. The only browser console errors were the known Vite HMR websocket conflict from running this worktree on port 5174 while port 24678 was already occupied; no application runtime errors were observed.
