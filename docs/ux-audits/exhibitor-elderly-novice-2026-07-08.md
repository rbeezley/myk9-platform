# Exhibitor Role Journey UX Audit — Persona: elderly-novice

**Date:** 2026-07-08
**Auditor:** Claude (role-journey-ux-audit)
**Account:** e2e-exhibitor@test.myk9.com (seeded demo data)
**Viewports:** Mobile 390×844 (full walk) · Desktop 1280×800 (diff walk) · Tablet 834×1112 + 1112×834 landscape (diff pass)

## Overall experience

The exhibitor surface is structurally sound and often genuinely friendly: the two-step sign-in explains email vs. passcode in plain language, the Add Dog dialog has warm copy ("Not sure of the exact date? An approximate one is fine."), validation errors are inline, and the closed-registration screen explains itself and offers a human escape hatch ("Message the show team"). The layout is consistent across mobile and desktop (persistent sidebar, same components), so the desktop pass found few unique issues.

What breaks the persona is **inconsistent data storytelling**, especially about money. Three surfaces tell three different payment stories at the same moment (an entry chip says "Payment Due," the dashboard stat says "$240 Current Fees · Paid in full," and My Payments says "$0.00 due — paid up"). Entry counts disagree everywhere (9 vs 13 vs 0). Dates shift by one day between pages. An elderly novice doesn't debug discrepancies — they either panic about owing money or lose trust and phone the secretary. The second systemic issue is **role-voice leakage**: the check-in dialog and the Show day area speak to show staff ("Exhibitor has checked in," "enter the passcode your secretary gave you"), not to the exhibitor herself. Tablet added real width bugs (clipped stat tiles, a landscape heritage page that renders as a giant blank monogram).

The core "enter a show in 30 seconds" flow **could not be exercised**: the seed data's only show has entries closed. A future run needs an open show seeded.

## Regression line

**Baseline run — no prior report exists** (`docs/ux-audits/` created this run). Findings: **17 NEW / 0 STILL-OPEN / 0 RESOLVED**.

## Top 5 to fix first

1. **Contradictory payment status across three surfaces** (entries chip "Payment Due" vs stats "Paid in full" vs Payments "$0.00 due") — money anxiety is the fastest way to lose this persona.
2. **Cart lets you pay for a closed show, and the cart is unreachable from any nav** — a stale cart with a live "Pay $32.10 and confirm entry" button is a costly-mistake trap.
3. **Entry counts disagree everywhere** (9 vs 13; "Entered as exhibitor 0"; show page "0 Entries received"; "Willow 3 upcoming classes" vs "No upcoming entries for Willow").
4. **"Show day" nav dead-ends exhibitors with worker jargon** ("You don't have ringside access… enter the passcode your secretary gave you").
5. **Date off-by-one on the heritage show page** ("Jul 31 – Aug 2" vs "Aug 1–3"; closes "Jun 30" vs "closed on 7/1") — a wrong show date is a missed show.

## Findings

| # | Severity | Reg | Tag | Viewport(s) | Path & screen | What confused elderly-novice | Why it's a problem | Concrete fix |
|---|----------|-----|-----|-------------|---------------|------------------------------|--------------------|--------------|
| 1 | High | NEW | buildable | all | `/exhibitor/entries` + stats pill + `/exhibitor/payments` | Entry card says "Payment Due"; expanded stats say "Current Fees $240 · Paid in full"; Payments says "$0.00 due — Current entries are paid up" | Three contradictory money messages at once. Persona assumes she owes money she can't figure out how to pay, or stops trusting the app | Single fee-status source of truth. Reconcile the entry-status chip semantics (see the 'paid'-bucket decision: 'paid' entries deliberately stay "pending review" — the *payment* chip must not inherit that) |
| 2 | High | NEW | buildable | all | `/exhibitor/entries` entry card with "Payment Due" | Chip says payment is due but the card's only actions are "View Show" and "Message the show team" | If money is genuinely owed, the task "pay it" is impossible from where the debt is announced | If amount due > 0, show a "Pay now" action on the card deep-linking into the payment flow; if nothing is actually due, don't show the chip |
| 3 | High | NEW | buildable | all | `/cart` | Cart held a week-old draft entry (Codex Maple) with an enabled "Pay $32.10 and confirm entry" button — for a show whose entries closed Jun 30. No cart icon exists anywhere in nav | Costly-mistake trap: novice could pay for an un-acceptable entry (server rejection unverified — audit did not click Pay). And since nothing links to /cart, stale carts are invisible until stumbled upon | Disable pay + explain when the target show's entries are closed; auto-expire cart items at close date; add a cart affordance (badge) whenever the cart is non-empty |
| 4 | High | NEW | buildable | all | `/exhibitor/entries`, `/shows`, show detail, dog page | "9 entries" (stats) vs "My Entries 13" (tabs); Shows page tab "Entered as exhibitor **0**"; show detail "**0** Entries received"; dog card "Willow — 3 upcoming classes" vs Willow's page "No upcoming entries" | Numbers that disagree destroy trust; persona can't tell which is true, and "Entered as exhibitor 0" tells her she has no entries when she has 13 | Audit each counter's query scope (entries vs classes, per-show vs global, status filters) and make labels say what they count ("13 class entries"); fix the entered-shows and dog-upcoming queries |
| 5 | High | NEW | buildable | all | `/shows/:id` (heritage landing) | Dates show "Jul 31 – Aug 2" while list card and entry cards say "Aug 1(–3)"; closes "Jun 30, 2026" vs list "closed on 7/1/2026" | One-day-off show dates cause real missed shows; classic UTC-vs-local rendering bug | Render show/trial dates through the trial-timezone helpers (`getTrialTimezone`) everywhere on the heritage landing; never `new Date('YYYY-MM-DD')` in local time |
| 6 | High | NEW | buildable | all | Sidebar "Show day" → `/at-show/:showId` | Sidebar promises "Find check-in, run order, and show-day details"; page says "You don't have ringside access… Enter the passcode your secretary gave you" | Dead end in worker jargon. Exhibitor check-in actually lives on `/exhibitor/entries`; persona has no idea what a passcode is | Either give entered exhibitors a read-only show-day view (run order, their check-in) or route exhibitors from that nav item to their entries' show-day info; rewrite the gate copy for non-workers |
| 7 | Medium | NEW | buildable | all | Check-in dialog on `/exhibitor/entries` | Third-person staff copy ("Exhibitor has checked in and is ready"); header shows "Armband #745FA6C2" (that value is the *confirmation* number elsewhere) plus her own email; staff statuses "Conflict" and "Pulled" are selectable; subtitle ends "Interior Advanced #" with nothing after the # | Reused secretary dialog leaks staff mental model; persona doesn't know if "At Gate" is something she claims or is told; wrong label ("Armband") teaches her the wrong vocabulary | Exhibitor-voice variant: first-person labels ("I'm here / I'm at the gate"), hide Conflict/Pulled for exhibitors, label the number correctly, drop the dangling "#" |
| 8 | Medium | NEW | buildable | all | `/dogs` after deleting a dog | After confirming Delete, she lands back on `/dogs` and the deleted dog is **still in the list** until a manual reload | "Did it work?" — the one question a UI must never leave open after a destructive action | Invalidate/refetch the dogs list on delete success (React Query invalidation), plus a success toast |
| 9 | Medium | NEW | buildable | tablet (834px) | `/exhibitor/entries` stats row + dog cards | Stat tiles clip mid-word ("UPCOMING SHO…", "$240" cut at the edge); dog card row cuts off mid-card with no scroll hint | Content looks broken/truncated; touch users don't discover horizontal scroll without an affordance | Let the stats grid wrap at intermediate widths; add scroll affordance (fade/peek) to the dog-card rail |
| 10 | High | NEW | buildable | tablet landscape (1112×834) | `/shows/:id` (heritage) | Page renders as a huge cream-colored "A" monogram filling the viewport; all content below the fold — looks blank/broken | Persona assumes the page failed and leaves; the monogram is decoration, not content | Cap the heritage hero/monogram height at short-viewport breakpoints so title + facts are visible above the fold (heritage *style* is intentional; the blank fold is not) |
| 11 | Medium | NEW | buildable | all | Dashboard "Enter a Show" → `/shows` | The promoted CTA leads to a list where the only show is "Entries Closed"; no guidance about what to do next | The single most-promoted action ends in a soft dead end | Empty/none-enterable state on /shows: "No shows are open for entries right now" + what to expect next. (Also an audit-infra gap: seed an open show so the entry wizard can be walked) |
| 12 | Low | NEW | buildable | all | Add Dog → `/dogs` list | Breed was never asked in the Essential tab, then the list shows "Mixed Breed" (card) or "Unknown" (elsewhere) for the same dog | Silent inconsistent defaults; novice wonders if she did something wrong | Pick one placeholder ("Breed not set") and render it consistently; nudge toward Registration tab for AKC entries |
| 13 | Low | NEW | cosmetic-only | all | Entry card class rows | Chip reads "Trial Saturday Trial" | Reads as a stutter; the word "Trial" is both prefix and part of the name | Render just the trial name, or "Trial: Saturday" |
| 14 | Low | NEW | cosmetic-only | desktop | Account menu | "Developer" menu item shown to an exhibitor | Jargon item the persona should never see | Hide behind dev flag / admin role (verify it isn't already dev-mode-only) |
| 15 | Low | NEW | buildable | all | `/shows/:id` facts panel | "Venue: TBA" while the shows list and entry cards display the full Tulsa street address | Contradiction; also directions exist elsewhere | Heritage venue field should fall back to the show's address record |
| 16 | Low | NEW | cosmetic-only | n/a | `/exhibitor/entries/history` | Route from the audit-pages inventory returns 404; grep shows nothing links to it | Not user-reachable — stale route inventory, not a user bug | Remove the route from the `audit-pages` skill inventory (or restore the page if history is meant to exist) |
| 17 | Low | NEW | cosmetic-only | all | Dog detail page | 5 of 8 tabs are Premium-locked (Title Progress, Statistics, Health, Training, Pedigree) plus a sidebar upsell card | Upsell density reads as "everything is behind a paywall" to a novice | Intentional monetization — flagging density only; consider collapsing locked tabs into one "Premium" group. No change without product approval |

## Responsive / cross-breakpoint notes

- **Mobile vs desktop:** near-identical component tree; no hover-only actions found on the exhibitor journey (all card actions are persistent buttons — good). Desktop pass added only #14.
- **Tablet portrait (834px)** inherits mobile plus #9 (clipped stat tiles, cut-off dog rail).
- **Tablet landscape / short viewports** trigger #10 (heritage monogram consumes the fold).
- Sign-in, dogs list, cart, payments: "inherits mobile/desktop; no new issues."

## What worked well (keep)

- Two-step sign-in with plain-language email-vs-passcode explanation and "Learn how it works."
- Add/Edit Dog dialog: warm copy, inline validation, Save disabled until dirty, delete confirm with "cannot be undone."
- Closed-registration screen: honest explanation + "Message the show team" escape hatch.
- My Payments: the clearest money story in the app (amount due, history, receipts).
- Per-entry "Get directions" deep link into Google Maps.

## Method notes / limitations

- Entry wizard (dog → class → payment) not exercised: no open-entry show in seed data. The cart's Pay button was **not** clicked (live Stripe path).
- Playwright-test MCP unusable in this worktree (dual playwright versions); walk driven via playwright-cli.
- Created + edited + deleted a test dog ("Audit Pup"); check-in toggled and reverted. Data left as found.
