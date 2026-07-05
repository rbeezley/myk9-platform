# UX Audit: myK9Show Exhibitor Journey — Elderly Low-Tech Persona (Claude walk)

> **Status:** Remediated — verified 2026-07-05

**Date:** 2026-07-02
**Auditor:** Claude (browser walk via playwright-cli, desktop 1280×720)
**Sources:** Live walkthrough on `http://localhost:5173` as `e2e-exhibitor@test.myk9.com`; `docs/INTENT.md`; cross-referenced against `docs/audits/2026-07-01-secretary-journey-ux-audit.md` (inconsistency IDs C1–C7) and the Codex exhibitor audit `docs/audits/2026-07-02-exhibitor-elderly-ux-audit.md`.
**Persona:** Retired elderly exhibitor, no computer skills. Judged against INTENT.md's exhibitor intent word — *"This respects my time"* — and the "Could my mom use this?" litmus test.
**Tasks completed:** Signed in, added a new dog (**Buddy**, Golden Retriever, AKC SR12345678), entered him in Container Novice A at Heartland Scent Work Classic (cash at show), then walked My Shows, My Dogs, dog profile, My Stats, My Payments, Ringside, account menu, and global search.

**Known issues honored (not re-litigated):** tapping a ringside entry card queues a failing `ringside_update_entry` write (known, reproduced ×2 previously — entry cards were deliberately not tapped on this walk); the wizard Step-1 silent-Next was fixed on `main` (#1073) and the fixed behavior (disabled Next with visible explanation) was observed working.

**Post-remediation verification (2026-07-05, Codex):** The Critical/High exhibitor findings tracked by `docs/archive/plan-ux-walk-remediation-2026-07.md` were remediated and rechecked with focused unit coverage, `pnpm typecheck`, `pnpm lint`, `src/test/e2e/entry-intent-sign-in-redirect.spec.ts`, `src/test/e2e/registration/singleDogSingleClass.spec.ts`, `src/test/e2e/shell-integrity-responsive.spec.ts`, and `src/test/e2e/a11y-smoke.spec.ts` on Chromium. The historical findings below remain as the original audit evidence.

**Merge note (2026-07-02):** After a review of the Codex exhibitor audit, findings I agree with but missed on my walk have been folded in below, tagged **[Codex]**. Codex walked mobile and the signed-out entry path; I walked desktop signed-in — the two are complementary, and the [Codex] items are adopted on judgment, not independently reproduced unless noted.

---

## Walkthrough summary

The core journey is **completable** — sign-in is genuinely good, Add Dog is short, and the wizard flows end to end. But the walk surfaced two Critical money/trust hazards (a stale cart that silently re-charges an already-entered class; a brand-new entry rendered as a failed "NQ" result on the dog's profile), one systemic interaction trap (hover-only sidebar whose backdrop eats the next click), and a family of same-fact-different-value contradictions that directly parallel the secretary audit's C-series.

### New exhibitor-side inconsistency IDs (E-series), with C-series cross-references

| ID | Same fact | Value A | Value B | Cross-ref |
|----|-----------|---------|---------|-----------|
| E1 | Buddy's new entry | My Shows dog card: "1 upcoming class" | Dog profile Activity: "No upcoming entries for Buddy" **and** the same entry listed under "Recent results" as **Fri Jul 31 · 0:00.00 · NQ** | **Confirms C2** (Jul 31 vs Aug 1 off-by-one lives in the dog-profile results formatter too) + new status misclassification |
| E2 | Entry counts | Stat card: "ENTRIES **9** — **2 accepted** · 7 pending" | List below: "MY ENTRIES **10**"; tabs "Accepted **1**", Pending 7, Upcoming 10 | **Confirms the C1 pattern** (count definitions drift between summary and destination) — exhibitor-side instance |
| E3 | Waitlist state | "Waitlist" tab: **0** | "My Wait List Positions" widget on the *same page*: Juni **#1**, Interior Advanced | New (C1-family, same page) |
| E4 | Ranger's Exterior Excellent entry | "Where to be & when" run schedule: **"Upcoming"** | "Ranger's entries" section on the *same page*: **"Withdrawn · Refunded"** | **Confirms the C4 pattern** (status drift), exhibitor-side, single page |
| E5 | Money totals | My Shows: "CURRENT FEES $270 / Amount due $120" | My Payments: "Total paid **$66.30**" above rows summing **$96.30**, both marked "Paid" (a $30 refund is silently netted, no refund row) | **Confirms the C5 pattern** ("collected/paid" without qualifiers) |
| E6 | Judge assignment | Secretary setup: "Test Judge — 5 classes assigned" (per secretary audit) | Every exhibitor run-schedule row: "Judge TBD" | **Confirms C3** from the exhibitor's seat |
| E7 | Entry identifier | Wizard confirmation: "Entry **#MK9-000056**" for Buddy | Same number issued to Codex Daisy's earlier submission (per Codex audit); My Shows relabels it "Registration #MK9-000056" | New — number reuse across submissions + Entry#/Registration# terminology drift |
| E8 | Show dates on desktop | Browse list, show header, wizard confirmation all said **Aug 1–3** | — | **C2 did NOT reproduce** on these surfaces this walk; the only Jul 31 sighting was E1's dog-profile formatter |

---

## Pass 1: Mental Model Alignment

**What UI suggests:** "Find a show, enter your dog, pay (or promise to pay at the show), then watch for your results."

**What it actually does:** The flow completes, but several surfaces tell the user things that aren't true or aren't in their vocabulary: a not-yet-run entry is displayed as a failed result, a cash promise is nagged with "Finish Payment," and the "Confirmation" wizard step commits *before* the promised review.

**Misalignment gaps:**

| UI Element | User Expects | Actually Does | Severity |
|------------|--------------|---------------|----------|
| Dog profile "Recent results" | Empty until Buddy runs | Shows the 5-minute-old entry as **"Fri Jul 31 · 0:00.00 · NQ"** (E1) | **Critical** |
| Wizard step 3 "Confirmation — Review and confirm" | A final review screen with a "Submit" moment | Entry is already submitted on arrival; Next on the Payment step was the commit | High |
| "Cash (pay at show)" | "I'm done; I bring cash to check-in" | My Shows shows a **"Finish Payment"** link + "Payment Due" chip (confirms Codex finding) | High |
| Cart badge "1" before choosing anything | "I haven't picked anything yet" | Stale item from a previous session is pre-loaded and pre-charged in the summary ($60 not $30) | **Critical** (money) |
| "Manage Entry" button on show header | Manage an existing entry | Opens the *registration wizard* to add new entries | Medium |
| "Ringside" nav item | "Show-day info about my dog" | Access-denied dead end without a passcode (see Pass 5) | High |
| "My Stats" nav item | My dog statistics | "Analytics — coming soon" placeholder; page heading also disagrees with nav label | Medium |
| Green check icons on untouched "Registration"/"Additional" tabs in Add Dog | "Someone already completed these" | They mean "valid/optional-ok" | Low |
| "Entries Close: Sep 1" on an Aug 1–3 show | Entries close before the show | Reads as after the show ends (seed data or close-date logic) | Medium |
| Signed-out "Enter this show" **[Codex]** | Sign in, then continue entering that show | Lands on `/exhibitor/entries`; the entry intent is lost (consistent with my observation that sign-in always lands there) | High |
| Card payment at wizard step 2 **[Codex]** | Stay in the wizard through "Confirmation" | Hands off to `/cart` with a countdown timer — a route and time-pressure change mid-flow | High |
| Skipping the Registration tab in Add Dog **[Codex, corroborated]** | Dog has no breed yet | Dog is silently labeled **"Mixed Breed"** (Codex Daisy displays this without anyone choosing it) | Medium |

**Jargon found:** "Finish Payment" (for cash), "Registration #Pending", raw Stripe IDs (`pi_3TmybYAIej2Q9UtX…`) as a visible table column, "Reset Data", "Clear Cache", "⌘K", landing-page "Local-first PWA". The dog-show vocabulary itself (call name, entry blank, armband, premium) is well chosen — the jargon problem is software-speak, not sport-speak.

---

## Pass 2: Information Architecture

**Current structure:**

- Sidebar (exhibitor role): My Shows / My Dogs / My Stats / My Payments / Ringside / Find Shows
- My Shows = greeting + 4 stat cards + My Dogs strip + entries list (6 status tabs) + waitlist widget
- Show detail = header card + Overview / Trials / My Entries / Classes / Results tabs
- Dog profile = Activity + Registrations + Competitions + 5 premium-locked tabs

**IA issues:**

| Issue | Location | Problem | Recommendation |
|-------|----------|---------|----------------|
| Icon-only sidebar | Every page | Labels exist only in a hover flyout — an elderly mouse user sees six unlabeled glyphs; hover is explicitly forbidden by INTENT.md ("no hover-only interactions") | Show labels persistently (or auto-expand on desktop widths); make flyout click-toggled |
| Duplicate waitlist surfaces disagreeing | My Shows | Tab says 0; widget says #1 (E3) | One waitlist surface; the tab should be the widget's filter |
| Same entry, two statuses | Show detail "My Entries" | Run schedule lists a withdrawn entry as Upcoming (E4) | Run schedule must exclude withdrawn entries (single source for status) |
| Stat cards vs list tabs | My Shows | 9 vs 10 entries, 2 vs 1 accepted (E2) | Derive card numbers from the same query/filters as the tabs, or label the difference |
| Admin actions in exhibitor search | ⌘K dialog | "Users — View all people", "Add New User", "Add New Show" (confirms Codex) | Scope command palette to role permissions |
| "Development Tools" in account menu | Account dropdown | "Reset Data" / "Clear Cache" visible to an exhibitor — terrifying and dangerous for this persona | Verify dev-build gating; never ship; even in dev, bury behind a flag |
| Mobile Browse Shows exposes staff table tools **[Codex]** | `/shows` on mobile | Columns / Export CSV / Compact density / Reset view visible to exhibitors, with horizontal clipping | Default exhibitors to simple cards; table tools only in explicit table mode |
| Duplicate profile surfaces **[Codex]** | `/profile` and `/account` | Two places edit similar personal info | One primary profile surface; link from account |
| Advanced settings alongside basics **[Codex]** | `/account` | Export/import/reset, Data & sync, Devices, Delete account sit next to everyday profile fields | Group under "Advanced settings" with plain warning copy |
| Two show-day routes **[Codex]** | `/at-show`, `/exhibitor/show-day` | One redirects, one denies without recovery; "Ringside" naming reads staff-facing to exhibitors | Exhibitor-facing nav label "Show day"; keep judge/steward ringside separate |

**Visibility problems:**

- Hidden but should be visible: sidebar labels; a "remove item" control on the Payment summary; the passcode entry on the ringside denial screen; a refund row in My Payments.
- Prominent but should be secondary: armband-lookup box in the show-detail breadcrumb row (a steward tool); Stripe payment-intent IDs; keyboard chord hints ("G D", "C P") in search.

---

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element | Looks Like | Actually Is | Clear? |
|---------|------------|-------------|--------|
| Sidebar icons | Decorations/status glyphs | The app's entire navigation | **No** |
| Sidebar flyout backdrop | (invisible) | A full-page click-eater: the first click after hovering the sidebar is swallowed — reproduced on "Add Dog" (click did nothing, page state unchanged) | **No** |
| Photo circle in Add Dog | A paw-print picture | The photo-upload button (no accessible name, no "Add photo" text) | **No** |
| "Withdraw" on waitlist widget | Plain text label | A destructive button | No |
| "Finish Payment" on a cash entry | Required action | Optional (and wrong for cash) | **No** |
| "Manage Entry" | Edit one entry | Opens the registration wizard | No |
| Disabled "Next" + status line on Payment step | — | Explains exactly what's blocking ("Please review and agree…") — the #1073 pattern, working | **Yes** (positive) |
| Sign-in smart field | One box for two credential types | Detects email and says "we'll ask for your password next" | **Yes** (positive) |

**False affordances:** green "complete" checks on untouched optional Add-Dog tabs.

**Hidden affordances:** breed dropdown supports keyboard type-ahead but shows no search box (204 options to scroll otherwise); sidebar labels behind hover.

**Recommended fixes:**

- Persistent sidebar labels (also fixes the flyout click-eater by removing the overlay). Same rule on mobile: label + icon nav, never icon-only rail **[Codex]**.
- Name and label the photo-upload button ("Add photo").
- Turn "Finish Payment" into "Payment: cash at check-in" (status, not CTA) for cash/check entries.
- Add a visible search input inside the breed picker.
- Explicit "View show" / "Enter show" buttons on show list rows in table view — rows are clickable but nothing says so **[Codex]**.
- Label the Add Dog tabs "Optional details" so they don't read as required steps **[Codex]**.

---

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step | Decisions Required | Can Be Reduced? |
|-------------|--------------------|-----------------|
| Sign-in | 1 (email) + 1 (password) | Already minimal; helper copy is excellent |
| Add Dog (Essential) | 3 required fields + optional photo | Good. Breed, however, requires discovering the Registration sub-modal (2 extra layers: tab → nested modal → org-then-breed) |
| Wizard Step 1 | Pick dog tab × pick classes | Good — but the user must first *notice and undo* a stale cart item they never chose |
| Wizard Step 2 | Payment method + agreement | Good; plain-language method descriptions |
| My Shows (reading) | Reconcile 6 status vocabularies: Submitted / Pending Review / Payment Due / Paid / Accepted / Upcoming — plus "Finish Payment" | One entry card currently wears up to 4 chips; compose a single status line |

**Missing defaults:**

- Owner/handler defaulting to "You" is exactly right (positive).
- Breed should never silently default to "Mixed Breed" when the Registration tab is skipped — ask, or say plainly "you can add breed later" **[Codex, corroborated]**.
- Registration should start focused on the dog just created or the dog in context, with a nudge like "Dog saved. Enter a show with Buddy." **[Codex]**
- Date of birth needs a visible format hint for non-native pickers **[Codex]**.

**Unnecessary complexity:**

| Complexity | Who Needs It | Recommendation |
|------------|--------------|----------------|
| Nested modal for registration/breed | Registered-dog owners | Consider promoting Breed to Essential (dogs have breeds regardless of paperwork); keep registration numbers in the sub-form |
| 6 entry-status tabs with drifting counts | Power exhibitors | Collapse to All / Needs something from you / Done |
| Chord hints (⌘K, "G D") | Power users | Harmless if kept, but don't rely on them for reachability |
| Cart countdown timer **[Codex]** | Nobody in this persona | Time pressure panics slow users; extend/remove for entry flows |
| Full legal agreement rendered inline at the payment step **[Codex]** | Everyone must accept it | Contain it in a scrollable box so the payment controls and checkbox stay visible |

**Cognitive load score:** **Medium** — individual screens are calm and well-labeled; the load comes from *reconciling contradictory numbers and statuses between screens*, which is exactly the load this persona cannot carry.

---

## Pass 5: State Coverage

### My Shows

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| Empty | Yes | Good | "Your dogs are ready — let's find a show" + CTAs is model copy; "Add **Another** Dog" label is odd in an empty state |
| Loading | **No** | **Missing** | Main area is a **blank white void for several seconds** (caught on screenshot); persona verdict: "it's broken" |
| Success | Yes | Poor | Contradictory counts/chips (E2, E3) |
| Error | Not observed | — | — |

### Dog profile (Buddy)

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| Upcoming-entry state | Yes | **Wrong** | Says "No upcoming entries" while an entry exists (E1) |
| Results state | Yes | **Wrong** | Unscored future entry shown as "0:00.00 · NQ", dated Jul 31 (E1 / C2) |

### Ringside

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| Access denied | Yes | **Dead end** | Two paragraphs, **zero interactive elements** — no passcode field, no back link, nothing. The previous screen invited the user here ("Coming up → Heartland") |

### Registration wizard

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| Blocked Next | Yes | Good | Visible explanation (#1073 fix confirmed working) |
| Submitted | Yes | Poor | Auto-submits at "Confirmation"; three exits (Back / Return to dashboard / Finish) with unclear differences; "Back" from a submitted state is available; "Finish" lands on show detail rather than the new entry's status **[Codex, corroborated]** |
| Draft | Partial | — | Save Draft / "Load Draft (0)" buttons present; untested this walk |

### Add Dog

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| Success | Yes | Poor | Modal closes and the card appears, but there is no durable "Dog saved" confirmation with a next action ("Enter a show with Buddy") — low-confidence users need the reassurance **[Codex]** |
| Error | Yes | Mixed | Gender validation can fire while merely opening the dropdown **[Codex]** |

**Dead ends found:** Ringside denial screen (total); My Stats "coming soon" (soft — no back CTA needed since sidebar remains, but it's a permanent nav item to nowhere).

**Missing error handling:** the wizard fired a **silent 409 on `rest/v1/enrollments`** during submission — UI showed success and the entry did save, but nothing surfaced; worth an engineering look (idempotent-insert conflict?).

---

## Pass 6: Flow Integrity

**Primary flow tested:** Sign in → add new dog → enter him in a class → pay cash at show → verify entry.

**Step-by-step findings:**

| Step | Action | Friction | Severity |
|------|--------|----------|----------|
| 1 | Landing → "Sign in" | Clear link; marketing jargon harmless here | None |
| 2 | Smart credential field | "Looks like an email — we'll ask for your password next" — excellent | None (exemplary) |
| 3 | Password step | Edit-email affordance, show-password, forgot link | None |
| 4 | Land on My Shows | Blank main area during load; then greeting "Test, end strong tonight." (first name + odd motivational copy) | Medium |
| 5 | Sidebar → My Dogs | Icon-only nav; labels require hover | High |
| 6 | Click "Add Dog" | **First click swallowed** by the sidebar-flyout backdrop; second click worked | High |
| 7 | Fill Essential tab | 3 fields, clean; unlabeled photo button; green checks on untouched tabs | Low |
| 8 | Add registration (breed) | Nested modal; org-first-then-breed is logical; 204-breed list has no visible search | Medium |
| 9 | Create Dog | Instant; Buddy card appears with AKC number. No toast, but list state change is obvious enough | Low |
| 10 | Find Shows → show detail | Dates consistent (E8); "Entries Close Sep 1" oddity; wall of "TBD"/"No #" chips | Medium |
| 11 | "Manage Entry" → wizard | Label mismatch, but discoverable | Medium |
| 12 | Step 1: select class | Buddy's tab pre-selected; **stale cart item pre-charged** ($60 total); no "already entered" badge on Codex Daisy's checked class; removal requires Back → her tab → uncheck | **Critical** |
| 13 | Step 2: payment | Plain-language methods; agreement gate explains itself | None (positive) |
| 14 | Step 3: "Confirmation" | Already submitted on arrival — no review moment; entry # duplicates a previous submission's (E7) | High |
| 15 | Verify on My Shows | Entry present — but chip soup + "Finish Payment" on a cash entry | High |
| 16 | Verify on dog profile | **Entry shown as a failed NQ result dated Jul 31** (E1) | **Critical** |

**Abandonment risks:**

- Step 6: "I clicked and nothing happened" — this persona doesn't retry; they conclude they did something wrong.
- Step 12: a $60 total for a $30 decision — this persona either pays double or gives up; noticing *and* knowing how to remove the stale item requires expert navigation.
- Step 16: seeing "NQ" on their brand-new entry, this persona calls the secretary (or re-enters and double-pays).

**Recovery gaps:**

- No remove control on the Payment summary (must navigate back to per-dog tabs).
- No undo after auto-submit at "Confirmation" — and a "Back" button that implies there is.
- Ringside denial has no back/recovery affordance at all.
- Sign-in does not preserve `redirectTo` for an in-progress entry — the single biggest thread-break in the golden path **[Codex]**.
- Wizard "Cancel" doesn't say where it will take you **[Codex]**.

**Flow verdict:** **Completable with friction** — and with two money/trust traps that this persona specifically will fall into.

---

## Summary

**Overall UX health:** **Needs Work** — the bones are good (sign-in, wizard gating copy, empty states, payment-method language are all *better* than typical), but same-fact contradictions and two Critical traps undercut the exhibitor intent word: *"This respects my time."*

### Critical (fix immediately)

| Finding | Pass | Impact | Effort |
|---------|------|--------|--------|
| Future, unscored entry rendered as "Fri Jul 31 · 0:00.00 · NQ" on dog profile while "Upcoming" says none (E1; confirms C2 formatter in results list) | 5/6 | User believes the dog already failed; drives support calls and double entries | Med — fix results query to exclude unscored/future entries + fix date-only UTC parse |
| Stale cart items silently pre-charged in a new wizard session; no duplicate-entry guard; no removal on summary (E-cart) | 6 | Double payment by the least-equipped users | Med — clear submitted items from cart; badge already-entered classes; add remove-per-line on summary |
| Signed-out "Enter this show" loses intent through sign-in — lands on My Shows, not registration **[Codex]** | 1/6 | Users cannot reliably continue the core entry task | Med — preserve `redirectTo=/shows/:id/register`; sign-in copy "Sign in to enter Heartland…" |

### High Priority

| Finding | Pass | Impact | Effort |
|---------|------|--------|--------|
| Icon-only sidebar; labels hover-only (INTENT violation) | 2/3 | Primary nav illegible to persona | Low–Med |
| Sidebar flyout backdrop eats the next click (reproduced on "Add Dog") | 3 | "Nothing happened" abandonment | Low |
| "Finish Payment" + "Payment Due" on cash/check entries (confirms Codex) | 1 | Users think their entry is incomplete | Low — status copy per method |
| Count/status contradictions on one screen: E2 (9 vs 10, 2 vs 1), E3 (waitlist 0 vs #1), E4 (Upcoming vs Withdrawn) | 2 | Trust erosion — the C1/C4 disease on the exhibitor side | Low–Med each |
| Ringside denial dead end (no passcode input, no back) | 5 | Stranded persona | Low |
| "Confirmation" step auto-submits; no review moment; 3 ambiguous exits | 6 | Loss of control at the money moment | Med |
| Money presentation: $270/$120 unexplained; "Total paid $66.30" vs rows $96.30; Stripe IDs (E5) | 1/2 | Money confusion (C5 pattern) | Low — show refund rows, hide `pi_` IDs, explain due |
| "Development Tools: Reset Data / Clear Cache" in exhibitor account menu | 2 | Catastrophic mis-click potential — verify dev-gating | Low |
| Card-payment path exits the wizard to `/cart` with a countdown timer **[Codex]** | 1/6 | Route + time-pressure change at the money moment | Med |
| Mobile: icon-only nav rail; Browse Shows exposes staff table tools with clipping **[Codex]** | 2/3 | Mobile is this persona's likely primary device; first entry path feels broken/technical | Med |

### Medium Priority

| Finding | Pass | Impact | Effort |
|---------|------|--------|--------|
| My Shows loading = blank white main area | 5 | "It's broken" | Low — skeleton |
| "Judge TBD" on all rows while judges are assigned (E6; confirms C3) | 1 | Wrong info pre-show | Med (same fix as C3) |
| Entry #/Registration # reuse + terminology drift (E7) | 1 | Un-referenceable entries | Med — verify numbering scheme |
| Breed picker: 204 options, no visible search | 4 | Long scroll for persona | Low |
| "My Stats" → coming-soon page; label drift (Stats/Analytics) | 1 | Dead nav item | Low — hide until built |
| Admin-scoped search results/actions for exhibitors | 2 | Confusion + apparent permission leak | Med |
| "Entries Close: Sep 1" after an Aug 1–3 show | 1 | Nonsense date | Low (likely seed data; verify close-date validation) |
| "Manage Entry" label opens the wizard | 1 | Wrong expectation | Low — "Enter this show" / "Add or change entries" |
| Add Dog: one required page first; label other tabs "Optional details" **[Codex]** | 4/6 | Tabs read as required work; reduces uncertainty | Med |
| Legal agreement rendered as a huge inline block at payment **[Codex]** | 4/6 | Users lose the payment controls and checkbox | Low–Med — contained scroll area |
| `/profile` vs `/account` duplicate editing surfaces; advanced/destructive settings beside basics **[Codex]** | 2 | Two places to do one thing; scary options too close | Med |
| Silent "Mixed Breed" default when registration skipped **[Codex, corroborated]** | 1/4 | Dog mislabeled without user choice | Low |
| "Finish" on confirmation goes to show detail, not the new entry **[Codex, corroborated]** | 6 | "Did it work?" moment lands on the wrong page | Low — primary "View my entry", secondary "Back to show" |

### Low Priority

| Finding | Pass | Impact | Effort |
|---------|------|--------|--------|
| Unlabeled photo-upload button (also an a11y miss) | 3 | Discoverability | Low |
| Green checks on untouched optional tabs | 1 | Mild false signal | Low |
| Waitlist "Withdraw" styled as plain text | 3 | Low-affordance destructive action | Low |
| Greeting copy ("end strong tonight") + first-name "Test" | 1 | Odd tone | Low |
| TBD/No-# chip wall on run schedule | 4 | Noise pre-show | Low — "Times posted closer to show day" |
| No durable "Dog saved" toast with next action **[Codex]** | 5 | Reassurance for low-confidence users | Low |
| DOB format hint for non-native pickers **[Codex]** | 4 | Form hesitation | Low |
| "Ringside" → "Show day" for exhibitor-facing nav **[Codex]** | 1 | Friendlier terminology | Low |

### Quick Wins (high impact, low effort)

1. Persistent sidebar labels — kills two High findings (illegible nav + click-eater) in one change.
2. Cash/check status copy: replace "Finish Payment" link with "Bring $30 cash to check-in" text.
3. Skeleton loader on My Shows.
4. Exclude withdrawn entries from "Where to be & when" (E4).
5. Hide `pi_…` IDs behind a "Receipt" link; add refund rows (E5).
6. Passcode input + back link on the ringside denial screen.
7. Sign-in redirect: preserve the registration URL and show "Continue entering Heartland Scent Work Classic" **[Codex]**.
8. Confirmation exits: primary "View my entry", secondary "Back to show" **[Codex]**.
9. Mobile Browse Shows: hide Columns / Export CSV / Compact density / Reset view unless table mode is explicitly chosen **[Codex]**.

### Recommendations

1. **Declare war on same-fact drift.** E1–E7 here plus C1–C7 on the secretary side are one disease: multiple queries/formatters answering the same question differently. A shared selector layer (one "entry status" derivation, one date formatter, one count source) fixes both audits at once. The date formatter behind C2 is confirmed still broken in at least one place (dog-profile results).
2. **Make the wizard's money moment safe:** empty the cart of submitted items, badge already-entered classes, keep a real review step (or rename step 3 to "Receipt").
3. **Run the INTENT.md litmus test on the shell, not just pages:** the sidebar, search palette, and account menu are all shared chrome that currently fails "Could my mom use this?" — hover-only labels, admin commands, and Reset Data are shell-level regressions that no page-level polish can compensate for.
4. **Keep the golden path one continuous thread** **[Codex]**: find show → sign in → add dog if needed → enter class → submit → view entry, with no mid-task detours to generic dashboards or the cart. The redirect fix, the wizard/cart unification, and the "View my entry" confirmation exit are all one theme.
5. **Treat mobile as this persona's primary device** **[Codex]**: labeled navigation, simple cards, large touch targets, no clipped toolbars — desktop polish alone won't reach the audience.

### Cross-audit consensus

- **Confirms Codex exhibitor audit:** cash "Finish Payment" confusion; My Stats dead end; admin-scoped search; ringside passcode wall (this walk found it has *zero* interactive elements — worse than reported); jargon inventory substantially overlaps.
- **Adopted from Codex (agreed on judgment; not independently reproduced unless marked corroborated):** signed-out enter-show intent lost through sign-in; card path exits wizard to `/cart` + countdown timer; all mobile findings (icon rail, staff table tools on Browse Shows, clipping); `/profile` vs `/account` duplication and advanced-settings placement; silent "Mixed Breed" default (corroborated — Codex Daisy displays it unchosen); inline legal-agreement wall; "Finish" → show detail instead of the entry (corroborated); no durable dog-saved confirmation; gender-validation-on-open; DOB format hint; "Show day" naming.
- **Not adopted from Codex:** "Back to dashboard → `/`" as a false affordance — verified this walk that `/` redirects signed-in users to My Shows, so the link works; and Codex's "show detail says Jul 31–Aug 2" — on this desktop walk detail/list/wizard all read Aug 1–3 (E8); the only Jul 31 sighting was the dog-profile results formatter (E1). Treat C2 as formatter-specific, possibly environment/timezone-sensitive.
- **Confirms secretary audit:** C2 (in a new surface: dog-profile results formatter, "Fri Jul 31"), C3 (exhibitor sees "Judge TBD"), and the C1/C4/C5 *patterns* via E2/E3/E4/E5.
- **New this walk (not in either prior audit):** the sidebar-flyout click-eater; stale-cart double-charge with missing duplicate guard; auto-submit at "Confirmation"; entry-number reuse (E7); waitlist tab-vs-widget contradiction on one page (E3); withdrawn-entry-as-Upcoming on one page (E4); My Payments total-vs-rows mismatch; silent 409 on `enrollments` during submission.

### Session artifacts

Screenshots from this walk (worktree root): `01-my-shows-landing.png` … `21-buddy-detail.png`; a11y snapshots in `.playwright-cli/` and worktree root (`*.yml`). Test data created: dog "Buddy" (Golden Retriever, AKC SR12345678), entry Buddy → Container Novice A (cash), on the shared staging DB.
