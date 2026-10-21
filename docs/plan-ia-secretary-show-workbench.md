# Plan: Secretary show workbench — one door per job

> **Status:** Active

**Findings:** [`ia-review-secretary-show-workbench.md`](ia-review-secretary-show-workbench.md) (IA-1 … IA-12 and the deletion list).
**Date:** 2026-10-20 · **Linear:** to file after the owner approves the deletion list.

Duplication question (CLAUDE.md § consolidate): every phase removes a door or a page. Nothing here adds a surface; the only additions are four existing cards moving into the Edit show panel because their current page is unreachable.

## Gate 0 — owner decisions (answered 2026-10-20)

1. **Deletion list: approved** with review edits (the size is ~1,900 lines; a counted control inventory is an exit criterion). The review's "venue location is wizard-owned" edit was overturned during Phase A: the wizard has no edit mode for an existing show's location.
2. **IA-1 home (as shipped in #3155, owner decisions 2026-10-21):** venue pin, venue Wi-Fi, per-show withdrawal policy and refund-all all mount unchanged in the Edit show details panel, keyed on the route show. Refund-all appears only once the show is cancelled. No pin-less readiness prompt (its wizard target does not exist); the pin card's cold-load behaviour is MYK9-1313. Club admins of the owning club keep access.
3. **IA-5: Option 1.** Overview's focused class owns check, release, print and initials; Results keeps the cross-class list, Submit and Close. Condition: mount the existing `ResultsClassDetail` inside the focused-class panel as-is. If that proves impossible without a rewrite, fall back to Option 2 (one "Continue on Results" link) and say so on the issue.
4. **IA-9:** for managers the trial page becomes a link into the workbench filtered by trial; per-trial Financials moves next to Reports' Financial Report.

Owner framing (2026-10-20): the direction has changed before and must not change again. This plan finishes the current direction (`plan-secretary-show-home.md`, `plan-show-tools-into-actions.md`) by removing what accreted around it; it adds no surface and moves nothing except the stranded settings and the class lifecycle. Every deletion removes a door, never a capability: attention chips, readiness checks, printed-state tracking, live counts and one-tap release all stay.

## Phase A — free deletions and stranded capabilities (done 2026-10-21)

Shipped as #3155 (MYK9-1296), #3156 (MYK9-1297) and #3157 (MYK9-1298 with MYK9-1282); MYK9-1312 removed the importer-less leftovers. Baseline recorded on MYK9-1298: 22 controls at 375px, 36 at 1280px. Entry was Gate 0 items 1 and 2. Each bullet was its own PR.

1. **Re-home and delete Show Settings (IA-1, IA-8).** Mount the venue pin, withdrawal-policy, Wi-Fi and refund-all cards in the Edit show details panel, keyed on the route's show id, not `selectedShowId`; refund-all only on a cancelled show. (As shipped; the earlier "delete `VenueLocationCard` and add a readiness prompt" wording was dropped when the wizard target proved not to exist.) Delete `ShowSettingsPage`, its route, its `config/surface.ts` entry, the two forwarder cards, and its rows in `test/e2e/qa/measurementSweepRoutes.ts` and `test/e2e/route-health-by-role.spec.ts`.
   - Tests: a render test per card in its new home on a real show id (red on `main`); a route test that `/secretary/settings` redirects to the dashboard; an armband-label test that the Wi-Fi set in the new home prints.
2. **Delete the orphan pages (IA-8).** Remove `/secretary/pipeline/:trialId` (`TrialPipelineDetail`, `PipelineColumn`, `TrialPipelineCard`, stage navigation) and `/shows/:id/trials/:tid/classes/:cid/secretary` (`SecretaryClassDashboard`, `ClassPipelineCard`). Keep `useMissionControlData` and the utilities it imports. Old URLs redirect to `/shows/:id` (or the class page) rather than 404.
   - Tests: route redirects; the dashboard test still passes; `statusIconSources.test.ts` entries updated.
3. **One premium verb, one access-codes card, header copy (IA-10, IA-11, IA-2 copy).** Remove the Actions "Generate & publish premium" row and the manager-branch `ShowAccessCodesCard` in `ShowOverviewTab`. Replace "their normal pages" and the status-pill/chip pair per MYK9-1282.
   - Tests: Actions registry snapshot; a render test that a published show with an unpublished premium shows one status line.
4. **Secretary phase spec in `docs/INTENT.md`** (docs only, lands with this plan). The six phases and what lives in each, so every later issue, agent and audit maps a surface to a phase or is rejected. The orchestrate skill's verify-then-weigh gate checks proposals against it.

Exit: no route without an incoming link in this surface; the three capabilities reachable in two clicks from the show; `pnpm qa:code-quality-ratchet` shows a drop of roughly 1,900 lines; a counted inventory of the Overview's controls above the fold at 375px and 1280px, recorded on the phase issue as the baseline for Phase B.

## Phase B — one door per verb

Entry: Phase A merged (met 2026-10-21). Issues: MYK9-1262, MYK9-1317, MYK9-1318, in that order.

1. **Tools into Actions (IA-6).** Execute `plan-show-tools-into-actions.md` as written (MYK9-1262 becomes its issue). The Volunteers row links straight to `/secretary/volunteers?showId=`.
2. **Fold the "Your show" row (IA-4).** Add Trial and Select classes become Actions rows; "Enter results from scoresheet" stays only in the focused class's Class work.
3. **Single release path (IA-7).** Browser-verify that the Visibility settings sheet shows `ResultsBulkBar`; if so, remove release from the embedded page and keep the visibility controls.

Exit: Overview's body has no button row (render test asserting none); every tool opens alone from the Actions menu; one release control per class; the Overview control count at 375px and 1280px is below the Phase A baseline, recorded on the phase issue.

## Phase C — where am I, and one home per class

Entry: Gate 0 items 3 and 4 (answered) and Phase B merged. Issues: MYK9-1269, MYK9-1319, MYK9-1320, in that order.

1. **MYK9-1269 with MYK9-1293 item 1 folded in (IA-3).** The current-show rail item is active inside its show; Browse is not. The breadcrumb's first crumb for a manager is Manage, not Shows.
2. **IA-5, Option 1.** Mount `ResultsClassDetail` inside the focused-class panel; Results keeps the cross-class list, Submit and Close; the ping-pong links go. If it cannot mount as-is, Option 2 with one handoff link, recorded on the issue.
3. **IA-9.** The trial page becomes a link for managers; per-trial Financials moves beside Reports' Financial Report.

Exit: on a managed show the rail and breadcrumb name the show; a class's whole lifecycle completes without a tab switch (Option 1) or with exactly one handoff link (Option 2).

## Testing phase

Each PR carries its own tests as listed above and runs the app suite shuffled before push. After Phase B and again after Phase C, a browser walk as `secretary@myk9t.com` at 375px and desktop across: open my show, review entries, run a class to released results, print today's paperwork, close the show, refund a cancelled show, set the Wi-Fi. The walk's notes go on the phase's Linear issue. A phase is not complete until its tests pass and the walk is recorded.

## Non-goals

- No change to Entry Forms beyond MYK9-1276 (carve-out), to Reports' library, or to the exhibitor surfaces.
- No new page, tab or rail item beyond MYK9-1269, which the owner already decided.
