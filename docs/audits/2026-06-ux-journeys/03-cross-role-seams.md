# UX Audit: Cross-Role Seams

**Date:** 2026-06-13
**Auditor:** Codex
**Scope:** Phase 4 read-only baseline from `docs/plan-ux-journey-audit.md`
**Intent targets:** Exhibitor — "This respects my time"; Trial Secretary — "That was easy"
**Sources:** `docs/INTENT.md`, Phase 2/3 journey audits, Playwright two-context walk on `http://127.0.0.1:5173`, read-only Supabase inventory
**Accounts:** `exhibitor1@myk9t.com`, `secretary@myk9t.com`

## Audit Constraints

- The worktree dev server points at the shared Supabase project. Scratch, waitlist offer, message send, refund, and results publish actions were not submitted because they would mutate shared data.
- The read-only inventory found zero `waitlist_entries`, zero scratch/move-up request statuses, and one existing withdrawn/refunded entry. That means the waitlist offer and exhibitor-originated scratch request seams could not be completed end to end without approved seed mutations.
- The audit still captured live, two-context evidence for the seam surfaces, empty states, and one real withdrawal/refund state mismatch.

## Evidence Index

| Evidence | Artifact |
| --- | --- |
| Exhibitor My Shows / entry status hub | `artifacts/phase4-exhibitor-my-shows.png` |
| Secretary dashboard | `artifacts/phase4-secretary-dashboard.png` |
| Secretary Show Map entry actions | `artifacts/phase4-secretary-show-map-entry-actions.png` |
| Exhibitor Edit Entry deadline block | `artifacts/phase4-exhibitor-edit-entry-deadline.png` |
| Exhibitor message route blank state | `artifacts/phase4-exhibitor-message-route-empty.png` |
| Secretary message history empty state | `artifacts/phase4-secretary-messages-empty.png` |
| Secretary Message Center compose | `artifacts/phase4-secretary-message-center-compose.png` |
| Secretary Entry Management waitlist empty state | `artifacts/phase4-secretary-entry-management-waitlist-empty.png` |
| Exhibitor waitlist empty state | `artifacts/phase4-exhibitor-waitlist-empty.png` |
| Secretary Pulled tab empty state | `artifacts/phase4-secretary-entry-management-pulled-empty.png` |
| Secretary Headline withdrawn/refund row | `artifacts/phase4-secretary-headline-withdrawn-refund-row.png` |
| Exhibitor Headline upcoming mismatch | `artifacts/phase4-exhibitor-headline-upcoming-mismatch.png` |
| Secretary Heritage Results Control | `artifacts/phase4-secretary-heritage-results-control.png` |
| Exhibitor Heritage results empty state | `artifacts/phase4-exhibitor-results-empty.png` |

## Seam Walk Summary

| Seam | Planned flow | Read-only result | State agreement | Latency check | Tone |
| --- | --- | --- | --- | --- | --- |
| Scratch request | Exhibitor requests -> secretary sees -> exhibitor confirmation | Not implemented/visible from exhibitor path after deadline; secretary can scratch/no-show from Show Map | Fails: no shared request state observed | Blocked by no mutating request fixture | Stressful for exhibitor: dead-end after deadline |
| Waitlist offer | Secretary offers -> exhibitor notification -> acceptance -> both sides update | Fixture has zero waitlist rows; code path sends offer via message thread, but not visible in live data | Inconclusive | Blocked by no waitlist fixture | Empty states are calm but generic |
| Entry question | Exhibitor messages -> secretary reply -> thread visibility | Secretary history has clear empty state; exhibitor direct `/messages/:showId` route rendered blank main content | Fails on exhibitor entry point | Blocked by no send approval | Secretary side calm; exhibitor side dead-end |
| Refund/withdrawal | Exhibitor withdraws -> secretary accounting view | Real Headline row shows secretary: withdrawn, reason, $30 refunded; exhibitor show detail still says Upcoming | Fails: roles disagree | Existing data only; no live mutation | Trust-breaking |
| Results publish | Secretary publishes -> exhibitor reveal | Same-show controls and results tab visible; no publish mutation submitted | Partial: secretary "After Class"; exhibitor "No results yet" without release status explanation | Blocked by no publish approval | Calm but under-explained |

---

## Pass 1: Mental Model Alignment

**What UI suggests:** Cross-role actions should feel like one shared workflow: an exhibitor asks or changes something, the secretary sees the operational version, and both sides agree on status.

**What it actually does:** Secretary operational surfaces are richer than exhibitor surfaces. Several seams exist as secretary-side status controls, not exhibitor-originated requests. The one real withdrawn/refunded entry disagrees across roles.

**Misalignment gaps:**

| UI Element | User Expects | Actually Does | Severity |
| --- | --- | --- | --- |
| Exhibitor `Edit Entry` after deadline | A path to request a pull/scratch or contact the secretary | Shows only "Entry deadline has passed" with Cancel/Close | High |
| Secretary Show Map entry actions | Row action includes every urgent action and contact fallback | Offers Mark checked in, Move up, Scratch/no-show; no message action for the observed Ziva row | Medium |
| Exhibitor `/messages/:showId` | Conversation starter or clear empty state | Renders the shell/sidebar with blank main content | High |
| Secretary Communication History | Clear show-scoped message state | Shows "No messages in June 2026 yet" and Clear filter | Low |
| Message Center compose from show-filtered page | Inherits selected show | Opens with "Select a show to continue" | Medium |
| Headline withdrawn/refunded entry | Both roles show the same withdrawn/refunded state | Secretary sees Withdrawn + reason + $30 refunded; exhibitor sees Upcoming | High |
| Heritage Results Control vs Results tab | Secretary release setting explains exhibitor visibility | Secretary sees "After Class"; exhibitor sees "No results yet" with no release-state explanation | Medium |

**Jargon found:** `entryTab=scratches`, Pulled/Pull Requests/Scratch used interchangeably, "After Class" without exhibitor-facing translation, "Partial Refund" where the full $30 entry fee is refunded.

## Pass 2: Information Architecture

**Current structure:**

- Exhibitor side: My Shows, Show Details My Entries, `/at-show`, direct `/messages/:showId`, Message Center.
- Secretary side: Show Desk/Show Map, Entry Management, Pull Management, Communication History, Message Center, Results Control.
- Shared backend states: entries, waitlist entries, show messages/message threads, result visibility settings.

**IA issues:**

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| Scratch is secretary-owned, not request-owned | Exhibitor My Shows / Edit Entry vs Show Map | Exhibitor has no post-deadline request path, while secretary can pull a dog | Add a link/action into the existing message or pull-request surface; do not add a second scratch table. |
| Waitlist offer lacks live fixture coverage | Entry Management / My Shows | Both sides show zero waitlist inventory, so the acceptance/reveal path is unproven | Seed one offered waitlist row for Phase 4 completion or Dynamic QA. |
| Message creation split by role | Exhibitor message route vs secretary Message Center | Secretary has clear history/compose; exhibitor direct route can be blank | Give exhibitor route the same empty-state quality and start-conversation affordance. |
| Refund accounting hidden from exhibitor | Show Details My Entries | Secretary sees refund state; exhibitor sees the class as Upcoming | Reuse the entry status/payment display source in exhibitor My Entries/show detail. |
| Result release explanation is one-sided | Results Control / Results tab | Secretary understands release preset; exhibitor only sees generic no-results copy | Add released/unreleased/not-scored explanation to the existing Results tab. |

**Visibility problems:**

- Hidden but should be visible: post-deadline request/contact path for exhibitors; refund/withdrawal status on exhibitor Show Details; selected show in Message Center compose.
- Prominent but should be secondary: full entry list remains above Pull Management after selecting Pulled; internal `scratches` URL vocabulary.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element | Looks Like | Actually Is | Clear? |
| --- | --- | --- | --- |
| Exhibitor Edit Entry | Recovery/action path | Deadline block only | No |
| Secretary entry kebab | Operational row actions | Check-in, move-up, scratch/no-show | Yes |
| Exhibitor message route | Message page | Blank content for the tested show | No |
| Secretary Communication History | History/filter page | Read-only thread list | Yes |
| Message Center Compose | Contextual show message | Requires show selection again | Partial |
| Pull Management tab | Pull/refund queue | Empty queue below large entry list | Partial |
| Results Control presets | Release policy controls | Mutating visibility presets | Yes, but dangerous to click during audit |
| Results empty state | No-results explanation | Generic pending-results copy | Partial |

**False affordances:** `Edit Entry` suggests changes are possible, then dead-ends. Pulled tab appears selected, but a long entry list still dominates above the Pull Management panel.

**Hidden affordances:** The secretary can change status to Withdrawn and record refunds, but the exhibitor does not see that operational state in Show Details.

**Recommended fixes:**

- Replace post-deadline Edit Entry dead-end with a non-duplicative link: "Request a pull / message secretary" into the existing messaging or Pull Management flow.
- Make `/messages/:showId` render a real empty state with a start-conversation CTA for exhibitors.
- When Message Center compose is opened from a show-filtered secretary page, preselect that show.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step | Decisions Required | Can Be Reduced? |
| --- | --- | --- |
| Exhibitor deadline block | Decide what to do when editing is blocked | Yes: provide the one next action. |
| Secretary Show Map row action | Pick check-in, move-up, scratch/no-show | Mostly fine; add contact fallback when no message action is available. |
| Secretary Message Center compose | Pick show, recipient, message type | Yes: inherit the show context. |
| Pull Management | Interpret Pulled vs Pull Requests vs scratches | Yes: one vocabulary. |
| Exhibitor result empty state | Infer no scores vs not released vs no result | Yes: show release/status reason. |

**Missing defaults:**

- Message Center compose should default to the current `showId`.
- Exhibitor message route should default to a start state, not blank content.
- Exhibitor withdrawn/refunded entries should default to a terminal-status card, not Upcoming.

**Unnecessary complexity:**

| Complexity | Who Needs It | Recommendation |
| --- | --- | --- |
| Pulled/Pull Requests/`scratches` naming split | No one | Standardize on one user-facing term. |
| Re-selecting show in context | No one | Carry the route filter into compose. |
| Showing terminal entries as Upcoming | No one | Apply the same terminal-state normalization used by secretary surfaces. |

**Cognitive load score:** Medium-high. The secretary can usually find an operation, but exhibitors have to infer what happens after a deadline, message gap, withdrawal, or unreleased result.

## Pass 5: State Coverage

### Scratch / Pull

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Mixed | Secretary Pull Management empty state is calm; exhibitor has no request empty state. |
| Loading | Yes | Good | Pages resolve. |
| Success | Partial | Mixed | Secretary-side scratch/no-show exists; exhibitor-originated request not observed. |
| Partial | Yes | Poor | Post-deadline exhibitor state blocks action without recovery. |
| Error | Not induced | Unknown | Needs Dynamic QA/local seed. |

### Waitlist Offer

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Generic | Both sides show zero waitlist, but no offer fixture exists. |
| Loading | Yes | Good | Pages resolve. |
| Success | Not observed | Unknown | No waitlist rows in shared seed. |
| Partial | Not observed | Unknown | Offered/expired/accepted states not visible. |
| Error | Not induced | Unknown | Needs seeded Dynamic QA. |

### Entry Question / Messages

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes/No | Split | Secretary empty state is clear; exhibitor route blank. |
| Loading | Yes | Good | Pages resolve. |
| Success | Not submitted | Unknown | Send/reply not tested due shared-data mutation gate. |
| Partial | Yes | Poor | Compose does not inherit show context. |
| Error | Not induced | Unknown | Needs message send failure test. |

### Refund / Withdrawal

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Mixed | Pull Management pending empty state exists. |
| Loading | Yes | Good | Pages resolve. |
| Success | Yes | Split | Secretary row shows withdrawn/refunded; exhibitor row still says Upcoming. |
| Partial | Yes | Poor | "Partial Refund" appears with `$30.00 refunded` for a $30 entry. |
| Error | Not induced | Unknown | Needs refund failure test. |

### Results Publish

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Calm | Exhibitor sees "No results yet." |
| Loading | Yes | Good | Pages resolve. |
| Success | Not submitted | Unknown | Publish/release mutation not tested. |
| Partial | Yes | Mixed | Secretary release preset visible; exhibitor has no matching release explanation. |
| Error | Not induced | Unknown | Needs release failure test. |

**Dead ends found:** Exhibitor post-deadline Edit Entry, exhibitor direct message route.

**Missing error handling:** Message send/reply failures, waitlist offer notification failure, refund processing failure, and result publish failure were not induced in this read-only baseline.

## Pass 6: Flow Integrity

**Primary flow tested:** Two browser contexts inspected the planned exhibitor-secretary seams, stopping before shared-system mutations.

**Step-by-step findings:**

| Step | Action | Friction | Severity |
| --- | --- | --- | --- |
| 1 | Exhibitor tries to edit after deadline | Dialog says deadline passed; no request/contact path | High |
| 2 | Secretary opens Show Map row actions | Scratch/no-show and move-up are available | Low |
| 3 | Secretary looks for row-level message action | Not present for observed Ziva row | Medium |
| 4 | Exhibitor opens direct message route | Blank main content | High |
| 5 | Secretary opens Communication History | Clear show-filtered no-message state | None |
| 6 | Secretary opens Message Center compose | Does not inherit selected show | Medium |
| 7 | Secretary opens Waitlist/Pulled tabs | Waitlist has zero fixture rows; Pulled queue empty below entry list | Medium |
| 8 | Compare Headline withdrawn/refund state | Secretary and exhibitor disagree | High |
| 9 | Compare Heritage result controls/results | Secretary sees release preset; exhibitor sees generic no-results state | Medium |

**Abandonment risks:**

- Exhibitor gives up or contacts the secretary outside the app when a pull/scratch is needed after deadline.
- Exhibitor misses or cannot initiate an entry question because `/messages/:showId` has no visible start state.
- Refund support questions rise because the secretary and exhibitor see different states for the same withdrawn/refunded entry.

**Recovery gaps:**

- Missing back/undo: Not assessed for mutations.
- No cancel option: Dialogs observed had close/cancel.
- Destructive with no confirm: Not assessed; no destructive/mutating action was clicked.

**Flow verdict:** Not complete. The read-only surfaces reveal several cross-role seams, but true latency and state-agreement checks require approved seed mutations or local Dynamic QA fixtures.

---

## UX Audit Summary

**Overall UX health:** Needs Work. Secretary-side operations are functional and consolidated, but exhibitor-side seam states are incomplete or stale in the places where cross-role trust matters most.

### Critical

No P0/Critical finding observed in this read-only baseline.

### High Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Exhibitor has no post-deadline pull/scratch request or contact path | 1, 3, 5, 6 | Blocks the planned scratch-request seam and pushes users outside the app | Medium |
| Exhibitor `/messages/:showId` can render blank main content | 1, 3, 5, 6 | Blocks the entry-question seam from the exhibitor side | Low-Medium |
| Withdrawn/refunded Headline entry disagrees across roles | 1, 2, 5, 6 | Breaks trust in refund/withdrawal status | Medium |

### Medium Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Message Center compose does not inherit show context | 1, 3, 4, 6 | Adds avoidable show-day friction | Low |
| Waitlist offer seam has no seeded row to verify notification/acceptance | 5, 6 | Launch path remains unproven | Low seed, medium verification |
| Pull Management vocabulary is split across Pulled/Pull Requests/scratches | 1, 2, 4 | Increases pressure-state ambiguity | Low |
| Results tab does not explain release state from secretary settings | 1, 2, 5, 6 | Exhibitors cannot tell no results vs not released | Low-Medium |
| Row-level message fallback absent for observed Show Map entry | 1, 3, 6 | Secretary may need to leave context to contact exhibitor | Medium |

### Low Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| "Partial Refund" with full amount refunded is confusing | 1, 4, 5 | Minor accounting wording distrust | Low |

### Quick Wins

- Preselect the current show in Message Center compose when opened from `/secretary/messages?showId=...`.
- Give exhibitor `/messages/:showId` the same quality empty state as secretary Communication History.
- Standardize the user-facing pulled/scratch vocabulary.
- Add result empty-state copy that says whether results are unreleased, unscored, or truly absent.

### Recommendations

1. Fix the exhibitor-side dead ends first: post-deadline entry recovery and blank message route.
2. Align terminal entry/payment state rendering between secretary Entry Management and exhibitor My Shows/Show Details.
3. Seed a safe Phase 4/Dynamic QA fixture for waitlist offered, scratch requested, move-up requested, and result release so latency/state-agreement can be measured without touching shared staging data.
4. Keep remedies consolidation-safe: link into Message Center, Pull Management, Entry Management, and Results tab rather than adding duplicate surfaces.

## Duplication Question

Does any recommendation duplicate an existing page? Not if scoped correctly. Scratch/pull should link to the existing messaging or Pull Management/Entry Management ownership lane. Entry questions should use the existing Message Center and `/messages/:showId` route. Results should improve the existing Results tab and Results Control handoff. New standalone scratch, waitlist, messaging, refund, or results pages are not justified.

## Follow-Up Needed To Complete Phase 4

- Get explicit approval for shared Supabase seed mutations, or create a local-only seeded Dynamic QA fixture.
- Walk these flows end to end after seeding: exhibitor scratch request, waitlist offered/accepted, exhibitor question + secretary reply, withdrawal/refund state change, results release.
- Record latency without refresh and state agreement for each seeded seam.

---

## Fixture Harness Update — 2026-06-15

A write-safe fixture harness now models all five seams against the real app
endpoints (verified against source), so the seam **state-transition logic and
cross-role state agreement are proven deterministically** — a real advance over
the read-only baseline above, which could not submit any mutating action.

**Shipped (safe, no shared-Supabase risk):**

| Artifact | Purpose |
| --- | --- |
| `apps/myk9show/src/test/e2e/fixtures/phase4SeamFixture.ts` | One complete cross-role show (secretary + two exhibitors, dogs, classes, entries, enrollment, waitlist row) with the five seed states from the plan; `createPhase4SeamState()` returns a fresh deep clone per test. |
| `apps/myk9show/src/test/e2e/fixtures/phase4SeamRoutes.ts` | Pure request handler that fulfils every seam write in memory + `assertNoSharedWrites` / `assertNoUnhandledAppDataMutations` + the Playwright `installPhase4SeamRoutes(page, state)` wrapper. |
| `apps/myk9show/src/test/phase4-seam/phase4SeamRoutes.test.ts` | 18 vitest cases — each seam's transition, cross-role agreement, malformed/unknown-row rejection, and the write-safety guarantees. All green. |
| `apps/myk9show/src/test/e2e/show/phase4CrossRoleSeams.spec.ts` | Two-context live walk (latency + screenshots), ready to run; self-skips until a read strategy is wired (see below) so it never touches shared data. |

**Seam transitions now proven by the harness unit tests:**

| Seam | Proven transition (write-safe) | Real-browser latency |
| --- | --- | --- |
| Scratch / pull | exhibitor `scratch-requested` → secretary guard-approve (`.single()`) → `scratched` + `pulled`; stale-guard = PGRST116/`data:null` (approve throws) | Pending live walk |
| Waitlist | seed `waiting` → secretary `offered` → `acceptWaitlistOffer` guarded offered fetch (`.single()`) → entry insert (`confirmed`) → waitlist row **DELETEd** | Pending live walk |
| Entry question | thread `.single()` read = 406/`data:null` before create → INSERT → reuse on next `.single()`; message send → secretary read → reply → exhibitor read | Pending live walk |
| Refund / withdrawal | `stripe-refund-entry` → entry `refunded`/`withdrawn` + enrollment refund metadata; partial-refund clamps to fee | **PASS — live walk 2026-06-18** (see below) |
| Results release | class `results_released_at` set → `view_entry_with_results` flips hidden → visible | Pending live walk |

> **Fidelity fixes (2026-06-15, post-review).** The harness now honors PostgREST
> `.single()` semantics — a no-row match returns HTTP 406 / `PGRST116`
> (`data:null`), not `200 []` — so the gated live walk reflects real app
> behavior for `getOrCreateThread` (falsy-`data` → insert), `approveScratchRequest`
> (throws on guard miss), and the waitlist offered-fetch. Waitlist acceptance is
> modeled as the real **fetch-offered → insert-entry → DELETE-row** sequence
> (not a `status='accepted'` PATCH), and the seed status is the app's `waiting`.

**Blocked endpoint (documented per fixtures-plan guardrail #37):** the harness
blocks every seam **write** locally, but the app reads `entries` / `classes`
from the **replication layer (IndexedDB)**, not PostgREST. A network interceptor
alone therefore cannot surface the seeded `phase4-` rows in a live browser. The
live walk needs one of:

- **(A)** seed the fixture show into the IndexedDB replication stores before
  load (couples to replication internals — store names + `{syncStatus, data}`
  row shape, as read in `atShowOfflineScoring.spec.ts`), or
- **(B)** a **local** Supabase instance seeded with the fixture rows, dev server
  pointed at it (the plan's documented fallback; mutates only an ephemeral local
  DB, never shared staging).

This choice is the Phase 5 human-gate decision. Real-browser latency and the
`phase4-dynamic-*` screenshots land after a strategy is chosen and
`PHASE4_SEAM_FIXTURE_READY=1` is set.

### Read-strategy decision — 2026-06-23

**Chosen: render-only via REST read-interception (Option A-lite).** Owner accepted
the 18-case unit suite as the propagation/state-agreement proof, so the remaining
gap is per-role render evidence, not real-browser latency. Real-browser
**latency numbers are intentionally not produced.** Plan + rationale (incl. why
local Supabase and direct IndexedDB seeding were rejected):
[`docs/plan-phase4-seam-render-only.md`](../../plan-phase4-seam-render-only.md).

**Wired + unit-proven 2026-06-23:** the harness now serves the replication
sync-down GETs (`shows` / `trials` / `classes` / `view_authenticated_entry_results`)
from fixture state in the exact snake_case shape each replication mapper reads,
honoring the `eq` scope filter and the `updated_at=gt.<iso>` watermark — so the
app's own sync writes the fixture show into IndexedDB and renders it. 15 new
assertion-first vitest cases (`src/test/phase4-seam/phase4SeamSyncReads.test.ts`)
pin the served shapes/scoping/watermark + the read-only-table write-safety guard;
the 18-case write-safety suite stays green. **Remaining:** flip
`phase4CrossRoleSeams.spec.ts` to render+screenshot per role (drop the now
unit-owned propagation asserts), wire the identity remap to the real signed-in
exhibitor, set `PHASE4_SEAM_FIXTURE_READY=1`, and capture `phase4-dynamic-*` shots
where a dev server runs reliably (not a worktree session — Preview serves `main`).

## Refund / Withdrawal — live two-context walk — 2026-06-18

**Outcome: PASS.** The withdrawn/refunded entry renders the same terminal state
across exhibitor and secretary surfaces.

**Fixture.** Added a pure-exhibitor-owned gap fixture so the exhibitor-only Show
Details "My Entries" tab could be walked (the existing `…059` fixture is owned by
a site-admin, who gets the management `EntriesTab` instead — `ShowDetailsPage`
`canManageShow` switch). New `seed-demo.sql` row `…060`: **Ranger** (owned by
`e2e-exhibitor`) in **Exterior Excellent**, `entry_status='withdrawn'` /
`payment_status='refunded'`, $30 refund.

**Surfaces verified (as `e2e-exhibitor`, fresh incognito):**

| Surface | Data path | Result |
| --- | --- | --- |
| Standalone My Entries (`/exhibitor/entries`) | direct PostgREST (`getUserEntries`) | Withdrawn + Refunded |
| Show Details → My Entries tab (`MyEntriesTab`/`DogEntriesSection`) | replication store (`useEntryStore`) | **Withdrawn · Refunded** |
| Secretary Entry Management | direct read | Withdrawn + reason + $30 refunded |

**Two real bugs the walk surfaced (neither caught by the unit harness):**

1. **Phantom class section "A"** — `classMappers.ts` (`mapDatabaseToClass`)
   defaulted a NULL `section` to `'A'`, printing "Interior Advanced A" /
   "Exterior Excellent A" (only Novice has A/B). Live in `main`. **Fixed** →
   `?? ''` + regression test; also corrects `runOrderUtils` section grouping.
2. **(Process, not code)** The withdrawn entry first appeared as "Upcoming". After
   confirming the DB (`entry_status='withdrawn'`), the PostgREST sync response,
   and the IndexedDB `replicated_tables` record were **all correct**, the cause
   was that the dev server on `:5173` was serving a **different, stale worktree**
   (`claude/flamboyant-davinci-3399b7`, pre-#800) whose `DogEntriesSection` lacked
   the `getRemovedStateLabel` wiring. Re-running current code (this worktree, with
   #800) on `:5174` rendered "Withdrawn · Refunded" correctly. **Lesson:** before
   trusting live behavior, confirm which worktree the dev server's cwd points at
   (`lsof -p <pid> -d cwd`).

**Minor follow-ups filed (OPEN-TODOS P1-04w-1 / -2):** "Registration #Pending"
subtitle on a terminal My Entries card; "(just now)" relative time for a
future-dated `refunded_at` (`formatRelativeTime` + the seed using a future date).
