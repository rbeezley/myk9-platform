# UX Audit: Secretary Journey — Full App Walkthrough

> **Status:** Active

**Date:** 2026-07-01
**Auditor:** Claude (live browser walkthrough, desktop 1280×800 + mobile 375×812 spot-check)
**Account:** `e2e-secretary@test.myk9.com` on local dev server (shared dev DB, seeded demo data)
**Surfaces walked:** Sign-in → Secretary Dashboard → needs-attention links → Show Workbench (all 6 tabs, published + draft show) → Manage Classes → Show Creation Wizard (step 1) → Browse Shows / Dogs / Clubs / People → My Entries → Ringside (picker → class list → entry list → scoresheet) → Entry Management sub-tabs (Entries, Exceptions/Move-ups)
**Reference:** Findings judged against [`docs/INTENT.md`](../INTENT.md) — secretary intent word: *"That was easy."*
**Cross-review:** Merged with agreed findings from the independent Codex walk of the same account/date ([secretary-major-paths-ux-audit.md](2026-07-ux-browser-walk/secretary-major-paths-ux-audit.md)). Merged items are marked **[Codex]**; findings both walks hit independently are marked **[×2]**.

**Calibration caveat:** This walk was driven by automation. Synthetic clicks did not register on several shadcn popover/menu/checkbox widgets (entry-row kebab, bulk-select checkboxes, search palette, theme toggle, date pickers). Those are **not** reported as findings — code inspection confirmed the underlying actions exist and are wired. Everything below was either observed rendering live or verified in source.

**What works well (keep):**

- The workbench spine (Setup → Show Desk → Entry Management → Reports → Results & Check-In → Submit Results) is a genuinely coherent "one show, one place" structure with lifecycle framing ("Before the show", "During the show").
- Reports: default report pre-selected, live preview renders immediately, one Print button. Closest page to "that was easy."
- Dashboard needs-attention strip with per-show deep links (`?mode=review&attention=pending`) — the *pattern* is exactly right; the destinations need work (see Pass 6).
- Ringside scoresheet: huge timer, big Start button, 4 plain result chips, offline-ready indicator. Matches judge intent ("invisible technology").
- Empty states are mostly written with care ("No personal tasks. Per-show tasks live in each show's Tools sheet." / My Entries welcome card with two CTAs).
- Table toolbar (Columns / Export CSV / Compact density / Reset view) is consistent across Entries, Dogs, Clubs, People.

---

## Pass 1: Mental Model Alignment

**What UI suggests:** "Publish the show and exhibitors can enter; fix-it chips will walk me through setup; tabs named for tasks contain those tasks."

**What it actually does:** "Published" is only one of three publish-ish states; fix-it chips point at places that can't fix the thing; one tab named for operations contains only settings.

**Misalignment gaps:**

| UI Element | User Expects | Actually Does | Severity |
| --- | --- | --- | --- |
| Show status chip **"Published"** + card **"Premium List — Not yet published"** + chip **"Exhibitor info not published yet"** on the same screen | One publish concept: "is my show live?" | Three separate states (show visibility, premium PDF, landing-page content) with no explanation of how they relate | High |
| Tab **"Results & Check-In"** (Show Desk links to it as "Verify results") | See/verify scores, run check-in | Contains only *policy settings*: results-visibility defaults (Immediately / After Class / After Review) and a self-check-in toggle | High |
| **"My Shows (0)"** tab next to **"Managing (3)"** on Browse Shows | "My shows" = the shows I run | "My Shows" = shows entered as an exhibitor; secretary's shows are "Managing" | Medium |
| **"Pending"** in Entry Management (needs secretary review) vs **"Pending"** in ringside entry list (dog hasn't run yet) | One meaning per word | Two unrelated meanings of the same status word across adjacent secretary surfaces | Medium |
| **"Exceptions"** sub-tab in Entry Management | Errors/problems | Move-up requests and pulls — routine dog-show operations, not "exceptions" | Low |
| Dashboard **"9 entries pending review"** | 9 things to review on the review screen | Review screen shows **12** pending (see Inconsistencies §C1) | High |
| **"New Entry"** button on Entry Management **[Codex]** | A quick secretary/mail-in entry task | Opens the five-step *exhibitor* registration wizard ("Register for Show", exhibitor help copy, Save Draft) | High |
| Copied **public show link** while signed in **[Codex]** | A preview of what exhibitors will see | Renders with secretary chrome, management tabs, and access-code admin — no "preview as exhibitor" affordance | Medium |

**Jargon found:** "No Status" (ringside class chip — should be "Not started"), "Exceptions", and the error toast `entries rpc ringside_update_entry timed out after 15000ms` (see Pass 5). "Q/NQ/Absent/Excused" is correct domain language — keep.

---

## Pass 2: Information Architecture

**Current structure:** Sidebar (Dashboard, pinned next show, Ringside, My Entries, Shows/Dogs/Clubs/People) → per-show workbench with 6 section tabs → sub-tabs inside Entry Management (Entries / Exceptions / Waitlist) → sub-sub-tabs inside Exceptions (Move-ups / Pulls).

**IA issues:**

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| Judge assignment has no home | "Judges not assigned" chip → `/trials/:id/classes` (Manage Classes) | Landing page has **no judge column, no assign-judge action anywhere** — the actual mechanism is header **⋯ → Edit Show → judges field**, 3 levels deep and not discoverable from the chip's destination | Give judge assignment a visible action on the page the chip targets (per-class judge column with inline assign, or route the chip to the Edit-Show judges section) |
| Manage Classes breaks out of the workbench | `/trials/:trialId/classes` | Loses the show header, section tabs, and breadcrumb — a different navigation universe one click deep from Setup. "Back to Trial" is actually `navigate(-1)` (history-back), so its label lies after a deep link | Fold class management under `/shows/:id/...` inside the workbench shell, or at minimum keep the show tabs/breadcrumb visible |
| Waitlist links go global | Manage Classes "Manage Waitlist" button & row-kebab "View Waitlist" → `/secretary/waitlist` | Jumps from a specific trial to a global waitlist page; show/trial context lost | Deep-link to the show's own Entry Management → Waitlist tab (`?tab=waitlist`) — the surface already exists |
| Three levels of nested tabs | Workbench tab → Entry Management sub-tab → Exceptions sub-sub-tab | Move-ups (a common show-week task, 1 pending in seed data) is buried two tab-layers deep | Promote Move-ups/Pulls to peers of Entries/Waitlist (one tab row) |
| Unlabeled utility floating in the breadcrumb bar | `ArmbandLookup` input, rendered top-right of the show shell | A bare input whose placeholder ("Armband #") truncates to **"Armban"**; no icon or label — reads as a mystery button | Add a search icon + accessible label; give it min-width or move it into Entry Management's toolbar |
| Mail-in entry reuses exhibitor IA wholesale **[Codex]** | `/secretary/register/:showId` | Secretary sees "Register for Show", exhibitor-oriented help, and a five-step flow sized for online self-entry | Keep the wizard engine; add a secretary/mail-in mode wrapper ("Add Mail-In Entry", staff copy, payment-recording defaults) |
| Show Desk action priority **[Codex]** | `/show-desk` | Pending signals, next action, up-next, filters, tree, and closeout all compete above the fold — a dashboard to *read* rather than the fastest place to *act* | Make Next Best Action sticky/dominant; collapse filter stacks until asked for (complements the pre-show dormancy issue in Pass 4) |
| Tools-sheet labels vs show-day language **[Codex]** | Show Desk Tools | "Delay scripts" ≠ the checklist's "schedule slip script"; broadcast actions not obvious at first level | Align labels with real show-day terms (Schedule slip script, Quick broadcast, Class broadcast, Access codes) |

**Visibility problems:**

- Hidden but should be visible: judge-per-class (nowhere in Manage Classes or Setup schedule rows); the "Release Results" control referenced by Results & Check-In copy ("All results hidden until you click 'Release Results'") is not on that page.
- Prominent but should be secondary: Closeout/Incidents/Attendance cards on Show Desk a month before the show (the "During the show" section renders fully pre-show).

---

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element | Looks Like | Actually Is | Clear? |
| --- | --- | --- | --- |
| Pencil (Edit) button on every Manage Classes row | Opens class editor | **Dead — no `onClick` in source** ([ClassManagementPage.tsx:399](../../apps/myk9show/src/pages/secretary/ClassManagementPage.tsx)) | No |
| Premium List card (unpublished state) | Tappable fix-it target (the readiness chip scrolls to it and rings it) | Static `<div>` with no action when unpublished ([PremiumDownloadCard.tsx](../../apps/myk9show/src/features/premium/PremiumDownloadCard.tsx)) | No |
| Wizard **Next** button (step 1, incomplete) | Will advance or explain | Silently disabled; no hint of which required fields remain | No |
| **Send to AKC** (Submit Results, pre-show) | Will send or explain | Disabled — a missing-AKC-registration-numbers warning renders on the page (observed in the Codex walk; my extraction missed it), so the *reason* exists but isn't attached to the button | Partial |
| **Download XML** (Submit Results) **[Codex]** | Safe, ready export | Stays enabled while the page warns of entries missing AKC registration numbers — no "draft/problem export" framing | Mixed |
| Entry row **Actions** menu after close **[Codex]** | Menu gone, page interactive | Left a portal/inert overlay that intercepted the next click on "New Entry" until Escape; opening it also logged ResizeObserver loop errors | No |
| "Judges not assigned" / "Exhibitor info not published yet" chips | Buttons that fix the problem | Links that *relocate* you (to a page/card that can't fix it) | Partial |
| Fix-it chip target ring (`#setup-publish` + `target:ring`) | — | Good pattern: the jump visibly lands somewhere (INTENT-commented, deliberate) | Yes |

**False affordances:** pencil buttons (×4 per trial), unpublished Premium List card as fix-it destination.

**Hidden affordances:** judge assignment (inside ⋯ → Edit Show); armband lookup (unlabeled input); 8 icon-only buttons on Manage Classes have no `aria-label` (the entries table does this right — `"Actions for Ranger"` — so the standard exists in-house).

**Recommended fixes:**

- Wire or remove the pencil button (SLC "Complete": no dead controls).
- Put a **Publish** action on the unpublished Premium List card (primary button: "Generate & publish premium").
- Disabled buttons get an adjacent one-line reason ("Select dates and a chairman to continue", "Available after classes are scored").
- Copy the entries-table `aria-label` convention to Manage Classes icons.

---

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step | Decisions Required | Can Be Reduced? |
| --- | --- | --- |
| Wizard Step 1 | ~14 fields (name, org, 2 date ranges, 2 fees, style, armband start, location, 3 payment toggles, club, chairman, secretary, judges) | Defaults are good (org, club, secretary, style, armband). Independently reproduced findings #2/#3 of [2026-07-01-show-creation-wizard-ux.md](2026-07-01-show-creation-wizard-ux.md): silent Next + blocking field below the fold. An inline "N required fields remaining" near Next is the cheap fix |
| Entry Management | Stat cards + quick views (Review/Day-of) + filter chips + column tools | Appropriate for the power surface; quick views are a good load-reducer. Keep |
| Show Desk (pre-show) | Scans task board, incidents, closeout, attendance — mostly irrelevant a month out | Collapse "During the show"/Closeout sections until the show window (or label them dormant) |
| Setup readiness | 2 chips, "Tap one to fix it" | Right idea; broken destinations (Pass 6) turn a 1-decision screen into a hunt |

**Missing defaults:** none notable — defaults are a strength of this app.

**Cognitive load score:** **Medium** — the structure does absorb complexity (INTENT's goal), but broken fix-it destinations and unexplained disabled buttons push the thinking back onto the user at exactly the moments the app promised to handle ("Tap one to fix it").

---

## Pass 5: State Coverage

### Error states

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Failed offline write (ringside entry update) **[×2]** | Yes | **Poor copy, wrong place** | Toast reads: *"Failed to save 1 change. entries update: Max retries exceeded: entries rpc ringside_update_entry timed out after 15000ms"* — raw RPC name + retry internals shown to the user, and it surfaced on a *different page minutes after* the action that queued it. Discard/Retry recovery buttons are good; the copy and ambient delivery violate INTENT ("We couldn't save that score. Tap to try again.") |
| Console during the failure | — | — | `[replication] Replication sync failed` re-fires indefinitely (40+ entries) — retry loop has no backoff/circuit-breaker visible to the user beyond repeated toasts |
| **Underlying trigger — independently reproduced [×2]** | — | — | Both this walk and the Codex walk (separate browser sessions, same day) queued a failing `ringside_update_entry` write simply by tapping a ringside entry card as the secretary, and later got the same toast on an unrelated page. This is reproducible, not a stray artifact — investigate whether the ringside entry-card tap fires an unintended status write and why it times out (candidates: OCC conflict retry storm, write-authz gap) |
| Sign-in cold start **[Codex]** | Yes | Poor | Generic "Loading page..." shown before the auth form renders |
| Mail-in entry dog search **[Codex]** | Yes | Good, one leak | Search is fast with useful owner/breed/org context, but renders developer latency metadata ("122ms") to end users |

### Empty states

| Surface | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| My Entries (no entries) | Yes | Good | Clear copy + 2 CTAs. One doubt: shows "Add Your First Dog" although this account appears to own a dog (Cooper, owner "Test Secretary" in /dogs) — verify the empty-state condition checks the user's dogs, not just entries |
| Personal Tasks | Yes | Good | Explains where per-show tasks live |
| Submission History | Yes | Good | "No submissions recorded for this show." |
| Waitlist (0) | Yes | OK | — |

### Status states

- Ringside class chip **"No Status"** — internal enum leaking; should read "Not started".
- Draft-show classes already carry **"Upcoming"** status chips in Setup — status noise before the show is even published.
- **"Pending" + "Refunded"** on one entry row (Willow) — a refunded entry still sitting in the needs-review bucket reads contradictory; if deliberate (per the paid-stays-pending decision), the row needs a hint of what the secretary should *do* with it.

**Dead ends found:** Ringside class list (`/at-show/:showId`) has **no back/exit affordance at all** — only trial collapse toggles and class rows. Browser-back is the only way out; in an installed PWA there is no browser chrome. Direct INTENT violation ("No dead ends"). The entry list one level deeper *does* have a back arrow — inconsistent and backwards (the deeper screen escapes, the shallower one traps).

---

## Pass 6: Flow Integrity

**Primary flow tested:** Dashboard → fix what needs attention → get the show ready → run entries review.

**Step-by-step findings:**

| Step | Action | Friction | Severity |
| --- | --- | --- | --- |
| 1 | Sign in (smart email/passcode field, then password) | None — clean two-step | None |
| 2 | Dashboard: read needs-attention | Count says 9; destination says 12 (§C1) | High |
| 3 | Tap "Draft — complete setup" → Setup tab | Good landing; readiness chips visible | None |
| 4 | Tap "Judges not assigned" chip | Lands on Manage Classes: no judge UI, dead pencil buttons, no path to fix; actual fix is ⋯ → Edit Show | **Critical** |
| 5 | Tap "Exhibitor info not published yet" chip | Scrolls to Premium List card — which has no action in its unpublished state; actual fix is ⋯ → Edit Show → Premium tab | **Critical** |
| 6 | Wizard step 1 → Next | Silent disabled button, no "what's missing" (matches wizard audit #2) | High |
| 7 | Entry Management review mode | Filter pre-applied via URL — good; approve actions exist (row kebab "Accept entry", bulk "Accept selected (N)") but only behind kebab/selection — no visible per-row accept in a mode named Review | Medium |
| 8 | Ringside: picker → class list → entries → scoresheet | Class list has no exit; passcode button renders the full sign-in card ("Sign in or join a show", Google button, "Don't have an account?") to an already-authenticated user | High / Medium |
| 9 | Row menu → "New Entry" **[Codex]** | Leftover portal overlay swallowed the click until Escape | High |
| 10 | Add a mail-in entry **[Codex]** | Lands in the exhibitor "Register for Show" wizard — wrong-role copy mid-task | High |

**Abandonment risks:**

- Both "Tap one to fix it" chips dead-ending is the single worst moment of the journey: it spends the user's trust at the exact moment the app promised ease. A secretary who fails twice to "finish setup" won't try the ⋯ menu — they'll email support (or go back to their spreadsheet).
- Silent Next on the wizard (a cold secretary's very first task).

**Recovery gaps:**

- No exit from ringside class list (above). For staff specifically, the return path should be explicit — a "Back to Show Desk" affordance or staff-mode indicator **[Codex]**.
- Discard/Retry on the failed-save toast is good recovery — keep, fix copy to name the object and action ("We couldn't update Tera's ringside status. Retry or discard this change.") **[Codex]**.
- Row-menu portal overlay must not swallow the next click; users should never need Escape before a primary action works **[Codex]**.

**Flow verdict:** **Completable with friction** — every task *can* be done, but the two flagship guided paths (fix-it chips, wizard advance) break their promise, and the fixes live behind an unlabeled ⋯ menu.

---

## UI/UX Inconsistencies (explicit inventory)

### C. Same fact, different values — these erode trust fastest

| # | Fact | Surface A | Surface B | Notes |
| --- | --- | --- | --- | --- |
| C1 | Pending entries (Heartland) | Dashboard & Show Desk: **9** | Entry Management stat card & filter: **12** | Dashboard counts only `entry_status === 'submitted'` ([attention.ts:13](../../apps/myk9show/src/features/show-map/attention.ts)); the page's pending bucket deliberately includes paid/refunded ("paid stays pending" decision). Pick one number or label them differently ("9 awaiting payment review / 12 total to review") |
| C2 | Show dates (Heartland) | Browse Shows list: **Jul 31 – Aug 2, 2026** | Show header: **AUG 1–3**; report: 8/1/2026; ringside: 2026-08-01 | Classic UTC/local off-by-one in one formatter. A secretary seeing two different weekends for her own show is a five-alarm moment |
| C3 | Judge assignment | Setup: "Test Judge — 5 classes assigned"; ringside rows: "Test Judge" | Check-in sheet: **"Judge: TBD"** | Report pipeline doesn't read the judge-assignment table |
| C4 | Class status | Setup schedule: Container "Complete", Interior "Upcoming" | Ringside: Container Novice A "Completed", Interior Advanced "**In Progress**" | Both vocab drift (Complete/Completed, Upcoming/No Status) and value drift (Upcoming vs In Progress) |
| C5 | Money "collected" | Entry Management: "REVENUE $210 — Collected fees" | Show Desk closeout: "Collected **$0.00**" | Presumably online revenue vs day-of desk cash — but both just say "collected" |
| C6 | "Items need attention" | Dashboard: 3 (cross-show) | Show Desk: 7 (one show) | Same phrase, different scopes, no scope label |
| C7 | Trial status composite **[Codex]** | Show Desk tree row: "Not started" + "**Needs wrap-up**" + "1/3 classes complete" on the same trial | — | A trial can't intuitively be both not-started and needing wrap-up; compose one status ("In progress — 1 of 3 classes complete") and reserve "Needs wrap-up" for finished trials |

### T. Terminology & tone

- "Pending" = needs review (Entry Mgmt) vs not-yet-run (ringside). "Published" = show live vs premium published vs exhibitor info published.
- Filter "**Gender**" over a column named "**Sex**" on the same Dogs page.
- Greeting voice: dashboard "Good evening, Test" (calm) vs My Entries "**Evening vibes, Test. You earned this.**" (novelty). INTENT says calm > clever; pick one register.
- Trial labels render as "**Trial Saturday Trial**" (prefix + name doubling) in ringside headers.

### F. Formatting & presentation

- Date formats across surfaces: "Jul 31 - Aug 2, 2026" / "AUG 1–3" / "Saturday, August 1, 2026" / "**2026-08-01**" (raw ISO, ringside class list) / "Sat, Aug 1, 2026" (ringside entry list). The two ringside screens disagree with *each other*.
- Missing armband rendered **three** ways: "—" (Entry Management) / "-" (reports, per Codex walk) / "**0**" (ringside entry card). "0" is the dangerous one — it reads as a real armband number.
- Icon buttons: labeled on entries table ("Actions for Ranger") vs 8 unlabeled on Manage Classes.
- Back affordances: breadcrumb + tabs (workbench) / "Back to Trial" that is history-back (Manage Classes) / none (ringside class list) / arrow (ringside entry list).
- Mobile show header: title clips off the card's right edge; ArmbandLookup placeholder truncates mid-word ("Armban").

---

## Summary

**Overall UX health:** **Needs Work** — strong skeleton (workbench spine, defaults, empty states, reports) undermined by broken guided paths, cross-surface number/status drift, and inconsistent vocabulary.

### Critical (fix immediately)

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| "Judges not assigned" fix-it chip leads to a page where judges cannot be assigned (and its edit buttons are dead) | 6 | Flagship setup flow breaks its promise; secretary stuck | Med — route chip to Edit-Show judges section *or* add judge assign on Manage Classes |
| "Exhibitor info not published yet" chip targets a card with no publish action | 6 | Second fix-it dead end; publishing hidden behind ⋯ → Edit Show → Premium | Low–Med — add "Generate & publish" button to the unpublished card |
| Show dates differ by a day between Browse list and show header (C2) | Inconsistency | Secretary can't trust the app about her own show weekend | Low — fix the one formatter parsing date-only as UTC |

### High Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| 9 vs 12 pending-review counts (C1) | 1 | "What am I actually being asked to do?" | Low — align definitions or relabel |
| Raw RPC error toast, delivered pages later; trigger independently reproduced in both walks (ringside entry-card tap queues a failing write) **[×2]** | 5 | Show-day stress; INTENT plain-English rule; underlying write failure needs root-causing | Low (copy) + Med (investigate the write) |
| "New Entry" opens the exhibitor "Register for Show" wizard with exhibitor help copy **[Codex]** | 1/2 | Secretary doubts they're in the right flow mid-task | Med — secretary-mode wrapper over the same wizard engine ("Add Mail-In Entry") |
| Entry row-menu leaves a portal/inert overlay that blocks the next click (+ ResizeObserver loop errors) **[Codex]** | 3/5 | Core review workflow feels broken after routine menu use | Med — needs code fix |
| Results & Check-In tab is settings, linked as "Verify results" | 1 | Wrong tab contents vs name; verification path unclear | Med — best fix per Codex: put a results-readiness summary (unscored / unreleased / missing signatures / safe-to-release) above the settings; renaming is the fallback |
| Ringside class list has no exit | 5 | Dead end on tablets/PWA | Low — add back/home affordance (entry list already has one) |
| Check-in sheets print "Judge: TBD" while judges are assigned (C3) | Inconsistency | Wrong printed documents at the venue | Med — wire reports to judge assignments |
| Dead pencil button on every class row | 3 | False affordance ×4 per trial | Low — wire to class edit or remove |

### Medium Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Wizard silent-disabled Next (dup. wizard-audit #2) | 6 | First-run confusion | Low — "N required fields remaining" hint |
| "My Shows (0)" vs "Managing (3)" labels | 1 | Role ambiguity | Low — "Entered as exhibitor" |
| Manage Classes outside workbench shell + mislabeled "Back to Trial" | 2 | Context loss | Med |
| Waitlist links go to global page, dropping show context | 2 | Extra navigation | Low |
| Authed user tapping "Enter a passcode" gets full sign-in card | 6 | "Did I get logged out?" | Low — passcode-only field when session exists |
| Status vocab drift (C4) + "No Status" label | 5 | Scanning cost | Low — one status enum → one label map |
| "Collected" double meaning (C5) | Inconsistency | Money confusion at closeout | Low — "Online entry fees" vs "Collected at desk" |
| Unlabeled ArmbandLookup in breadcrumb bar | 2/3 | Mystery control | Low |
| Show Desk shows closeout/incidents a month pre-show; action priority buried under signals/filters/tree **[Codex adds density angle]** | 4 | Clutter vs "calm"; hesitation under show-day pressure | Med — sticky Next Best Action, collapse filters, dormant closeout pre-show |
| Download XML enabled while page warns of missing AKC registration numbers **[Codex]** | 3 | Secretary may export a flawed official file believing it's ready | Low — "Download draft XML" or inline warning on the button group |
| No "preview as exhibitor" near Copy Link; signed-in view shows staff chrome **[Codex]** | 1/2 | Secretary can't verify what the public link shows | Low |
| Show Desk trial row combines "Not started" + "Needs wrap-up" + progress (C7) **[Codex]** | 5 | Contradictory status | Low |
| Tools-sheet labels don't match show-day vocabulary; broadcast actions not first-level **[Codex]** | 1/2 | Slower to find broadcast/access codes | Low |

### Low Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| "Trial Saturday Trial" doubling; ISO dates in ringside class list | Inconsistency | Polish | Low |
| Gender/Sex same-page mismatch | Inconsistency | Polish | Trivial |
| Greeting tone split ("Evening vibes… You earned this.") | Inconsistency | Brand voice | Trivial |
| "Exceptions" naming | 1 | Mild jargon | Trivial |
| 8 unlabeled icon buttons (a11y) on Manage Classes | 3 | Screen-reader gap | Low |
| "Pending + Refunded" row with no next action | 5 | Review hesitation | Low |
| Armband "0" vs "—" for unassigned | Inconsistency | Polish | Trivial |
| Mobile title clipping on show card | Inconsistency | Polish | Low |
| Generic "Loading page..." before the sign-in form **[Codex]** | 5 | Cold-start uncertainty | Low |
| Dev latency metadata ("122ms") visible in mail-in dog search **[Codex]** | 5 | Diagnostic leak | Trivial |

### Quick Wins (high impact, low effort)

1. **Fix the date formatter** behind C2 (one-day drift) — trust restored for one line of parsing.
2. **Publish button on the unpublished Premium List card** — un-breaks fix-it chip #2.
3. **Reconcile the pending count** (9 vs 12) — one definition or two labels.
4. **Humanize the replication-failure toast** — swap RPC internals for plain English.
5. **Back button on ringside class list** — copy the entry list's header pattern; for staff, label it "Back to Show Desk". **[Codex]**
6. **"N required fields remaining" next to the wizard's disabled Next.**
7. **Rename "New Entry" → "Add Mail-In Entry"** and give the reused wizard secretary-mode copy. **[Codex]**
8. **"Download draft XML"** (or inline warning) when registration numbers are missing. **[Codex]**
9. **"Preview public page" next to Copy Link.** **[Codex]**

### Recommendations

1. **Make every fix-it chip land on the control that fixes it.** This is the app's signature interaction ("Tap one to fix it") and both instances currently break their promise. Rule: a readiness chip may only ship if its destination contains the affordance that clears it.
2. **Adopt a single status/date/count vocabulary.** Create one shared status-label map (class lifecycle + entry lifecycle) and one date formatter, and require every surface — workbench, browse lists, reports, ringside — to consume them. Most of §C and §F disappears with two shared modules, which also matches the repo's DRY principle.
3. **Rename or refill "Results & Check-In."** Either it's "Results Settings" (honest name) or it gains the verification/release workflow its name and the Show Desk link promise. One concern, one page.
4. **Sweep for dead and unlabeled controls** (pencil buttons, icon aria-labels, disabled buttons without reasons) — mechanical fixes, and the entries table already demonstrates the house standard.
5. **Answer "what's blocking me?" before showing settings or exports** (Codex's framing, adopted here): a readiness summary at the top of Results & Check-In and Submit Results turns closeout from a guessing game into a checklist — the same pattern the Setup tab's readiness chips already establish.
6. **Root-cause the reproducible ringside write failure** — two independent walks queued a failing `ringside_update_entry` by tapping an entry card as secretary. Fix the trigger (or the write path), not just the toast copy.

### Cross-audit consensus

Initially the audits diverged on severity: Codex's walk reported "no hard blocker" because it did not exercise the draft-show readiness chips or compare dates across surfaces. On cross-review (2026-07-01), **Codex accepted this audit's Criticals and Claude-only findings** — fix-it chip dead ends, cross-surface date drift, pending-count mismatch, Manage Classes shell break/dead affordances, "Judge: TBD" on reports, and the ringside exit gap — and confirmed the merged **[Codex]** items match its direct browser observations. The two audits are now in consensus; every Critical/High finding is either independently reproduced (**[×2]**) or endorsed by both auditors. One caveat remains: **[Codex]**-tagged interaction bugs (notably the row-menu overlay interception) rest on a single live observation each and should be reproduced during fix triage.

---

*Walkthrough side-effect note: tapping a ringside entry card queued one entry-status write that failed to sync (the toast in Pass 5); it was left un-retried and can be discarded. No other data was created or modified — the wizard was abandoned on step 1 unsaved. The Codex walk reports the same: no intentional shared-DB mutation, one failed replication toast.*
