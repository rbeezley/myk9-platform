# Results Tab Redesign — everything a secretary does after a class is scored

> **Status:** Active

**Date:** 2026-10-06 · **Linear:** to file, one issue per phase (§ Issues) · **Design:** [canvas](https://claude.ai/artifact/NaX22uZzaDEderD4GxKVQC) (private; boards "Where each secretary task lives", "Results tab · A revised with Entry Forms parts", "Reports tab · Before, During, After")
**Read first:** [`INTENT.md`](INTENT.md) § Trial Secretary, [`plan-secretary-show-actions.md`](plan-secretary-show-actions.md) (MYK9-630, which made Results a tab and Submit a step of it), [`plan-secretary-show-home.md`](plan-secretary-show-home.md) (Overview as the home), [`plan-master-detail-lists.md`](plan-master-detail-lists.md) (the list-left, detail-right layout).

## Problem

The Results tab (`pages/secretary/ShowResultsSection.tsx`) has three steps: Review & release (`ResultsControlPage`), Submit to registry (`ResultsSubmissionPage`) and Close the show (`ShowCloseStep`). None of them shows the scores. A secretary who wants to check a class against the paper score sheets has to go to the class page (`/shows/:showId/trials/:trialId/classes/:classId`) through the Show Map.

The after-scoring work is also split across tabs. The Overview cockpit's class checklist (`features/show-map/cockpit/classChecklist.ts`) tracks preliminary results, ribbon labels and judge's initials, and its paperwork row prints them; the Reports tab prints the same reports; the Results tab releases.

## Owner decisions (2026-10-06)

1. **Tabs stay, organised by the thing they work on**, not by Before / During / After. A class changes tab once: it lives on **Overview** until scoring is complete, then on **Results**. Before / During / After orders the tabs, drives what Overview shows, and groups Reports.
2. **Tabs: Overview · Entry Forms · Results · Reports.** "Entries" is renamed **Entry Forms**: each row is one exhibitor's submission (people and money), while an Entry in `CONTEXT.md` is one dog in one class. Reports keeps its name ("Reporting" reads as analytics).
3. **Reports is the print library**, used in every phase. A print button that belongs to a task sits on that task's tab and opens the same report; no task lives only on Reports.
4. **Results layout: design A revised** — the Entry Forms tab's parts (filter bar, list with a "Next action" column, detail panel opening on a "Primary work" card), plus a batch "Print all ready" action.

## Duplication question

Does this duplicate an existing page? It removes duplication. After-scoring prints and the judge sign-off move off Overview onto Results, where Overview keeps them as status links. Results' print buttons call the existing report generators (`lib/reports/reportRegistry.ts`) and paperwork print state; nothing is reimplemented. The class page stays as the deep view; Results embeds the class's scores rather than copying the page.

## Survey (2026-10-06)

| Fact                                                                                                                                                                                                                                                                                                                                                                                                        | Evidence                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Results tab shows no scores                                                                                                                                                                                                                                                                                                                                                                                 | `ShowResultsSection.tsx` mounts only `ResultsControlPage` (readiness + visibility), `ResultsSubmissionPage`, `ShowCloseStep`                                                                        |
| Release is stored per class                                                                                                                                                                                                                                                                                                                                                                                 | `classes.results_released_at`                                                                                                                                                                       |
| **Judge sign-off has no writer.** The status reads `entries.judge_signature` / `judge_signature_timestamp` (`features/show-map/showMapStatus.ts:47`), but no app or package code writes either; "Collect judge's initials" only opens the Result Catalog report (`showMapActions.ts:170-190`). Live: 0 of 113 entries signed. So every completed class with entries reads "Needs judge's initials" forever. | grep over `apps/`, `packages/`, functions; read-only probe 2026-10-06                                                                                                                               |
| "Verified against paper" is not stored anywhere                                                                                                                                                                                                                                                                                                                                                             | no column; new state                                                                                                                                                                                |
| Reports already groups by phase, current phase first                                                                                                                                                                                                                                                                                                                                                        | `ReportControlsBar.tsx:196-199`, `resolvePhaseOrder`; mapping in `reportRegistry.ts` already puts check-in and score sheets in _during_, results sheet, result labels and Result Catalog in _after_ |
| Overview offers one post-accept entry change (Move up); pulls and withdrawals live on Entries                                                                                                                                                                                                                                                                                                               | sub-agent survey; duplicates inside Entries filed as MYK9-1027                                                                                                                                      |
| Correcting a score opens a blank form                                                                                                                                                                                                                                                                                                                                                                       | MYK9-1025 (open)                                                                                                                                                                                    |

## Phases

Timing: after the Oct 10 test show unless the owner pulls a phase forward. Phase 2 is the exception worth considering before it (see Risks).

### Phase 1 — Rename Entries to Entry Forms

- `routes/showManagementSections.ts` `SHOW_TABS` label; breadcrumbs (`hooks/useBreadcrumb.ts`), page directory (`features/admin-help/data/pageDirectory.ts`), sidebar and help text that name the tab.
- URL stays `/shows/:id/entries`; no redirect needed.
- Tests that assert the tab label are updated in the same PR (`git log -S` each assertion first).

**Done when:** the tab, header count and every user-visible reference read "Entry Forms"; a render test pins the four tab labels.

### Phase 2 — Judge sign-off gets a write path

Owner decision needed before building: store the sign-off **per class** (new `classes.judge_signed_off_at` + `judge_signed_off_by`) or per entry (write the existing `entries.judge_signature_timestamp`). Recommendation: per class. The judge initials the marked catalog page by page for a class, not dog by dog, and one class row is one write instead of N.

- Migration (Opus, owner-run push), with grants per `CLAUDE.md` § Database Migrations and a manager-only write path (SECURITY DEFINER RPC or RLS-checked update).
- `classifyClassWrapUpStatus` reads the new source; `classChecklist.ts` `signatureItem` follows.
- A "Initialed by judge" control (undoable) on Results (Phase 4). Until Phase 4 ships, the existing Overview action can carry it.

**Done when:** marking a class initialed flips it to "Initialed by judge" on Overview and Results, survives reload and offline replay, and the Show Map pending signal count drops.

### Phase 3 — "Verified against paper" (owner decision)

Options:

- **(a) Store it:** `classes.results_verified_at` / `_by` (migration). Release is gated on it. Per-row ticks are a client-side checklist that fills it.
- **(b) Don't store it:** the per-row ticks are a session aid only, and Release itself is the confirmation.

Recommendation: (a), class-level only. A secretary interrupted mid-check needs to see on return which classes were checked; per-row persistence is not worth a table.

### Phase 4 — Rebuild the Results tab (design A revised)

- **Layout:** `MasterDetailLayout` (from the master-detail plan). List: classes with Scored, Status and **Next action** (Verify → Release → Print → Initials → Done; classes not yet complete read "Overview →" and link there).
- **Filter bar:** search, Trial, "Show" status filter defaulting to _Needs me_, Density, More (Visibility settings, Submit to registry, Close the show), primary **Print all ready**.
- **Detail:** class header and chips; **Primary work** card naming the current step; the class's results table with a "matches paper" tick and **Fix** per row (opens the existing correct-score flow; blocked on MYK9-1025); a "Then" list for Release, Results sheet, Ribbon labels, Marked catalog + Initialed.
- **Reuse, not rewrite:** release uses the existing release mutation behind `ResultsControlPage`; prints use the existing report descriptors and paperwork print state (`buildReportPaperworkDescriptor.ts`, `paperworkPrintState.ts`); results rows read the same source as the class page's staff run sheet.
- **Show-level work:** Submit and Close keep their current pages, reached from More and from a banner once every class is released and initialed. The visibility defaults and overrides (`ResultsControlPage` "Result visibility") move behind More as a sheet.
- Replication-backed reads only (show-day reliability); offline: verify, tick and print work offline, release queues like other mutations.

**Done when:** a secretary can take a scored class from Verify to Initialed without leaving the tab, at desktop and 375px, offline included.

### Phase 5 — Overview hands finished classes to Results

- `classChecklist.ts`: the last three items (preliminary results, ribbon labels, judge's initials) stay as status but link to Results with the class selected.
- Cockpit paperwork row keeps check-in and score sheets; results sheet and result labels go.
- `showMapActions.ts`: `collect-judge-signature`, `review-results` and `submit-final-results` link into Results; "Edit score" after a class is complete links to Results (in-ring correction stays ringside).
- After the last class completes, Overview shows a "Results →" hand-off.

**Done when:** no after-scoring action can be performed on Overview, and every one of its after-scoring status items links to the right class on Results.

### Phase 6 — Reports layout (small)

The phase grouping exists. Change only the presentation: show the three phases as visible sections (current phase first and marked "Now") instead of headings inside the report picker, with per-report print status where `paperworkPrintState` has it, and an "Also on Results / Overview" link on reports that a task tab also offers. Re-check `reportRegistry.ts` names (several ids carry a copy-pasted `name`, e.g. `judges-schedule` reads "Result Catalog").

### Phase 7 — Testing

- Unit: next-action derivation for every class state (including pulled-only classes and cancelled classes); checklist link targets; release gated on verified (if Phase 3a).
- Component: Results list + detail on the real prop shape (LESSONS `last-hop-drop`); Overview checklist renders links, not actions, for items 5–7.
- SQL (CI): the sign-off and verified writes are manager-only; anon and exhibitors refused.
- E2E: one secretary journey, scored class → verify → release → print → initialed, on the `seed_demo_restore_show_day_fixture` show.
- Browser walk at desktop and 375px as `secretary@myk9t.com`, recorded in the PR.

## Issues

One per phase, filed when the owner approves the plan. Related: MYK9-1025 (blank correct-score form; blocks Fix), MYK9-1027 (pull/withdraw duplicates on Entries; independent), MYK9-1024 (delete-dialog link to an empty list).

## Non-goals

- Entry changes (pull, withdraw, move) — MYK9-1027.
- Ringside scoring and in-ring corrections.
- A new results view for exhibitors.
- Splitting Overview back into Setup and Show Day (MYK9-957 merged them on purpose).

## Risks

- **Judge sign-off is stuck today.** With no writer, the test show's completed classes will all read "Needs judge's initials". If that is noise on Oct 10, Phase 2 alone is the smallest fix that can ship first.
- Phase 4 depends on the master-detail layout and on MYK9-1025.
- Two migrations (Phases 2 and 3) — Opus implementer, owner-run pushes, contract suite before push.
