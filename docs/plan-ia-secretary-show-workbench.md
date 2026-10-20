# Plan: Secretary show workbench — one door per job

> **Status:** Active

**Findings:** [`ia-review-secretary-show-workbench.md`](ia-review-secretary-show-workbench.md) (IA-1 … IA-12 and the deletion list).
**Date:** 2026-10-20 · **Linear:** to file after the owner approves the deletion list.

Duplication question (CLAUDE.md § consolidate): every phase removes a door or a page. Nothing here adds a surface; the only additions are four existing cards moving into the Edit show panel because their current page is unreachable.

## Gate 0 — owner decisions (before any phase)

1. **Approve the deletion list** as written, or strike rows.
2. **IA-1 home:** which Edit show tab takes per-show withdrawal policy, venue location and venue Wi-Fi; whether Refund all entries sits there or beside the status pill's cancel path. It moves money, so the existing `RefundAllEntriesCard` mounts unchanged (refunds stay human-approved).
3. **IA-5:** where a class lives once it is complete. Option 1: Overview's focused class owns check, release, print and initials, and Results keeps the cross-class list, Submit and Close. Option 2: today's split, with the ping-pong links replaced by one "Continue on Results" link. Recommendation: Option 1, but only with MYK9-958's real-secretary observation or the owner's judgment.
4. **IA-9:** does the trial page stay for managers? Recommendation: for managers it becomes a link into the workbench filtered by trial, and per-trial Financials moves next to Reports' Financial Report.

## Phase A — free deletions and stranded capabilities

Entry: Gate 0 items 1 and 2. Each bullet is its own PR.

1. **Re-home and delete Show Settings (IA-1, IA-8).** Mount the four orphan cards in the Edit show panel keyed on the route's show id, not `selectedShowId`. Delete `ShowSettingsPage`, its route and its `config/surface.ts` entry, and the two forwarder cards.
   - Tests: a render test per card in its new home on a real show id (red on `main`); a route test that `/secretary/settings` redirects to the dashboard.
2. **Delete the orphan pages (IA-8).** Remove `/secretary/pipeline/:trialId` (`TrialPipelineDetail`, `PipelineColumn`, `TrialPipelineCard`, stage navigation) and `/shows/:id/trials/:tid/classes/:cid/secretary` (`SecretaryClassDashboard`, `ClassPipelineCard`). Keep `useMissionControlData` and the utilities it imports. Old URLs redirect to `/shows/:id` (or the class page) rather than 404.
   - Tests: route redirects; the dashboard test still passes; `statusIconSources.test.ts` entries updated.
3. **One premium verb, one access-codes card, header copy (IA-10, IA-11, IA-2 copy).** Remove the Actions "Generate & publish premium" row and the manager-branch `ShowAccessCodesCard` in `ShowOverviewTab`. Replace "their normal pages" and the status-pill/chip pair per MYK9-1282.
   - Tests: Actions registry snapshot; a render test that a published show with an unpublished premium shows one status line.

Exit: no route without an incoming link in this surface; the four capabilities reachable in two clicks from the show; `pnpm qa:code-quality-ratchet` shows the drop.

## Phase B — one door per verb

Entry: Phase A merged.

1. **Tools into Actions (IA-6).** Execute `plan-show-tools-into-actions.md` as written (MYK9-1262 becomes its issue). The Volunteers row links straight to `/secretary/volunteers?showId=`.
2. **Fold the "Your show" row (IA-4).** Add Trial and Select classes become Actions rows; "Enter results from scoresheet" stays only in the focused class's Class work.
3. **Single release path (IA-7).** Browser-verify that the Visibility settings sheet shows `ResultsBulkBar`; if so, remove release from the embedded page and keep the visibility controls.

Exit: Overview's body has no button row (render test asserting none); every tool opens alone from the Actions menu; one release control per class.

## Phase C — where am I, and one home per class

Entry: Gate 0 items 3 and 4.

1. **MYK9-1269 with MYK9-1293 item 1 folded in (IA-3).** The current-show rail item is active inside its show; Browse is not. The breadcrumb's first crumb for a manager is Manage, not Shows.
2. **IA-5 per the decision.**
3. **IA-9 per the decision.**

Exit: on a managed show the rail and breadcrumb name the show; a class's whole lifecycle completes without a tab switch (Option 1) or with exactly one handoff link (Option 2).

## Testing phase

Each PR carries its own tests as listed above and runs the app suite shuffled before push. After Phase B and again after Phase C, a browser walk as `secretary@myk9t.com` at 375px and desktop across: open my show, review entries, run a class to released results, print today's paperwork, close the show, refund a cancelled show, set the Wi-Fi. The walk's notes go on the phase's Linear issue. A phase is not complete until its tests pass and the walk is recorded.

## Non-goals

- No change to Entry Forms beyond MYK9-1276 (carve-out), to Reports' library, or to the exhibitor surfaces.
- No new page, tab or rail item beyond MYK9-1269, which the owner already decided.
