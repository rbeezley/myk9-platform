# Secretary UX Audit: Setup and Show Desk Tabs

**Date:** 2026-07-08
**Auditor:** Codex
**Role / persona:** secretary / elderly-novice
**Scope:** `/shows/dededede-0000-0000-0000-000000000010/setup` and `/shows/dededede-0000-0000-0000-000000000010/show-desk`
**Viewports:** mobile 390x844 touch, desktop 1280x800 mouse/keyboard, tablet 834x1112 touch with 1112x834 landscape spot-check
**Baseline:** none found in `docs/ux-audits/`; this is the baseline secretary report.

Overall, the Setup and Show Desk tabs are pointed at the right canonical show-detail surfaces and mostly support the consolidation goal: work stays in the show workbench, while Reports, Entry Management, Results & Check-In, and Submit Results are linked instead of reimplemented. The experience is calmest on desktop, acceptable but dense on tablet, and tiring on mobile because show-level chrome, publish cards, section tabs, readiness blocks, Show Desk status, filters, tree, and closeout all stack into a long scroll. The largest issues are not layout polish: they are trust breaks where the same page reports conflicting state or sends the secretary to an action that cannot complete the promised task.

**Regression line:** NEW 7 / STILL-OPEN 0 / RESOLVED 0 vs no prior secretary report.

## 2026-07-10 Remediation Re-Walk (partial)

A follow-up live re-walk on the Setup tab (desktop 1280x800, `e2e-secretary@test.myk9.com`) surfaced one additional trust break that the `secretary-show-details-ux-remediation` change did not cover, now fixed here:

- **Publish readiness contradicted the Premium List card.** The Setup "Publish readiness" block always rendered `Premium PDF is not published yet`, even for a show whose premium PDF was published (the Premium List card directly above correctly showed `Show data has changed since publish` / `Republish premium`). Root cause: `PublishReadinessBlock` read `publishedPremiumUrl`/`publishedPremiumAt` off the offline-replicated `show` object, which never syncs those post-189 columns down — the same limitation `PremiumDownloadCard` already worked around with a direct query. Fixed by extracting that query into a shared `usePublishInfo` hook and reading it in both surfaces, so the two premium signals can no longer disagree. Covered by `publishReadiness.test.ts` (override precedence) and `PublishReadinessBlock.test.tsx` (renders published/stale state from the fetched columns even when the show prop lacks them).

**Still outstanding:** the full mobile/tablet/desktop re-walk of Setup + Show Desk could not be completed on 2026-07-10 — the shared staging Supabase pooler began rejecting every request with `Timed out acquiring connection from connection pool` (RBAC, entry sync, and table sync all failed; unrelated to this change). The multi-viewport manual walk remains the last open step.

## Top 5 To Fix First

1. Unify Show Desk entry counts so hero, Show Map, closeout, and People at show do not disagree.
2. Make the `1 result pending closeout` signal land on a real closeout target instead of an empty filtered Show Map.
3. Stop recommending `Print Check-In Sheet` when the chosen class has no entries, or explain before navigation.
4. Reconcile Setup premium readiness so “ready,” “published,” “stale,” and “not published” cannot appear together.
5. Make Setup schedule rows disclose where they navigate, or route class-looking rows to class-level setup.

## Findings

| Severity | Reg | Tag           | Viewport(s)             | Path & screen                                                | What confused elderly-novice                                                                                                                                                                                                                                             | Why it's a problem                                                                                                                                                                     | Concrete fix                                                                                                                                                                                                                                                                                                                                     |
| -------- | --- | ------------- | ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High     | NEW | buildable     | Mobile, desktop, tablet | Show Desk: hero, Show Map, Closeout, Tools -> People at show | The hero, Show Map, and closeout say `0` entries, but People at show lists multiple exhibitors with class counts.                                                                                                                                                        | The secretary cannot trust whether the show has entries. On show day, this is costly because check-in, reports, closeout, and exhibitor lookup appear to be using different realities. | Use one show-scoped entry source for all Show Desk counts, or label source differences clearly. Add a regression test for a seeded show where People at show rows and Show Map/closeout counts must agree. Investigate the console warning `[entries] Skipping remote sync without show scope` as possible evidence of the count path diverging. |
| High     | NEW | buildable     | Mobile, desktop, tablet | Show Desk: pending signal                                    | Tapping `1 result pending closeout` changes the Show Map to `Nothing matches your current filters` while the summary still says `0 Need Attention`.                                                                                                                      | A signal promises “tap me to fix this,” but the user lands in an empty state. This makes the page feel broken and hides the actual closeout work.                                      | Route this signal to the completed class or closeout section that needs action, or deep-link to Results & Check-In with the relevant class/trial selected. Do not reuse a generic attention filter unless the tree contains matching attention nodes.                                                                                            |
| High     | NEW | buildable     | Mobile, desktop, tablet | Show Desk: Next best action -> Reports                       | `Next: Print Check-In Sheet` looks like the safest thing to do, but `Start` opens Reports with `No entries found for this selection`.                                                                                                                                    | The app’s recommendation sends a novice into a dead-end report. The secretary now has to decide whether the show data is wrong or they clicked the wrong thing.                        | Suppress print/check-in actions for classes with zero entries, show “No entries to print yet,” or choose a better next action. Add a test that recommended report actions require a non-empty target or visible pre-navigation explanation.                                                                                                      |
| Med      | NEW | buildable     | Mobile, desktop, tablet | Setup: Premium List, Setup readiness, Publish readiness      | Setup says `Setup ready`; the premium card says `Premium PDF published July 3, 2026` and `Show data has changed since publish`; Publish readiness says `Premium PDF is not published yet`; the fix link lands on a card with `Download PDF` but no clear publish action. | The secretary cannot tell whether the official premium is missing, stale, or okay. This directly conflicts with “the software already knows what I need.”                              | Collapse premium readiness to one source of truth: `not published`, `published`, or `published but stale`. Make the readiness copy and CTA match that state, and land the CTA on an explicit `Publish` / `Republish` action.                                                                                                                     |
| Med      | NEW | buildable     | Mobile, desktop         | Setup: Schedule class rows                                   | A row labeled like a class (`Container Completed Start Time: TBD · Novice`) behaves like a button but navigates to the trial details page.                                                                                                                               | The label suggests class-level editing or inspection, but the destination is broader. A novice will not know whether they are editing a class, opening a trial, or changing status.    | Rename the action affordance to `Open Saturday Trial` or route class-looking rows to the class setup/detail page. Add visible secondary text like `Opens trial details`.                                                                                                                                                                         |
| Med      | NEW | buildable     | Mobile, tablet portrait | Show management section nav                                  | Six section tabs are horizontally scrollable; only the first few are visible on mobile, and there is no clear cue that more critical sections are off-screen.                                                                                                            | A touch user may never discover Results & Check-In or Submit Results from the show workbench. This is a navigation issue, not a reason to duplicate those pages.                       | Keep the canonical pages, but add a mobile-friendly section selector or overflow affordance that exposes all six show sections without requiring hidden horizontal scrolling.                                                                                                                                                                    |
| Low      | NEW | cosmetic-only | Mobile, desktop, tablet | Show Desk: Tools sheet                                       | The Tools intro says `show messages`, but no visible section is named Messages.                                                                                                                                                                                          | Minor copy mismatch; it slows a novice who is trying to contact a handler or exhibitor.                                                                                                | Rename a section to include messaging or adjust the intro copy to match the actual tool list.                                                                                                                                                                                                                                                    |

## Responsive / Cross-Breakpoint Notes

Mobile inherits all state and action issues and adds the most scanning friction. The show-level publish cards and section tabs appear before the active tab content, so the user must pass through repeated chrome before reaching Setup or Show Desk work. Tablet portrait behaves like a larger mobile layout with no new breakage. Tablet landscape and desktop reduce scrolling but do not resolve the contradictory state or action-target problems.

No hover-only action was required for the audited paths. Tap targets for main buttons generally met the intent target, but the mobile section navigation depends on horizontal discovery.

## Diagnostic Notes

### Pass 1: Mental Model Alignment

**What UI suggests:** Setup tells the secretary whether the show is ready before exhibitors arrive; Show Desk tells the secretary what to do during the show.

**What it actually does:** Both tabs expose useful surfaces, but several readiness/action signals are not backed by consistent destination state.

| UI Element                        | User Expects                              | Actually Does                                                    | Severity |
| --------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- | -------- |
| `Setup ready` + premium readiness | One final answer about premium readiness  | Shows ready, published, stale, and not published states together | Med      |
| `1 result pending closeout`       | Lands on the pending result/closeout item | Applies a filter that shows no matches                           | High     |
| `Next: Print Check-In Sheet`      | Opens a useful check-in sheet             | Opens an empty report for a zero-entry class                     | High     |

### Pass 2: Information Architecture

The consolidation direction is right: Setup owns before-show readiness, Show Desk owns show-day flow, and specialized pages remain linked. The main IA weakness is that high-priority signals do not always land on the page or section that resolves them.

### Pass 3: Affordance Clarity

Schedule rows look class-specific but navigate to trial details. The Setup premium CTA says `Publish premium PDF` but lands on a card whose visible action is `Download PDF`.

### Pass 4: Cognitive Load

Show Desk asks the user to process status, pending signals, next action, up next, running now, map filters, a tree, closeout, and tools. This is workable for a power secretary but heavy for an elderly novice, especially when the data conflicts.

### Pass 5: State Coverage

No blank screens or crashes appeared. The problematic state is contradictory success/empty state: pages render successfully while reporting incompatible counts or empty destinations.

### Pass 6: Flow Integrity

Primary flow tested: secretary opens a show, checks Setup readiness, follows readiness/action links, opens Show Desk, uses next action, pending signal, and tools. The flow is completable with friction, but trust breaks are high enough that an elderly novice could abandon and ask for help.

## Duplication Question

This audit does not recommend duplicating Entry Management, Reports, Results & Check-In, or Submit Results inside Show Desk. The fixes should tighten deep-links and shared state so the canonical pages remain the place where that work happens.
