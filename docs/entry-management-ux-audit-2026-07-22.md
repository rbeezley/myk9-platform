# Entry Management UX Audit — Redesigned Cockpit

**Date:** 2026-07-22
**Auditor:** Claude (live-browser walk as `e2e-secretary@test.myk9.com` on localhost dev + staging DB)
**Scope:** Secretary Entry Management (`/shows/:showId/entry-management`) — Registrations queue, focused registration, Exceptions (Move-ups / Pulls / Waitlist), bulk actions, Add-entry wizard, plus the show-details "Entries" tab.
**Predecessor:** [entry-management-ux-audit.md](entry-management-ux-audit.md) (2026-07-20, pre-redesign). The redesign resolved that audit's core finding — competing projections are now collapsed into Registrations + Exceptions with queue chips. This audit reviews the redesigned page.
**Intent anchor:** Secretary = "That was easy" (docs/INTENT.md).

## Verified bugs (found live)

### BUG-1 — Pull-refund schema probe 400-spams staging (deploy gap)

Every cockpit load fires `GET /rest/v1/entries?select=id,withdrawn_at,refund_decision,refund_decided_at&…&entry_status=eq.scratched` → **400**, because migration `supabase/migrations/20260722160000_add_pull_refund_decisions.sql` (PR #1420, merged today) **was never pushed to staging** — `refund_decision` / `refund_decided_at` do not exist in the remote `entries` table (verified via SQL).

The code survives via the schema-compat fallback (`postgrestGetSecretaryPullMetadataMap` in [secretaryPostgrest.ts:123](../apps/myk9show/src/services/database/entries/secretaryPostgrest.ts) retries without the columns), so the UI silently works — but every call pays a doomed request first, and the console/Sentry fill with 400s (observed 3+ per interaction, continuously refetched).

**Fix:** push the migration (`supabase db push` per docs/reference/git-workflow.md; confirm project ref `sojmvhhwsjxmfistvzbe`). Optionally memoize the probe result per session so a missing schema is only probed once.

### BUG-2 — "Back to registrations" leaves `registration=` in the URL

Steps: open any registration → click **Back to registrations** → list shows, but URL keeps `?queue=all&registration=entry%3A…`. A reload (verified) or a mobile↔desktop breakpoint remount re-opens the card the secretary just closed. Also breaks link-sharing ("here's the all queue" link re-opens a specific registration).

**Fix:** the back handler must delete the `registration` search param, not just flip local state.

### BUG-3 — Move-up card copy: "To: _Select below_" points at nothing

The Move-Up Request card renders `From: Interior Novice B → To: Select below`, but there is no selector below — the target class picker only exists inside the **Approve Move-Up dialog** that opens after clicking Approve. The label describes a layout that no longer exists.

**Fix:** change to "Chosen at approval" / "—", or move the target-class select onto the card.

### BUG-4 — Grammar: "1 of 1 Entry currently need this action."

[EntryFocusedRegistration.tsx:79](../apps/myk9show/src/components/entries/management/EntryFocusedRegistration.tsx) pluralizes "Entry/Entries" but not the verb — singular reads "1 of 1 Entry currently need this action." Also appears when **nothing** needs action (a fully Completed/Paid registration shows "PRIMARY WORK: View registration — 1 of 1 Entry currently need this action"), which contradicts itself.

Related: list-row aria-labels read "Maya Rivers, 1 Entries, …" (same pluralization gap in the a11y string).

### BUG-5 — Mobile (390px) layout breaks the queue header and rows

- The queue chips row clips: only "Needs review 7" and a truncated "Miss…" render before the **View** button overlaps; Missing information / Payment due / All registrations are invisible and no scroll affordance is shown.
- Row grid squeezes the registration column to unreadable ("Ex…", "Ju…", "Richar…") while the right columns keep full width.

**Fix:** wrap or horizontally-scroll the chips (with fade), and stack row content vertically at the mobile breakpoint (INTENT: outdoor-tablet legibility).

## Pass 1: Mental Model Alignment

**What UI suggests:** "Registrations come in → I work the exception queues until they're empty → day-of exceptions (move-ups, pulls, waitlist) live under Exceptions." That matches how secretaries actually think. The two-level structure (Registrations | Exceptions + queue chips) is a major improvement over the old five-tab projection.

**Misalignment gaps:**

| UI Element                                | User Expects                              | Actually Does                                                                                 | Severity    |
| ----------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- | ----------- |
| "PRIMARY WORK: Review registration" panel | A button that starts/completes the review | Inert text; real actions hide in "Actions ⋯"                                                  | High        |
| Status vocabulary                         | One word per state                        | "Accepted" (list) vs "Reviewed" (focused badge) vs "Accept entry" (menu) for the same concept | Med         |
| "To: Select below" (move-up)              | A selector below                          | Selector lives in the Approve dialog                                                          | Med (BUG-3) |
| "No confirmation" row subtitle            | ? — reads like an error                   | Means "no confirmation number issued" (mail-in/manual)                                        | Low         |
| "Comp" button on entry card               | Unclear (jargon)                          | Comp the fee                                                                                  | Low         |

**Jargon found:** "No confirmation", "Comp", "Missing Info" (menu item, verb-less), "Promotion expired" (Entries tab status).

## Pass 2: Information Architecture

**Current structure:** Registrations (chips: Needs review / Missing information / Payment due / All) → row → focused registration (Primary work, Entries, Payment, Communication). Exceptions (Move-ups / Pulls-scratches / Waitlist). Header: More (Check-in desk, Copy view link, Export CSV), Add entry.

**IA issues:**

| Issue                       | Location                                       | Problem                                                                                                                                                                                          | Recommendation                                                                                                                             |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Duplicate surface           | Show details "Entries" tab (`?tab=my-entries`) | Read-only flat entry table on the same page as the Entry Management strip link; its "Manage Entries" button never renders (`onManageEntries` never passed in ShowDetailTabs), so it's a dead end | Per CLAUDE.md consolidation rule: link the tab to the cockpit (or replace tab content with a link + summary); wire or delete the dead prop |
| Page chrome above work area | Entry management page                          | Full show header (dates, fee, premium-list card, landing-page card) renders above the cockpit; the work area starts ~800px down                                                                  | Collapse the header to a slim bar on management sub-pages                                                                                  |
| Waitlist under "Exceptions" | Exceptions → Waitlist                          | Cards titled by judge name ("Test Judge" ×4, two identical pairs) — indistinguishable                                                                                                            | Title cards by trial/day ("Saturday Trial — Aug 1"), judge as secondary                                                                    |

**Visibility problems:**

- Hidden but should be visible: current entry status inside the Change-status menu (no checkmark on the active state); accept/reject actions (buried in "Actions ⋯").
- Prominent but should be secondary: premium-list / landing-page cards on an entry-work page.

## Pass 3: Affordance Clarity

| Element                          | Looks Like                           | Actually Is                                    | Clear?                                            |
| -------------------------------- | ------------------------------------ | ---------------------------------------------- | ------------------------------------------------- |
| "Review registration →" row link | Link                                 | Opens focused card (row itself also clickable) | Yes                                               |
| "Actions ⋯"                      | Generic overflow                     | The **primary** accept/reject actions          | **No**                                            |
| Status pill ("Pending ⌄")        | Badge                                | Status-change menu                             | Mostly (has caret)                                |
| "Paid" chip                      | Same pill styling as "Payment Due ⌄" | Inert (no popover)                             | No — same-looking chips, one interactive, one not |
| "Payment Due ⌄" chip             | Badge                                | Payment actions popover                        | Mostly                                            |
| Queue chips                      | Buttons                              | Filter the list, update counts live            | Yes                                               |
| "View" button                    | Ambiguous ("view what?")             | Row-density toggle only                        | No — label oversells                              |

**Hidden affordances:** Accept All / Reject All / Missing Info / Check In All (in "Actions ⋯"); target-class choice (inside Approve dialog).

**Recommended fixes:**

- Put **Accept** and **Reject** buttons directly in the PRIMARY WORK panel (or next to "Actions"), leaving rarer verbs in the menu.
- Rename "View" → "Density" (or move under More).
- Don't render the non-interactive Paid chip in the same pill+chevron grammar as interactive ones.

## Pass 4: Cognitive Load

| Screen/Step          | Decisions Required                                         | Can Be Reduced?                                      |
| -------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Registrations list   | 1 (pick row) — chips pre-filter to Needs review            | Good; default is right                               |
| Focused registration | Find the accept action (menu discovery) + per-entry status | Surface Accept/Reject; per-entry only for exceptions |
| After accepting      | Where did it go? Returns to list silently                  | Toast with undo + "next needs-review" affordance     |
| Move-up approve      | 1 (target class, single valid option pre-filterable)       | Pre-select when only one legal target exists         |

**Missing defaults:** Approve Move-Up target class (auto-select the single option); class filter unusable until a trial is chosen (with "All Trials", the class dropdown is empty).

**Cognitive load score:** **Low–Medium** — the queue-chip model is genuinely calm; the residual load is action discovery, not information volume.

## Pass 5: State Coverage

### Registrations queue / focused card

| State                           | Implemented? | Quality | Issue                                                                                                                       |
| ------------------------------- | ------------ | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Empty (0 in queue)              | Yes          | Good    | Chips with 0 remain clickable, list explains                                                                                |
| Loading                         | Yes          | Good    | Skeletons                                                                                                                   |
| Success (accept)                | Partial      | Poor    | No toast/confirmation observed; row silently leaves queue                                                                   |
| Error (query fails)             | **No**       | Missing | Pull-metadata failure degrades silently (BUG-1); Pulled tab would show (0) with no error banner if the fallback also failed |
| Edge: refunded-but-needs-review | Yes          | OK      | Row shows "Needs review · Refunded" — reviewable                                                                            |

**Dead ends found:** show-details "Entries" tab (no path to management); Completed entries still framed as "PRIMARY WORK".

**Missing error handling:** a hard failure of pull metadata / registration fetch has no visible error state in the Exceptions tabs (counts just read 0 — dangerous on show day).

## Pass 6: Flow Integrity

**Primary flow tested:** triage Needs-review queue → open registration → accept → verify queue/count updates → payment state advances.

| Step | Action                      | Friction                                                                                              | Severity |
| ---- | --------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| 1    | Land on page                | Defaults to Needs review queue — correct                                                              | None     |
| 2    | Open registration           | Row click or "Review registration →"                                                                  | None     |
| 3    | Find accept                 | Hidden in "Actions ⋯"                                                                                 | **High** |
| 4    | Accept All                  | Works; chips update live (8→7, Payment due 0→1 — accepted-unpaid correctly advances to payment queue) | None     |
| 5    | Return to list              | Automatic, but URL keeps `registration=` (BUG-2)                                                      | High     |
| 6    | Next registration           | No "next in queue" affordance; re-scan list                                                           | Med      |
| 7    | Sub-tab switch (Exceptions) | Scroll jumps back to page top; must scroll down again                                                 | Med      |

**Recovery gaps:**

- No undo after Accept All / Reject All (recoverable via status pill, but not communicated).
- Status menu allows flipping a **Completed** (scored) entry back to Pending with no guard/confirm observed.
- Add-entry wizard: Back/Cancel present, Save Draft/Load Draft present — good.

**Flow verdict:** **Completable with friction** — the pipeline itself is sound and the queue math is trustworthy.

---

## Summary

**Overall UX health: Needs Work** — strong redesigned skeleton (queues, chips, focused card, wizard), undermined by a missed deploy, a URL-state bug, hidden primary actions, and an unfinished mobile pass.

### Critical

| Finding                                                                      | Pass | Impact                                                      | Effort      |
| ---------------------------------------------------------------------------- | ---- | ----------------------------------------------------------- | ----------- |
| BUG-1: pull-refund migration not pushed → constant 400s + silent degradation | 5    | Sentry noise now; broken refund reconciliation states       | Deploy only |
| BUG-2: `registration=` param survives Back                                   | 6    | Closed card resurrects on reload/rotate; broken share links | Small       |

### High Priority

| Finding                                                    | Pass | Impact                                                  | Effort    |
| ---------------------------------------------------------- | ---- | ------------------------------------------------------- | --------- |
| Accept/Reject hidden in "Actions ⋯"                        | 3/6  | Slower triage; discovery stall on the #1 secretary task | Small     |
| BUG-5: mobile chips clipped + unreadable rows              | 5    | Page unusable on phones                                 | Med       |
| No error state when exception queries fail (counts read 0) | 5    | Show-day trust hazard                                   | Small–Med |

### Medium Priority

| Finding                                                                                    | Pass | Impact                                             | Effort  |
| ------------------------------------------------------------------------------------------ | ---- | -------------------------------------------------- | ------- |
| Status vocabulary drift (Accepted/Reviewed/Accept entry) + no current-state marker in menu | 1/3  | Terminology confusion                              | Small   |
| BUG-3: "Select below" stale copy                                                           | 1    | Confusing card                                     | Trivial |
| Sub-tab switch scroll-jump to top                                                          | 6    | Repeated scrolling                                 | Small   |
| Show-details Entries tab dead-ends (dup surface, dead `onManageEntries`)                   | 2    | Fragmented workflow (CLAUDE.md consolidation rule) | Small   |
| Completed entry can be reverted without guard                                              | 6    | Accidental unscoring risk                          | Small   |
| No "next in queue" after accept                                                            | 4    | Extra scanning per registration                    | Small   |

### Low Priority

| Finding                                                                                   | Pass | Impact                  | Effort  |
| ----------------------------------------------------------------------------------------- | ---- | ----------------------- | ------- |
| BUG-4 grammar + "1 Entries" aria labels                                                   | 1    | Polish                  | Trivial |
| "View" button label (density only)                                                        | 3    | Minor confusion         | Trivial |
| Paid chip mimics interactive pill                                                         | 3    | False affordance        | Trivial |
| Waitlist cards titled by judge, duplicated look                                           | 2    | Scannability            | Small   |
| Class filter empty under "All Trials"                                                     | 4    | Filter dead-end         | Small   |
| Premium-list card text squeezes one-word-per-line ("Show data has changed since publish") | —    | Visual polish on header | Trivial |

### Quick Wins

- Push migration `20260722160000_add_pull_refund_decisions.sql` to staging.
- Clear `registration` param in the Back handler.
- "1 of 1 Entry currently needs this action" (+ aria "1 Entry").
- Replace "Select below" with "Chosen at approval".
- Promote Accept/Reject out of the overflow menu.

### Recommendations

1. **Deploy BUG-1's migration first** — it is a merged feature silently absent from staging.
2. **Fix the two state bugs (BUG-2, scroll-jump)** — they break the "calm, oriented" feel more than any visual issue.
3. **Run a focused mobile pass** on the queue header and row grid before any show-day use on phones.
4. **Fold the show-details Entries tab into the cockpit** (link, not duplicate) per the consolidation phase rules.

### Test-environment note

An earlier "frozen mid-fade page" symptom during this audit was an artifact of the embedded preview pane throttling `requestAnimationFrame` (framer-motion page transition stuck at opacity 0.27) — not reproducible in a real browser; no action needed.

Seed-data side effects during the audit: one registration (Maya Rivers) was accepted and then reverted to Pending; move-up approval was canceled before commit; nothing else mutated.
