# UX Audit: Secretary Journey

**Date:** 2026-06-13
**Auditor:** Codex
**Scope:** Phase 3 secretary journey audit from `docs/plan-ux-journey-audit.md`
**Intent target:** Trial Secretary — "That was easy"
**Sources:** `docs/INTENT.md`, `docs/audits/2026-06-ux-journeys/00-recon.md`, live Playwright walk on `http://127.0.0.1:5173`
**Account:** `secretary@myk9t.com`
**Primary shows walked:** `June 2026` (`4584f257-19b5-4016-aae6-5e7827b769cb`) and dashboard-linked `Monogram` (`5d8bfe56-a48d-48dd-ae75-7f90c2e02c4f`)

## Evidence Index

| Evidence | Artifact |
| --- | --- |
| Initial secretary dashboard | `artifacts/phase3-secretary-dashboard.png` |
| Secretary dashboard and attention list | `artifacts/phase3-dashboard-attention.png` |
| Create show wizard start | `artifacts/phase3-show-create-start.png` |
| Show setup workbench | `artifacts/phase3-show-setup.png` |
| Show Desk overview | `artifacts/phase3-show-desk.png` |
| Show Desk class action menu | `artifacts/phase3-show-desk-class-actions.png` |
| Entry Management list | `artifacts/phase3-entry-management.png` |
| Entry check-in menu | `artifacts/phase3-entry-checkin-menu.png` |
| Pull management empty state | `artifacts/phase3-pull-management-empty.png` |
| Reports selector | `artifacts/phase3-reports-selector.png` |
| Results Control | `artifacts/phase3-results-control.png` |
| Submit Results | `artifacts/phase3-submit-results.png` |
| Legacy `phase=show-desk` redirect mismatch | `artifacts/phase3-legacy-show-desk-redirect.png` |
| Dashboard attention link to Monogram pending tab | `artifacts/phase3-attention-monogram-pending.png` |

## Journey Walk

| Segment | Route | Observed state | Intent score |
| --- | --- | --- | --- |
| Open secretary home | `/secretary/dashboard` | Cross-show home, quick links, attention list, show buckets, personal tasks | Good |
| Set up October trial | `/secretary/create-show/wizard` | Clone option and defaults present; many required fields before Trials/Classes unlock | Mixed |
| Configure existing show | `/shows/:showId/setup` | Strong single-show workbench with readiness, public link, premium status, schedule, officials | Good |
| Show-day operations | `/shows/:showId/show-desk` | Good next-best-action header and map; scratch/move-up not visible in class actions | Mixed |
| Entry operations | `/shows/:showId/entry-management` | Rich controls for status, check-in, email, payment, CSV, waitlist, pull, move-ups | Good with pressure friction |
| Reports and labels | `/shows/:showId/reports` | Broad report inventory; closed select labels expose internal ids | Mixed |
| Results release | `/shows/:showId/results-control` | Clear presets and override inheritance | Good |
| Sanctioning submission | `/shows/:showId/submit-results` | Missing-registration alert, enabled submission actions, raw XML preview | Needs work |

## Phase 3 Specific Passes

### Cold-Start Walk

Goal: "Set up your club's October trial and open entries."

| Step | Evidence | Friction | Severity |
| --- | --- | --- | --- |
| Dashboard to creation | Add Show is prominent on secretary dashboard | No friction | None |
| Start wizard | Clone from previous show appears first; org, club, secretary, armband number, style default | Good INTENT fit | None |
| Reach trials/classes | Steps 2-4 are disabled until show details are complete | A paper-migrating secretary cannot preview the full setup path or know how many decisions remain | Medium |
| Open entries | Existing setup surface shows public landing link and premium publish status | Good once show exists, but initial wizard does not yet frame "open entries" as the outcome | Medium |

### Show-Day Pressure Pass

Worst-hour scenario: entries arriving, scratches, judge question.

| Task | Current path | Tap estimate | Intent target | Result |
| --- | --- | ---: | --- | --- |
| See what needs action | Show Desk header shows pending signals, next best action, up-next list | 0-1 | Surface problems, not data | Pass |
| Start a class | Show Desk `Start` or class `Mark Class Started` | 1 | 1-2 taps | Pass |
| Print class check-in sheet | Expand trial, class actions, Print Check-In Sheet | 2-3 | 1-2 taps | Slight friction |
| Check in an entry | Entry Management, row check-in dropdown, choose state | 2 after row is visible | 1-2 taps | Pass |
| Scratch/pull a dog day-of | Entry Management, row status dropdown, choose Pulled or Withdrawn | 2 after row is visible; 4+ from Show Desk | 1-2 taps from pressure surface | Needs work |
| Move-up | Entry Management, Move-Ups tab; empty state only in fixture | Not measurable with no pending request | Clear recovery | Inconclusive; needs seeded pending move-up in Phase 4 or Dynamic QA |
| Judge question about class status | Show Desk map has class status and score/open actions | 1-3 | Calm orientation | Pass |

### State Coverage Sweep

| State | Evidence | Quality | Issue |
| --- | --- | --- | --- |
| Dashboard attention | 9 attention items deep-link to setup or filtered entry management | Good | Monogram attention says 1 pending entry but target filtered page shows 0 entries |
| Bulk operations | Row action menu includes Accept All, Waitlist All, Reject All, Missing Info, Check In All | Partial | No observed partial-failure or retry state in fixture |
| Waitlist | Entry Management has Waitlist tab and counts | Partial | No waitlist edge state observed |
| Pull/scratch | Pull Management has pending/processed tabs and empty state | Good | Naming differs: visible tab says Pulled, URL says `entryTab=scratches`, copy says Pull Requests |
| Move-ups | Empty move-up state is calm | Good | No seeded pending request to verify decision workflow; track a seeded move-up request in Phase 4 or Dynamic QA |
| Incomplete closeout | Submit Results warns about 5 missing AKC registration numbers | Partial | Send to AKC remains enabled; raw `akcDogRegnum`/XML copy increases stress |
| Error/offline | Not intentionally induced in this audit slice | Not scored | Needs Dynamic QA follow-up |

### Time-To-Task Baselines

Read-only walk; no mutating actions were submitted.

| Task | Baseline | Notes |
| --- | ---: | --- |
| Find an attention item from dashboard | 0-1 clicks | Attention list was expanded; links are specific and route correctly |
| Open pending-entry queue | 1 click | Dashboard link deep-links to `entryTab=pending` |
| Approve 20 entries | Not fully measurable | Bulk decision menu exists, but pending fixture landed on 0 entries for Monogram |
| Scratch a dog day-of | 4+ clicks from Show Desk; 2 after row visible | Not one-tap from the pressure surface |
| Move-up | Not fully measurable | Dedicated tab exists, but no pending requests |
| Print check-in sheet | 2-3 clicks from Show Desk class menu; 1 click from Reports after report is selected | Report path has broad inventory |
| Print armband labels | Selector includes Armband Labels; closed selector uses raw id labels | Needs label polish |
| Send day-of announcement | No direct Show Desk/workbench CTA found | Code/docs indicate show-wide messages are consolidated into the global Message Center; re-run this baseline from Message Center |
| Produce sanctioning-body report | 1 route to Submit Results, then warning review/download/send | Raw XML and enabled send action make this cognitively heavy |

## Pass 1: Mental Model Alignment

**What UI suggests:** The secretary has one cross-show home, then one show workbench for setup, show day, reports, and closeout. Attention items should be trustworthy shortcuts to the exact problem.

**What it actually does:** The single-show workbench is mostly coherent, but some labels and redirects still leak implementation details or stale state.

**Misalignment gaps:**

| UI Element | User Expects | Actually Does | Severity |
| --- | --- | --- | --- |
| `phase=show-desk` legacy URL | Show Desk opens | Redirects to `/setup?phase=show-desk` | High |
| Dashboard attention "1 entry pending review Monogram" | Filtered list contains that pending entry | Target page shows 0 total entries and 0 pending | High |
| Reports selected values | Human labels remain visible | Closed selects show `check-in-sheet`, `run-order` | Medium |
| Submit Results alert | Missing required data blocks risky submission | `Send to AKC` remains enabled beside warning | High |
| Pulled tab | Scratch/pull workflow language is consistent | Tab says Pulled, URL says scratches, copy says Pull Requests | Low |
| Sidebar "My Shows" for secretary | Secretary show management | Links to exhibitor `/exhibitor/entries` | High |

**Jargon found:** `AKC:scent_work`, `akcDogRegnum`, `check-in-sheet`, `run-order`, XML preview, `entryTab=scratches`.

**Suggested user-facing labels:**

| Current term | User-facing label |
| --- | --- |
| `AKC:scent_work` | AKC Scent Work |
| `akcDogRegnum` | AKC Registration Number |
| `check-in-sheet` | Check-in Sheet |
| `run-order` | Run Order |
| XML Preview | Electronic Submission Preview |
| `entryTab=scratches` | Pulled Entries |

## Pass 2: Information Architecture

**Current structure:**

- Dashboard: cross-show quick actions, attention list, show buckets, personal tasks.
- Single-show workbench: setup header, premium/public link, management tabs.
- Show Desk: next best action, pending signals, show map, class actions.
- Entry Management: entries/waitlist, filters, counts, row actions, status controls, move-ups, pulled.
- Reports/Results/Submit: print inventory, release presets, XML submission.

**IA issues:**

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| Pressure actions split across Show Desk and Entry Management | Show Desk / Entry Management | Scratch/pull is not visible where the secretary starts the worst-hour flow | Deep-link from Show Desk class/entry signals into the exact filtered Entry Management row or add a link, not a duplicate table |
| Stale attention target | Dashboard to Monogram Entry Management | Cross-show triage loses trust when a problem link lands on 0 entries | Recompute attention counts from the same filtered source used by Entry Management |
| Role-boundary navigation | Secretary sidebar | "My Shows" sends a secretary to the exhibitor show hub | Point the secretary sidebar to the secretary dashboard or remove the duplicate item |
| Submit flow exposes implementation object | Submit Results | Secretary sees raw XML as primary preview | Show a checklist/summary first; keep XML behind download/details |
| Reports controls use id values when closed | Reports | The inventory is good, but the selected state reads like developer data | Keep selected labels human-readable |

**Visibility problems:**

- Hidden but should be visible: Message Center path for a day-of announcement, scratch/pull shortcut from Show Desk, submission-blocking readiness checklist.
- Prominent but should be secondary: raw XML preview, technical submission identifiers.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element | Looks Like | Actually Is | Clear? |
| --- | --- | --- | --- |
| Dashboard attention links | Specific task links | Deep-links to setup or filtered Entry Management | Yes |
| Show Desk next action | Primary action | Starts/open current class workflow | Yes |
| Class action kebab | Secondary menu | Print, score, open, start class | Yes |
| Entry status badges | Buttons with chevrons | Status transition menus | Yes |
| Check-in badges | Buttons with chevrons | Check-in state menus | Yes |
| Reports select closed value | Raw token | Current report/sort selector | No |
| Submit action buttons | Final actions | Shared-system/export actions despite warnings | Mixed |

**False affordances:** Monogram pending-review attention item looks actionable and current, but lands on an empty pending tab.

**Hidden affordances:** Scratch/pull is available through status menus and the Pulled tab, but not surfaced as a show-day action from Show Desk.

**Recommended fixes:**

- Keep the dashboard attention list, but make counts and target filters share one source.
- Add Show Desk deep-links into filtered Entry Management for check-in/pulled/conflict states instead of duplicating Entry Management.
- Use display labels for selected report and sort values.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step | Decisions Required | Can Be Reduced? |
| --- | --- | --- |
| Create Show step 1 | Show name, org, dates, entry dates, fees, style, armband start, location, payment methods, club, chairman, secretary, judges | Yes: keep clone/defaults, but preview the full setup checklist earlier |
| Show Desk | Choose class/date/status filters, expand tree, choose class action | Partly: next best action helps; scratch/pull shortcuts need clearer paths |
| Entry Management | Filters, status, check-in, email, payment, row actions, tabs | Partly: good for bulk work, heavy during show-day pressure |
| Reports | Report, trial, class, sort, print | Yes: display human labels and maybe task-based groupings |
| Submit Results | Organization, send/download/mark submitted, warning, XML | Yes: replace raw preview-first with checklist-first |

**Missing defaults:**

- Reports should show human defaults, not raw internal ids.
- Submit Results should default to a blocked/review state when required registry fields are missing.
- Day-of announcement should have an obvious Message Center entry point from the secretary workbench, or the time-to-task baseline should explicitly start from the top-bar Message Center.

**Unnecessary complexity:**

| Complexity | Who Needs It | Recommendation |
| --- | --- | --- |
| Raw XML preview as main closeout content | Rare troubleshooting | Move behind "View XML details" |
| Technical submission field names | Developers/support | Translate to "AKC registration number" |
| Disabled wizard steps without preview | No one during cold start | Show the setup checklist while still enforcing order |

**Cognitive load score:** Medium — the core surfaces are coherent, but closeout and initial setup still expose too much implementation detail for the "That was easy" promise.

## Pass 5: State Coverage

### Dashboard

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Not scored | Unknown | Dashboard fixture has 9 shows |
| Loading | Yes | Good | Brief loading shell only |
| Success | Yes | Good | Clear sections and attention list |
| Partial | Yes | Mixed | Attention count can disagree with target page |
| Error | Not induced | Unknown | Needs Dynamic QA |

### Show Desk

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Not scored | Unknown | Fixture has classes |
| Loading | Yes | Good | Settles into full workbench |
| Success | Yes | Good | Next action and map are clear |
| Partial | Yes | Good | 0 of 5 classes complete shown |
| Error | Not induced | Unknown | Needs Dynamic QA |

### Entry Management

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Mixed | Monogram pending route has no visible empty-state guidance in captured viewport |
| Loading | Yes | Good | Settles into counts/list |
| Success | Yes | Good | Controls are rich and mostly clear |
| Partial | Yes | Partial | Status and check-in transitions exist; partial bulk failure not observed |
| Error | Not induced | Unknown | Needs Dynamic QA |

### Reports

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Not scored | Unknown | Fixture has reportable data |
| Loading | Yes | Good | Preview renders |
| Success | Yes | Mixed | Broad report list but raw selected values |
| Partial | Yes | Mixed | Disabled class filter until trial selection is sensible |
| Error | Not induced | Unknown | Needs Dynamic QA |

### Submit Results

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Good | Submission history says none recorded |
| Loading | Not observed | Unknown | N/A |
| Success | Not submitted | Unknown | Read-only audit |
| Partial | Yes | Poor | Missing AKC numbers warn but do not obviously block send |
| Error | Not induced | Unknown | Needs Dynamic QA |

**Dead ends found:** Legacy `phase=show-desk` URL lands on Setup, not Show Desk; Monogram attention link lands on an empty pending list.

**Missing error handling:** Partial bulk operation failures and submit-results network failures were not observable from fixtures.

## Pass 6: Flow Integrity

**Primary flow tested:** Secretary starts on dashboard, creates/configures a show, handles show-day operations, manages entries, prints reports, controls results, and prepares sanctioning-body submission.

**Step-by-step findings:**

| Step | Action | Friction | Severity |
| --- | --- | --- | --- |
| 1 | Open dashboard | Strong orientation and attention list | None |
| 2 | Start show creation | Clone/defaults are strong; later steps locked | Medium |
| 3 | Configure existing show | Workbench tabs are coherent | None |
| 4 | Use Show Desk | Next-best-action is strong; scratch/pull not first-class | Medium |
| 5 | Manage entries | Deep controls work; high density under pressure | Medium |
| 6 | Use attention link | One link lands on empty filtered state | High |
| 7 | Print reports | Report inventory good; selected labels raw | Medium |
| 8 | Release results | Presets and inheritance are clear | None |
| 9 | Submit results | Warning exists but final actions remain enabled next to raw XML | High |
| 10 | Follow legacy show-desk URL | Lands on Setup instead of Show Desk | High |
| 11 | Use secretary sidebar My Shows | Lands on exhibitor `/exhibitor/entries` | High |

**Abandonment risks:**

- A cold-start secretary may not understand how the show-creation wizard gets from details to open entries.
- A show-day secretary may start at Show Desk, then have to remember Entry Management owns scratch/pull transitions.
- A closeout secretary may hesitate at raw XML and enabled submission buttons while required registry data is missing.

**Recovery gaps:**

- Missing back/undo: Not assessed for mutating status changes.
- No cancel option: Not assessed for mutating dialogs.
- Destructive with no confirm: Not assessed; no destructive actions were clicked.

**Flow verdict:** Completable with friction. The canonical workbench consolidation is working, but three trust breakers remain: stale attention data, legacy show-desk redirect, and closeout warnings that do not become clear blockers.

## UX Audit Summary

**Overall UX health:** Needs Work. The secretary experience is much more coherent than the old page-by-page findings implied, especially Setup, Show Desk, Entry Management, and Results Control. The remaining issues are concentrated in trust, pressure routing, and closeout confidence.

### Critical

No P0/Critical finding observed in this read-only slice.

### High Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Legacy `phase=show-desk` redirects to Setup | 1, 6 | Secretary can land on the wrong surface during show-day work | Low |
| Dashboard attention item can disagree with target Entry Management state | 1, 5, 6 | Cross-show triage loses trust | Medium |
| Submit Results leaves send action enabled beside missing-registration warning | 1, 4, 5, 6 | Risky closeout and stressful official submission | Medium |
| Secretary sidebar "My Shows" routes to exhibitor flow | 1, 2, 6 | Secretary can land on the wrong role surface | Low |

### Medium Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Scratch/pull is not first-class from Show Desk | 2, 3, 6 | Worst-hour changes take route knowledge | Medium |
| Create wizard hides later setup path behind disabled steps | 4, 6 | Cold-start secretary cannot see the road to open entries | Medium |
| Reports closed select values show internal ids | 1, 3, 4 | Print workflow feels less polished/trustworthy | Low |
| Day-of announcement baseline was not completed from Message Center | 2, 4 | The feature exists through consolidated messaging, but the walked workbench surfaces did not expose it | Low |

### Low Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Pulled/scratches/pull requests naming diverges | 1, 3 | Minor mental-model wobble | Low |

### Quick Wins

- Route `phase=show-desk` to `/shows/:showId/show-desk`, not setup.
- Use human selected labels in Reports controls.
- Rename Pulled/Pull Requests/Scratches consistently.
- Make Submit Results warning state disable or gate `Send to AKC` until required fields are resolved or explicitly acknowledged.

### Duplication Question

Does any recommendation duplicate an existing page? The scratch/pull recommendation could duplicate Entry Management if implemented as a new Show Desk table. Duplication is not justified. The right consolidation-safe fix is a deep-link or focused shortcut from Show Desk into the existing filtered Entry Management surface, preserving Entry Management as the owner of bulk/status workflows.

### Data Caveat

Some symptoms may be bad seed data, especially Monogram's dashboard attention count and pending-entry target. That should not be dismissed as "only data": the UX requirement is that secretary attention links stay trustworthy even when show data is incomplete or inconsistent.

This audit did not prove the root cause of the Monogram mismatch. The recommendation is intentionally source-of-truth alignment between dashboard attention counts and Entry Management filters, not a presumed query fix.

### Follow-Up Tracking

`OPEN-TODOS.md` now carries the review follow-ups that should not be lost before Phase 5 synthesis: the secretary sidebar route bug, the dashboard attention count-source verification, the Message Center day-of announcement baseline, and a seeded move-up request walk.

### Recommendations

1. Fix the two routing/trust issues first: legacy Show Desk redirect and dashboard attention count-source mismatch.
2. Harden Submit Results into a checklist-first closeout flow that blocks or explicitly gates risky submission.
3. Add consolidation-safe Show Desk shortcuts into filtered Entry Management for scratch/pull/conflict work.
4. Re-run the day-of announcement and move-up baselines with the right seeded states.
5. Polish report labels and setup wizard preview after the high-priority trust work lands.
