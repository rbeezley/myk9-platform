# UX Audit: Exhibitor Journey

**Date:** 2026-06-13
**Auditor:** Codex
**Scope:** Phase 2 slice from `docs/plan-ux-journey-audit.md`: cold-start exhibitor journey, INTENT scoring, friction/evidence capture
**Sources:** `docs/INTENT.md`, `docs/goals/fall-2026-launch-readiness-scorecard.md`, `docs/audits/2026-06-ux-journeys/00-recon.md`, Playwright browser walk on `http://127.0.0.1:5187`
**Account:** `exhibitor1@myk9t.com`
**Viewport passes:** Desktop `1280x900`; ringside phone `380x812`

## Audit Constraints

- The walk used the worktree dev server at `http://127.0.0.1:5187`.
- Opening `/shows/5d8bfe56-a48d-48dd-ae75-7f90c2e02c4f/register` created active `entry_carts` rows in staging Supabase before any explicit save/submit action. After discovering that, no entry submission, draft save, class selection, payment, check-in mutation, or other user-data mutation was intentionally performed.
- The cold-start goal was: "enter your dog in this weekend's show." The public landing page did not expose a Browse Shows path, so the walk continued through sign-in.
- Offline reload evidence is excluded: forcing Chrome offline and reloading localhost produced Chrome's `ERR_INTERNET_DISCONNECTED` page before app rendering, so it is not product evidence.

## Journey Evidence

| Segment | Route / screen | Evidence | Result |
| --- | --- | --- | --- |
| Public start | `/` | Landing snapshot `page-2026-06-13T20-53-05-176Z.yml` | Waitlist/sign-in are visible; Browse Shows / Enter a Show is not. |
| Sign in | `/sign-in` | `page-2026-06-13T20-53-25-086Z.yml` | Email/passcode first step is understandable; password is second step. |
| Signed-in hub | `/exhibitor/entries` | `page-2026-06-13T20-55-52-437Z.yml` | Strong recovery: My Shows, Enter a Show, Find Shows, Show Today banner. |
| Find eligible show | `/shows` | `page-2026-06-13T20-53-48-613Z.yml` | Good status contrast: Entries Closed vs Accepting Entries. |
| Show details | `/shows/5d8bfe56-a48d-48dd-ae75-7f90c2e02c4f` | `page-2026-06-13T20-53-57-561Z.yml` | Clear CTA and facts; class/dog-fit detail is absent before registration. |
| Registration | `/shows/5d8bfe56-a48d-48dd-ae75-7f90c2e02c4f/register` | `artifacts/phase2-registration-empty-classes.png`, `page-2026-06-13T20-54-14-941Z.yml`; fixed-state evidence `artifacts/phase2-registration-no-classes-alert.png` | Confirmed data issue plus fixed blank-state bug: read-only query returned zero classes for Monogram despite 4 trials. The wizard now shows the existing "No classes available yet" alert instead of blank space, and Browse/Show Details no longer advertise the show as enterable when class inventory is known empty. |
| My Shows money state | `/exhibitor/entries` | `page-2026-06-13T20-55-52-437Z.yml` | Payment Due and Current Fees are visible, but no pay/retry CTA appears in the visible entry card. |
| At-show class list | `/at-show/3b91e282-6e45-4a89-9446-f6ebeb0bf62c` | `page-2026-06-13T20-54-51-775Z.yml` | Class list is compact and tappable; many `No Status 0 / 0` rows compete with the in-progress row. |
| At-show class detail | `/at-show/.../class/...` | `artifacts/phase2-at-show-phone-class.png`, `page-2026-06-13T20-55-06-904Z.yml` | Strong: "You're next" and checked-in state are glanceable. Risk: badge says Offline while the browser is online. |
| At-show actions | Same class detail | `page-2026-06-13T20-55-20-550Z.yml` | Staff/report artifacts appear in exhibitor actions menu. |
| Results | `/shows/18802fc0-1558-4dc3-902d-989edef4df3c?tab=results` | `artifacts/phase2-results-empty-state.png`, `page-2026-06-13T20-56-18-743Z.yml` | Empty state is calm, but the route was reached through a "Completed" history item that still says Pending Review / Payment Due / Upcoming. |

---

## Pass 1: Mental Model Alignment

**What UI suggests:** An exhibitor can sign in, find a show that accepts entries, inspect whether it fits their dog, enter classes, understand payment state, use at-show as the day-of source of truth, and later find results from My Shows.

**What it actually does:** Discovery and show-day status are mostly coherent after sign-in, but registration blocks at class selection for the accepting seeded show, payment recovery is not visible from My Shows, and post-show status language mixes date-based and workflow-based meanings.

**Misalignment gaps:**

| UI Element | User Expects | Actually Does | Severity |
| --- | --- | --- | --- |
| Public landing page | "Find or enter a show" is available from the first screen | Only waitlist/sign-in paths are visible | P2 |
| Show Details for Monogram | Enough class/level detail to decide if the show fits their dog | Shows fees, dates, trial count, and CTA, but not class eligibility/details | P2 |
| Registration class step | Dog tabs contain selectable classes, or a clear explanation when setup data is incomplete | Monogram has 4 trials and zero classes; before the fix this rendered blank, now it explains no classes are assigned | P1 |
| My Shows "Completed" tab | Completed means the show/entry has outcomes or results | Shows a date-past entry still marked Pending Review, Payment Due, and Upcoming | P2 |
| At-show Offline badge | Current connectivity state | Shows Offline during normal online rendering | P2 |
| At-show actions menu | Exhibitor actions: refresh, find my dog, maybe share/check status | Includes Check-In Sheet and Scoresheet report artifacts | P2 |

**Jargon found:** "Check-In Sheet", "Scoresheet", "Section A/B", "No Status", "Pending Review" without an exhibitor-facing explanation of who is reviewing or what happens next.

## Pass 2: Information Architecture

**Current structure:**

- Public landing: waitlist marketing, sign-in, role value propositions.
- Signed-in exhibitor hub: My Shows, show-day banner, entry/payment summary cards, My Dogs, My Entries tabs.
- Browse Shows: search/filter controls, status-coded show cards.
- Show Details: hero facts, entry CTA, detail tabs for standard show page or heritage-style facts for Monogram.
- Registration: wizard with Classes, Payment, Confirmation.
- At-show: class picker by trial/date, then class detail with entry list and actions.
- Results: show Results tab.

**IA issues:**

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| Cold-start discovery hidden | Public landing | A new exhibitor's stated task is "enter a show," but Browse Shows is not a first-screen action | Add or expose a link into existing `/shows`; do not create a second browse surface. |
| Dog-fit detail deferred too late | Show Details | The user needs class/level detail before committing to registration | Surface existing class/trial summaries on Show Details before the CTA or deep-link to the existing Classes tab where available. Entry CTAs are now replaced when no classes are assigned. |
| Payment path not actionable | My Shows | Payment Due and Current Fees are visible, but no visible pay/retry/receipt action appears on the entry card | Link Payment Due / Current Fees into the existing payment or receipt surface. |
| Staff tools leak into exhibitor IA | `/at-show` class actions | Report/score artifacts are operational documents, not primary exhibitor needs | Filter the menu by role or move staff/report actions behind staff-only surfaces. |
| Result discovery depends on show page tab | My Shows → View Show → Results | No direct "View Results" action appears for the completed/history card | Link completed entries with released results directly to the existing Results tab or class result route. |

**Visibility problems:**

- Hidden but should be visible: class eligibility before registration; payment recovery path; direct result path when results exist or an explanation when not released.
- Prominent but should be secondary: staff report actions in exhibitor at-show menu; many empty `No Status 0 / 0` classes above/beside the one class the exhibitor cares about.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element | Looks Like | Actually Is | Clear? |
| --- | --- | --- | --- |
| My Shows "Enter a Show" | Primary action button | Navigates to `/shows` | Yes |
| Browse show cards | Clickable cards with nested "View" links | Opens Show Details | Yes |
| Show Details "Enter your dog" | Primary CTA | Opens Registration Wizard | Yes |
| Registration dog tabs | Selectors containing class choices | Tabs switch dogs, but panels are blank | No |
| My Shows summary stat cards | Buttons with "View details" | Scroll/filter behavior not obvious from snapshot alone | Partial |
| Check-in status pill | Button | Opens/changes check-in state | Partial; active enough, but dangerous if accidental |
| At-show class rows | Large list buttons | Opens class detail | Yes |
| At-show entry row | Card with "Tap to change status" status pill | Entire row appears tappable; mutation risk unclear | Partial |
| At-show actions menu | Overflow menu | Mix of refresh and report/score artifacts | No |
| Results empty state | Informational empty state | No recovery beyond waiting | Yes |

**False affordances:** Registration dog tabs imply content exists but reveal no class list. At-show "Offline" badge implies a current offline state even during online browsing.

**Hidden affordances:** Payment Due / Current Fees do not expose a visible pay action. Completed/history entries do not expose direct results.

**Recommended fixes:**

- Make the registration empty panel explicit: "No classes are available for this dog/show" with retry and a secretary/contact path if data is genuinely empty.
- Add a visible pay/retry/receipt action to existing My Shows entry cards when `payment_status` is due/pending.
- Replace staff/report items in exhibitor at-show with role-appropriate actions or hide them for exhibitors.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step | Decisions Required | Can Be Reduced? |
| --- | --- | --- |
| Landing | Join waitlist, sign in, or read marketing; no browse option | Yes: expose Browse Shows/Find Shows. |
| Sign-in | Email/passcode, then password | Mostly acceptable; passcode copy helps. |
| Browse Shows | Choose filters/view modes/show | Yes, but current status labels make this manageable. |
| Show Details | Decide whether the show fits without class details | Yes: include class/level summary before registration. |
| Registration | Choose dog and classes | Currently impossible for Monogram: the show has no classes. The blank panel is fixed, but the user still cannot enter. |
| My Shows payment state | Interpret Pending Review + Payment Due + timeline + checked-in state | Yes: add one plain next action and resolve inconsistent states. |
| At-show class list | Pick the right class from many trial groups | Yes: bias toward "my classes" / in-progress / today. |
| At-show class detail | Understand next dog and status | Low load; "You're next" is excellent. |
| Results | Decide whether results are absent, unreleased, or not scored | Yes: distinguish "not released yet" from "no results for your dog." |

**Missing defaults:**

- Browse/landing should default a signed-out exhibitor toward `/shows`.
- At-show should default or pin "my classes" above empty classes.
- Registration should either show classes or explain why no classes are available.

**Unnecessary complexity:**

| Complexity | Who Needs It | Recommendation |
| --- | --- | --- |
| Check-In Sheet / Scoresheet links in exhibitor at-show menu | Secretary/judge/staff | Hide for exhibitors or relabel only if these are truly public documents. |
| `No Status 0 / 0` repeated across many classes | Staff or spectators, maybe not exhibitor | Collapse/filter empty irrelevant classes behind "All classes"; foreground my entries and live classes. |
| Step timeline Submitted → Review → Accepted → Paid while entry says Payment Due and checked-in | Internal workflow | Translate to one exhibitor-facing next state. |

**Cognitive load score:** Medium-high. The successful show-day detail screen is low-load, but registration and payment/result states require the exhibitor to infer too much.

## Pass 5: State Coverage

### Public Landing

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | N/A | N/A | Marketing surface. |
| Loading | Yes | Good | Page renders. |
| Success | Yes | Good | Strong brand/trust story. |
| Partial | Yes | Poor | Waitlist-only framing conflicts with signed-in/show-entry task. |
| Error | Unknown | Missing | Not tested. |

### Browse Shows

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Unknown | Not tested | No zero-show state encountered. |
| Loading | Yes | Good | Page resolved. |
| Success | Yes | Good | Status labels are clear. |
| Partial | Yes | Good | Closed vs accepting entries is visible. |
| Error | Unknown | Not tested | Prior April error-as-empty concern still needs forced-query validation. |

### Show Details

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | N/A | N/A | Show data exists. |
| Loading | Yes | Good | Page resolved. |
| Success | Yes | Medium | Clear CTA, but dog-fit/class information is missing from the heritage-style first view. |
| Partial | Yes | Medium | Entries closed message works on Headline; Monogram accepting state works. |
| Error | Unknown | Not tested | Forced failure not run in this slice. |

### Registration

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Improved after fix | Shows "No classes available yet" when trials exist but no classes are assigned. Browse/Show Details now avoid routing exhibitors into this state when class inventory is known empty. |
| Loading | Yes | Basic | Loading text appears. |
| Success | No | Broken in this seeded accepting-show path | Cannot select a class. |
| Partial | Yes | Poor | Save Draft exists, but opening the page already writes carts. |
| Error | No visible error | Missing | Classes query returned `200`; UI still blank. No retry/contact path. |

### My Shows / Money State

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Unknown | Not tested | Existing account had entries/dogs. |
| Loading | Yes | Good | Page resolved. |
| Success | Yes | Medium | Rich hub and strong show-day banner. |
| Partial | Yes | Poor | Pending Review + Payment Due + Checked In can coexist without explanation. |
| Error | Unknown | Not tested | Prior data-load toast concern from recon not reproduced in this pass. |

### At-Show

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Medium | Empty classes show `0 / 0`, but many of them add scan load. |
| Loading | Yes | Medium | "Checking ringside access..." appears; it resolved after several seconds. |
| Success | Yes | Good | "You're next" and checked-in state are excellent. |
| Partial | Yes | Medium | Offline badge appears online; role menu includes staff artifacts. |
| Error | Unknown | Not tested | Offline reload test hit browser error before app. |

### Results

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Good copy | "Results will appear here as classes complete scoring" is calm. |
| Loading | Yes | Good | Page resolved. |
| Success | Unknown | Not tested | No released result fixture found in this account path. |
| Partial | Yes | Poor | Completed/history entry still says Upcoming and Pending Review. |
| Error | Unknown | Not tested | Not forced. |

**Dead ends found:** Registration class selection remains a data-driven dead end for Monogram: the show has no classes, so Next stays disabled. The blank-panel bug is fixed, and Browse/Show Details now replace entry CTAs when known class inventory is empty.

**Missing error handling:** Registration does not explain blank class data. Payment due does not show a visible recovery/pay path in the entry card. Results do not distinguish unreleased, unscored, or no-result states beyond the generic empty state.

## Pass 6: Flow Integrity

**Primary flow tested:** Cold-start exhibitor journey from landing page to signing in, finding an accepting show, attempting registration, checking show-day status on phone, and finding results/history.

**Step-by-step findings:**

| Step | Action | Friction | Severity |
| --- | --- | --- | --- |
| 1 | Open landing page | No Browse Shows / Enter Show path visible; only waitlist/sign-in | P2 |
| 2 | Sign in as exhibitor | Two-step auth is understandable; passcode copy is helpful | Low |
| 3 | Land on My Shows | Strong orientation; Enter a Show and Find Shows are visible | None |
| 4 | Browse eligible shows | Accepting Entries vs Entries Closed is clear | None |
| 5 | Open accepting show | Entry CTA is clear; class/dog-fit detail absent | P2 |
| 6 | Click Enter your dog | Registration wizard opens and reveals the show has no classes assigned | P1 |
| 7 | Review payment state from My Shows | Payment Due visible, but no visible pay/retry action | P2 |
| 8 | Open at-show phone class list | Class list works; live/my class is not strongly prioritized over empty classes | P2 |
| 9 | Open at-show class detail | "You're next" and checked-in status are clear and fast | None |
| 10 | Open at-show actions | Staff/report actions leak into exhibitor menu | P2 |
| 11 | Find results from completed/history item | Route is available, but status language conflicts and results are empty | P2 |

**Abandonment risks:**

- Registration blank class list is a launch-blocking abandonment point for the exhibitor golden path.
- Payment Due without a clear pay/retry path can make the exhibitor unsure whether their entry is valid.
- Results/history status mismatch can make the exhibitor believe results are missing or their entry is still unresolved.

**Recovery gaps:**

- Missing back/undo: Registration has Back/Cancel, but no recovery for blank classes.
- No cancel option: At-show action menu is dismissible; no issue found.
- Destructive with no confirm: Not tested; avoided mutation controls.

**Flow verdict:** Broken for the full enter/pay golden path because the tested accepting show has no classes assigned. Show-day status is usable with friction. Results discovery is incomplete/ambiguous.

---

## Journey-Specific Phase 2 Checks

### Cold-Start Walk

| Criterion | Result |
| --- | --- |
| Can discover entry path from public landing | Partial; sign-in visible, browse hidden. |
| Can find an accepting show after sign-in | Pass. |
| Can understand if show fits dog | Partial; class/level details are not available before registration on the tested accepting show landing. |
| Can enter dog in classes | Fail; Monogram has no classes assigned. The blank panel is fixed, and entry CTAs are now gated when class inventory is known empty. |
| Can understand payment state | Partial; due amount visible, action missing. |
| Can reach show-day status | Pass after using My Shows / direct at-show route. |
| Can view results | Partial; results tab exists, but fixture has no results and status language is contradictory. |

### Phone-At-Ringside Pass

| Check | Result |
| --- | --- |
| 380px layout usable | Pass on class detail; dense but functional on class list. |
| One-handed reach | Mostly pass; top-right actions/search are reachable but not the most important controls. |
| Dogs-ahead / next-up clarity | Pass for tested class: "You're next" is clear. |
| Own-dog highlighting | Pass in class detail via dog card and favorite affordance; conflict chip not observed in this fixture. |
| Tap targets >= 44px | Appears mostly pass by visual inspection; exact CSS measurement not captured. |
| Offline tone | Inconclusive; in-app badge says Offline during online rendering, which risks false alarm or mistrust. |

### Money-Path State Sweep

| State | Observed |
| --- | --- |
| Empty | Not tested with no dogs/no entries. |
| Loading | Registration loading text appears. |
| Error | No-classes state now renders a clear alert. |
| Offline | Not validly tested; Chrome offline reload intercepted localhost. |
| Partial | Payment Due and Current Fees visible, but no visible pay/retry action. |
| Stripe handoff | Not reached because class selection blocked; no payment submission attempted. |
| Confirmation email expectation | Not reached. |

### Time-To-Task Baselines

Measured manually from Playwright timestamps and click counts. Times include page waits in this test environment, not optimized human stopwatch runs.

| Task | Path | Clicks / screens | Time | Result |
| --- | --- | --- | --- | --- |
| Sign in and reach My Shows | `/` → Sign in → email → password → `/exhibitor/entries` | 4 clicks / 3 screens | ~34s | Pass |
| Find accepting show | My Shows → Enter a Show → Monogram card | 2 clicks / 2 screens | ~22s after sign-in | Pass |
| Attempt to enter dog | Show Details → Enter your dog → Classes step | 1 click / 1 wizard screen | ~17s to no-classes state | Fail |
| Check armband/status | My Shows entry card | 0 extra clicks once on hub | Immediate | Partial; no armband visible for one entry; checked-in visible for another. |
| Find ring/start status | My Shows → Go to show day / at-show class list | 1-2 clicks / 2 screens | Not cleanly timed | Partial; first class time visible, class list dense. |
| See dogs-ahead/next-up | At-show class list → in-progress class | 1 click / 1 screen | ~26s from route load to class detail | Pass for "You're next". |
| Scratch/request move-up | Not tested | N/A | N/A | Not observed in this slice. |
| View results | My Shows Completed → View Show → Results | 2 clicks / 2 screens | ~19s | Partial; no results, ambiguous status. |

## UX Audit Summary

**Overall UX health:** Needs Work. The signed-in hub and at-show class detail have the right emotional shape for "This respects my time," but the core entry/payment path is blocked in the tested accepting-show fixture.

### Critical / P1

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Accepting show `Monogram` has no classes assigned, so exhibitors cannot enter | 1, 3, 5, 6 | Exhibitor cannot complete golden-path step 3; blocks launch until show setup data is fixed | Medium |

### High Priority / P2

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Payment Due / Current Fees state has no visible pay or retry action from My Shows | 2, 3, 5 | Exhibitor may not know whether the entry is valid or how to finish payment | Medium |
| Completed/history item shows Pending Review, Payment Due, and Upcoming | 1, 4, 5, 6 | Erodes trust in entry/results status | Medium |
| At-show action menu exposes staff/report artifacts to exhibitors | 2, 4 | Adds cognitive load in the highest-stress phone context | Low |
| Show Details does not expose class/dog-fit detail before registration on the tested accepting show | 1, 2, 4 | User may enter the wizard before knowing whether the show fits their dog | Medium |
| Landing page hides Browse Shows / Enter Show from cold-start exhibitors | 1, 2, 6 | New users with entry intent are pushed through sign-in/waitlist rather than discovery | Low |
| At-show shows Offline badge during normal online rendering | 1, 5 | Confusing for venue users; may undermine offline-first trust | Low-Medium |

### Medium Priority / P3

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| At-show class list shows many empty `No Status 0 / 0` classes before/around relevant live classes | 2, 4 | Slower scanning on phone | Medium |
| Results empty state is calm but generic; does not distinguish unreleased vs no result vs not scored | 5, 6 | Results support questions likely after show | Low |
| Sign-in is two-step for email accounts | 4 | Mild extra friction, offset by passcode support | Low |

### Quick Wins

- Link landing page to existing `/shows` for "Find shows" / "Enter a show" rather than adding a new discovery surface.
- Hide or role-filter exhibitor at-show menu items that generate check-in sheets or scoresheets.
- Change the at-show connectivity label to "Saved on this device" / "Offline-ready" if it means capability, or fix it if it means current connectivity.
- Keep the explicit no-classes state in registration and the Browse/Show Details CTA gate when a show has no classes.

### Recommendations

1. Treat Monogram's missing classes / entry CTA gating as the first remediation target; it blocks the exhibitor golden path.
2. Tighten existing surfaces rather than adding new ones: link Payment Due to the existing payment/receipt flow, link completed entries to existing Results routes, link landing discovery to `/shows`.
3. Re-score the money path after registration is fixed, including Stripe handoff, failed payment recovery, and confirmation email messaging.
4. Re-run the phone pass with a fixture that includes multiple own entries close together so dogs-ahead and conflict chips can be scored directly.

## Duplication Question

Does any recommendation duplicate an existing page? No new page is justified by this slice. Each recommendation should link into or tighten an existing surface: `/shows`, Show Details tabs, Registration Wizard, My Shows payment/status cards, `/at-show`, and existing Results routes.
