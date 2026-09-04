# Exhibitor elderly-novice UX walk — 2026-09-03

## Linear filing follow-up — 2026-09-03 20:36 UTC

The user explicitly requires **every confirmed actionable finding in Linear, regardless of severity or recurrence**. This supersedes the original report-only P2 policy and any contradictory historical text below. Linear is the only active work queue; the report and memory are evidence/history.

All seven P2s are now Todo / Medium (canonical P2), with self-contained reproduction, observed/expected behavior, confidence, next action, acceptance criteria and closure proof. Five issues were created; MYK9-165 and MYK9-88 were reopened and retitled for their exact remaining regressions. Completed historical scope was preserved.

| Audit finding | Canonical Linear issue | Scope |
| --- | --- | --- |
| C2 / E1 date subfinding | [MYK9-366](https://linear.app/myk9-platform/issue/MYK9-366) | Dog Career dates |
| E13 | [MYK9-367](https://linear.app/myk9-platform/issue/MYK9-367) | Wizard service fee |
| EUX-2026-09-03-01 | [MYK9-165](https://linear.app/myk9-platform/issue/MYK9-165) | Double discard confirmation |
| EUX-2026-09-03-02 | [MYK9-368](https://linear.app/myk9-platform/issue/MYK9-368) | Registry text size |
| EUX-2026-07-26-07 | [MYK9-88](https://linear.app/myk9-platform/issue/MYK9-88) | Unnamed dog controls |
| E21 | [MYK9-369](https://linear.app/myk9-platform/issue/MYK9-369) | Dog picker search |
| E22 | [MYK9-370](https://linear.app/myk9-platform/issue/MYK9-370) | Historical payment details |

MYK9-347 remains the P1 offline issue; it is now In Progress per current Linear. This task did not change its status.

The automation prompt now files all confirmed actionable findings at any severity after archived-inclusive deduplication. Schedule, model and execution environment were preserved. No new full browser run or source change occurred during filing.

Evidence review found several retained screenshots captured blank/loading or obscured content. MYK9-366, MYK9-368 and MYK9-370 explicitly distinguish recorded browser text/measurements from missing visual proof and require fresh settled screenshots. Mobile payment/cart and second-discard captures were usable; the dog-validation capture supplies form context, not proof of accessible names.

Screenshot upload was rejected by automatic approval review because of possible disclosure of application/account data and lack of specific image-export authorization. No screenshots were uploaded, no attachment was finalized, and no workaround was attempted. Text evidence and execution criteria are already in Linear. Ask once for permission to attach the usable screenshots if that extra evidence is wanted.


## Original audit (historical evidence)

## Assessment and scope

**Needs work; independent end-to-end readiness is not established.** Normal sign-in, discovery, dog viewing, class selection and payment review are usable with friction. Cold offline My Shows renders an empty main region at all three widths. Real checkout completion and live ringside tasks remain unverified because the available fixture and safe mutation boundary did not support them.

- Detecting task: `weekly-exhibitor-ux-walk`, Codex; browser run approximately 19:46–20:09 UTC, September 3, 2026.
- Baseline: fetched `origin/main`, `7fcfe1646af32e87410b702560d2483d42039dfc`, isolated audit worktree.
- Persona: elderly first-time exhibitor; labels and displayed money/dates taken literally. Intent: “This respects my time.”
- Browser: headless Chrome; desktop **1440×900**, tablet **768×1024**, mobile **390×844**; browser timezone **America/Chicago**. Mouse/touch-sized viewport automation is not a real-device motor or screen-reader study.
- Used the current canonical seeded exhibitor from testUsers and environment-backed credentials. The requested legacy E2E account is retired. Account role displayed **Exhibitor**, with no staff role. No credentials exported.
- Fixture: **252 dogs**, **253 grouped My Shows cards** (61 upcoming, 192 completed); load show has **244 class entries across 61 dogs**. This is not a clean first-user fixture.
- No source implementation edits, migrations, deployments, commits, PRs, real payments, entry submissions, dog saves/deletions, or messages/emails sent.
- **Shared cart side effect:** selecting one class automatically updated a hosted cart. Cart `5afa7466-de8d-4b46-855e-aa12f7928c2e` held Juni / Load 1 Class 1 / $30 at the last read. The session began with a cart badge already present. No broad cleanup was attempted because pre-existing contents could not safely be reconstructed. A local draft was also generated. Do not describe this run as having zero shared-data writes.
- Linear: **one evidence comment added to existing MYK9-347**, no new issues and no status changes. Existing Todo state was already present. No pending approval is needed for that authorized action.
- Audit-only workflow; OPSX implementation was not applicable. No unit/app test suite was run because no source changed. Browser evidence and `git diff --check` were used; no claim of full automated regression coverage.

## Coverage and records

“Checked” below means the stated subpath only. A route rendering is not evidence that every mutation, failure mode, or authorization boundary works.

| Journey / goal | Desktop | Tablet / mobile | Observed result and boundary |
| --- | --- | --- | --- |
| Sign in, recover password, sign out | Checked two-step login and reset form | Mobile sign-out and protected redirect checked | Valid exhibitor session; reset email not sent; signed-out My Shows redirected to sign-in with return URL. |
| Find and inspect a show | Discovery, load-show overview/trials/classes | Read-only class at both widths | Dates/fees and named view controls available. No staff edit/start/supply actions on sampled public class UI. Server RBAC denial untested. |
| My Shows / entry status | Loaded and compared totals | Mobile Completed filter exercised | 4 pending + 249 accepted = 253; Completed 4 + 188 = 192. This does not prove all backend result pages complete. |
| Dogs / dog record | List, Overview, Career, Records | Registry/date layout and form checks | 25-per-page list; 252 fixture dogs. Career has four upcoming entries, but dates disagree. Health/training/pedigree CRUD not exercised. |
| Add/Edit dog | Add cancellation, invalid Edit save | Add required validation, cancellation | Invalid submissions did not save. Create/update/delete persistence gates remain untested. |
| Registration | Dog → class → payment; back, refresh, draft recovery | Three steps at tablet/mobile | Next gated until selection; named steps; manual Load Draft restored selected class after refresh. No agreement acceptance or Submit & pay. |
| Cart and payments | Payment history and arithmetic | Payment review/history at both widths; mobile cart | Wizard quotes $30; cart $32.10. Paid 321.00 − refunded 112.35 = net 208.65; amount due 180.00. New payment rows have shows/receipts; older rows incomplete. No receipt settlement proof. |
| Closed show / contact / results | Closed entry guidance | Mobile contact composer and withheld results | Past Heartland entries closed; contact link reaches Messages; no message sent. Results eventually show “being reviewed,” not released placements. |
| At-show | Landing and direct show gates | Gates checked at both widths | Neither sampled show is live; useful My Shows exit. No actual running order/check-in/armband/conflict/favorite/action-menu proof. Clock-only simulation did not open the gate. |
| Account, storage, help | Profile/Security/Storage and Help | Menu/navigation sampled | Cache confirmation explicitly warns about local cart/draft loss; cancelled. No cache mutation/queue race test. Help opens guide site (draft-preview marking observed). |
| Cold offline recovery | **Failed** | **Failed at both widths** | Blank My Shows main with authenticated shell; restoring network and reload recovers. Details below. |

Evidence: [desktop-my-shows](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/desktop-my-shows.png), [mobile-my-shows](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-my-shows.png), [mobile-dog-validation](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-dog-validation.png), [tablet-classes](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/tablet-classes.png), [mobile-classes](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-classes.png), [desktop-class-readonly](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/desktop-class-readonly.png), [tablet-class-readonly](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/tablet-class-readonly.png), [mobile-class-readonly](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-class-readonly.png), [mobile-results-withheld](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-results-withheld.png), [mobile-signed-out-guard](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-signed-out-guard.png).

Fixture identifiers: load show `a1090000-0000-0000-0010-100000000001`; trial `a1090000-0000-0000-0011-100000000001`; class `a1090000-0000-0000-0012-100000000001`; date-comparison dog `a1090000-0000-0000-0001-100000000001`. Heartland `dededede-0000-0000-0000-000000000010`.

## Pass 1: Mental model alignment

**UI suggests:** the same show has one date; “Total Due” is the amount the next payment step asks for; offline-first means saved entries remain accessible.
**Observed:** Career dates differ by a day, the cart adds a fee absent from wizard total, and cold offline reload yields a blank main.

| UI element | Expected | Observed | Severity |
| --- | --- | --- | --- |
| My Shows offline | Saved entries or explicit recoverable state | Empty main, no actionable recovery within it | High / P1 |
| Career upcoming show | Jan 9 consistently | Jan 8 in four Career rows | Medium / P2 |
| Payment Total Due | Same card quote as cart | $30 → $32.10 | Medium / P2 |

Jargon needing novice context remains in class levels/registry abbreviations. Static “novice” guidance is helpful; no new jargon finding is filed without a demonstrated task failure.

## Pass 2: Information architecture

**Current structure:** My Shows owns entry status, Dogs owns identity/records, show pages own published detail, and My Payments owns financial history. This is a coherent direction.

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| E21 | Wizard dog selection | 252 choices without search/filter | Reuse the existing dog-selection/search pattern in the same step. |
| E22 | Older payment rows | Missing show association and receipt availability impede reconciliation | Repair record provenance/disclosure on My Payments. |
| E13 | Wizard → cart | Two review surfaces disagree about a single quote | Share the canonical total and fee disclosure. |

Hidden but needed: full card amount before commitment and association of old payments with their shows. Prominent but secondary: the huge unfiltered fixture dog list.

## Pass 3: Affordance clarity

| Element | Looks like / function | Clear? |
| --- | --- | --- |
| Named wizard steps | Progress through dogs, classes, payment | Yes at all widths |
| Past-due Contact club | Guidance rather than a dead checkout action | Yes |
| Add/Edit sex combobox | Visually a field, accessible name empty | No for nonvisual use |
| Dog photo button | Interactive control with empty accessible name | No |
| Cache clear confirmation | Describes local loss and preserves cancellation | Yes; destructive action not executed |

No new false-payment CTA defect was reproduced. Improve names on existing controls; do not add another dog editor. Tiny registration text is readable only with effort, even though it does not overflow.

## Pass 4: Cognitive load

| Step | Decisions | Reduction |
| --- | --- | --- |
| Choose dog | Scan up to 252 candidates | Search within the existing picker |
| Choose class | Eligibility, trial and class | Keep static guidance; verify with novice/eligible/ineligible fixtures |
| Pay | Method, agreement, and changing quote | One authoritative amount and explanation |
| Discard Add Dog | Confirm intent twice | One confirmation |

Missing defaults: no evidence supports changing dog sex, date, or eligibility defaults; these should remain explicit.
Unnecessary complexity: duplicate discard prompt serves no separate observed user choice.
**Cognitive load: Medium online; High offline**, where the blank page provides no next step.

## Pass 5: State coverage

| Surface | Empty / partial | Loading | Success | Error / edge |
| --- | --- | --- | --- | --- |
| My Shows | First-user empty fixture unavailable | Delayed reads eventually populate | 253 grouped cards | Cold offline main blank; recovery succeeds after reconnect/reload |
| Dog forms | Required fields explicit | Not a meaningful remote-load test | Save persistence not attempted | Invalid submit, expandable errors and discard exercised |
| Registration | Zero-selection Next disabled | Not exhaustively throttled | Draft/selection recovery works | Full/waitlist, enrollment error and payment failure blocked |
| Payments | Old rows have missing show/receipt | Balance appears after initial rows | Arithmetic reconciles | Failed checkout/refund mutation untested |
| At-show | Clear not-live gate | Inner loading unavailable | Live workflow unavailable | No live/offline check-in fixture |
| Results | Withheld/review message | Transient initial state settled | Released results unavailable | Server access-control proof unavailable |

Dead end: cold offline My Shows main. A transient initial “no results” observation that later settled is not filed as a product defect. Screenshot timing can precede late balance hydration; the balance assertion came from the settled DOM.

## Pass 6: Flow integrity

| Step | Action | Friction / outcome |
| --- | --- | --- |
| 1 | Sign in and discover show | Completed online |
| 2 | Choose existing dog/class | Completed; large picker P2 |
| 3 | Review payment | Reached; fee mismatch P2 |
| 4 | Refresh and restore | Returns to step 1; explicit Load Draft restores choice at step 2 |
| 5 | Submit/payment/confirmation | **Blocked; not executed** |
| 6 | Attend and check in | **Blocked; no live fixture** |
| 7 | View released result | **Blocked; results withheld** |
| Recovery | Discard new dog | Two confirmation prompts P2 |
| Recovery | Reopen without backend/network | **Broken** on My Shows P1 |

**Flow verdict:** online pre-submission flow completable with friction; complete entry-to-show lifecycle not proven; cold offline access broken in the tested simulation. No observed unconfirmed destructive save was filed.

## Active findings and lifecycle

**Eight observed concerns:** 2 new, 6 unchanged; 1 P1 and 7 P2. Classification: 3 product defects, 2 accessibility findings, 3 UX-friction findings. No new P0. These counts exclude historical closure/proof reconciliation below and rejected harness observations.

All records below share this run's baseline, task, role and timestamp. “Unchanged” means prior symptom/family retained, **not** proof of consecutive weekly reproduction. Owners are unassigned/unknown unless the canonical issue says otherwise. Local report rows are evidence, not a parallel executable backlog.

| ID | Status | First / last observed | Evidence recurrence | Classification / source → canonical | Viewports |
| --- | --- | --- | --- | --- | --- |
| MYK9-347 | unchanged | Sep 2 static / Sep 3 browser | 2 detecting tasks; first browser run; underlying mechanism not equated | Product / High → P1 | D/T/M |
| C2 / E1 date subfinding | unchanged | Jul 2 / Sep 3 | Historical family + current replay; intervening runs unverified | Product / Medium → P2 | D/T/M |
| E13 | unchanged | Sep 1 / Sep 3 | 2 audit tasks; first current weekly reproduction | Product / Medium → P2 | Wizard D/T/M; cart M |
| EUX-2026-09-03-01 | new | Sep 3 / Sep 3 | 1 run, twice reproduced | UX friction / Medium → P2 | D/M; T untested |
| EUX-2026-09-03-02 | new | Sep 3 / Sep 3 | 1 run | Accessibility / Medium → P2 | D/T/M |
| EUX-2026-07-26-07 | unchanged | Jul 26 / Sep 3 | Previously observed; intervening broad closure exists, exact names now fail | Accessibility / Medium → P2 | Mobile control check; other widths not separately name-audited |
| E21 | unchanged | Sep 1 / Sep 3 | 2 audit tasks, fixture-heavy | UX friction / Medium → P2 | D/T/M wizard |
| E22 | unchanged (partial) | Sep 1 / Sep 3 | 2 audit tasks; new rows improved | UX friction / Medium → P2 | D/T/M |

### 1. MYK9-347 — cold offline main is blank

**Reproduce:** authenticate online, load My Shows, preserve browser session/storage, intercept Supabase requests with an internet-disconnected error, expose `navigator.onLine=false`, then reload the local application shell. At all widths the authenticated shell remains, but main text is empty. **19 backend requests blocked; zero uncaught page errors.** URL stays at My Shows; the historical issue's onboarding redirect was **not** reproduced.

Expected: useful saved entries or an explicit recoverable offline state. Impact: exhibitor cannot independently reach saved entry information at a venue. Confidence high in the UI failure, uncertain in shared root cause. The simulation allows localhost shell delivery; **installed-PWA cold launch remains a separate proof gate**.

Evidence: [desktop-cold-offline](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/desktop-cold-offline.png), [tablet-cold-offline](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/tablet-cold-offline.png), [mobile-cold-offline](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-cold-offline.png).
Canonical [MYK9-347](https://linear.app/myk9-platform/issue/MYK9-347) is Todo/High; no assignee was returned. Added sanitized comment `251f631e-78d5-46f0-8a20-7186e2d4f547`; no duplicate created. Next: isolate the blank boundary, retain the issue's existing tests, then replay usable cold-offline content/recovery at three widths and in an installed PWA.

### 2. C2 / E1 date subfinding — Career is one day early

On the load dog's Overview/My Shows, show date is **Sat Jan 9, 2027**; all four Career upcoming rows show **1/8/2027**. Public show is **Jan 9–11**. Expected: calendar date agrees across destinations. Impact: loss of confidence in when to attend; no actual missed event claimed. Confidence high for mismatch; date normalization remains a hypothesis.

Evidence: [desktop-career-date](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/desktop-career-date.png), [tablet-career-date](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/tablet-career-date.png), [mobile-career-date](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-career-date.png).
Relevant source: [Career date formatter](/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show/src/components/dogs/DogDetails/Competitions/UpcomingShows/UpcomingShowsSection.tsx:235).
Reuses the July 2 **C2/E1 dog-profile date family**; **E8 was a non-reproduction on public show surfaces**, not a separate confirmed defect. No exact current Linear issue found for formatter/UpcomingShowsSection; MYK9-311 concerns judge availability, a different workflow. Next proof: one date fixture across show/My Shows/Overview/Career in negative and positive UTC offsets, with the established date-only convention.

### 3. E13 — payment review quotes less than cart

One Juni class is **$30** in wizard Total Due; cart explicitly adds **7% / $2.10**, total **$32.10**. No charge executed. Expected: the payment review includes the card amount the next step asks for. Confidence high; this is disclosure inconsistency, not proof of overcharging.

Evidence: [desktop-payment](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/desktop-payment.png), [tablet-payment](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/tablet-payment.png), [mobile-payment](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-payment.png), [mobile-cart](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-cart.png).
Prior September 1 E13 repeated; MYK9-265 is a **different, resolved multi-dog-discount defect** and was not reopened. Next: use one fee quote/disclosure contract and replay wizard/cart amounts, payment methods and final receipt using a sanctioned payment fixture.

### 4. EUX-2026-09-03-01 — Add Dog asks to discard twice

Open Add Dog, type a call name, Cancel, choose Discard changes. A second **“Leave this page?”** prompt again offers Keep editing/Discard. Reproduced desktop and mobile. Expected: one explicit discard decision. No data loss observed. Confidence high.

Evidence: [desktop-second-discard](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/desktop-second-discard.png), [mobile-second-discard](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-second-discard.png).
Dedup: existing dirty-form issues MYK9-88/MYK9-165 are related, but no exact double-confirmation issue found in archived-inclusive search. Report-only P2. Next proof: one discard closes the form; Keep editing retains content; route-level guards still protect unrelated edits.

### 5. EUX-2026-09-03-02 — registry identity text is 10/11px

Computed organization labels **10px** and registration values **11px** at desktop/tablet/mobile. Expected: routine identity details legible to the elderly persona without special effort. This is a usability finding, **not a claimed WCAG minimum-font-size violation**. Confidence high for measurements; user-study impact not quantified.

Evidence: [desktop-dog-registry](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/desktop-dog-registry.png), [tablet-dog-registry](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/tablet-dog-registry.png), [mobile-dog-registry](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-dog-registry.png).
Source: [DogRegistryTable](/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show/src/components/dogs/common/DogRegistryTable.tsx:27); introduced by PR #1973. Archived-inclusive registry/11px searches found no exact issue; other typography work is related only. Next: use the established readable body/detail scale in the shared registry table, then verify long numbers, reflow and native zoom at all widths.

### 6. EUX-2026-07-26-07 — unnamed dog controls remain

Add Dog has a combobox without an accessible name and an unnamed photo button; Edit also exposes an unnamed gender combobox. Expected: each existing input/action has a programmatic name matching its visible purpose. Confidence high from browser accessibility roles; full screen-reader flow not run.

Evidence context: [mobile-dog-validation](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-dog-validation.png); browser role/name observations. Prior MYK9-88 broad naming closure does not override current exact control evidence. Reuse this stable finding; do not reopen the whole remediation scope. Next: label the shared controls and repeat accessible-name/focus checks in Add and Edit across widths.

### 7. E21 — 252 dogs without picker search

Wizard step 1 renders the fixture's 252 candidates without search/filter. Expected: find the intended dog with bounded scanning using the existing selection surface. Confidence high for fixture behavior, medium for representative first-user impact. Prior September 1 E21; report-only recurring P2. Next: test with a realistic small fixture and a large kennel, and reuse search within this picker if warranted. No new management page.

### 8. E22 — historical payments remain hard to identify

Recent September rows show the correct show and receipt actions. Older August rows still use **“—”** for show; three legacy paid rows lack receipt availability. Expected: a user can identify each payment and understand unavailable receipts. Confidence high in the visible gap, medium that this is a current writer defect rather than legacy fixture incompleteness. Preserve the same E22, narrowed to old rows.

Evidence: [desktop-payments](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/desktop-payments.png), [tablet-payments](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/tablet-payments.png), [mobile-payments](/Users/richardbeezley/.codex/automations/weekly-exhibitor-ux-walk/reports/2026-09-03/assets/mobile-payments.png). Next: inspect provenance of the old rows and decide repair versus explicit historical-data limitation; recheck receipt behavior. No charge/receipt corruption claimed.

## Prior weekly ledger reconciliation

The July memory was stale relative to the August 25 verified closure report. Canonical Done issues were **not reopened merely because a proof could not run**. “Resolved” below cites sampled current evidence or retained historical closure; “blocked” denotes this audit's missing full proof, not a change of Linear status.

blocked: **9**; resolved: **12**; unchanged: **1**; duplicate: **1** across 23 carried entries. The unnamed-control row also appears in active findings and must not be counted twice in an aggregate backlog.

| Prior finding | This-run evidence status | Evidence / remaining gate |
| --- | --- | --- |
| EUX-2026-07-24-01 / MYK9-88 | blocked | Historical Aug 25 closure retained. Live toast/footer collision not replayed; double-discard is separately recorded. |
| EUX-2026-07-30-01 / MYK9-122 | blocked | No full/waitlist fixture. Canonical Done preserved. |
| EUX-2026-07-26-02 / MYK9-123 | blocked | Public trial/class UI read-only at all widths; server mutation-denial gate not replayed. |
| EUX-2026-07-30-02 / MYK9-121 | resolved | Sampled dog now shows four upcoming entries in Career and Overview; normal online false-empty symptom absent. |
| EUX-2026-07-24-03 | resolved | Call-name-first identity preserved; Aug 25 registered/unregistered closure evidence retained. |
| EUX-2026-07-24-04 | resolved | Mobile required-field errors and expandable summary reachable; invalid submit stays open. |
| EUX-2026-07-26-05 / MYK9-102 | resolved | All three wizard step names present at 390, 768, 1440 widths. |
| EUX-2026-07-30-04 / MYK9-124 | blocked | Native 125/150/200% browser zoom not performed. Responsive resizing is not zoom proof. |
| EUX-2026-07-26-06 | resolved | Tablet payment totals do not overlap. |
| EUX-2026-07-26-07 | unchanged | Unnamed Add/Edit dog controls remain; included once in active findings. |
| EUX-2026-07-24-08 | resolved | Explicit classes/dogs and sampled filter totals coherent; prior closure retained, not a >1000-row completeness signoff. |
| EUX-2026-07-24-09 | resolved | Sidebar descriptions wrap in observed desktop/tablet shell. |
| EUX-2026-07-24-10 | blocked | Prior phone page-flow fix retained; one-handed last-dog selection among 252 not completed. |
| EUX-2026-07-24-11 | resolved | Dog detail keeps one add-registration path; prior three-CTA defect absent. |
| EUX-2026-07-24-12 | blocked | Static novice guidance visible; fixture contains Advanced classes, so novice/titled eligibility gate incomplete. |
| EUX-2026-07-24-13 | blocked | Missing-registration editor return path not exercised; prior closure retained. |
| EUX-2026-07-24-14 | resolved | Cards/Table/Calendar/Map labels visible; prior responsive closure retained. |
| EUX-2026-07-24-15 | resolved | One payment reassurance beside card choice. |
| EUX-2026-07-24-16 | resolved | Unpublished schedule guidance appears at page level; prior closure retained. |
| EUX-2026-07-26-17 | blocked | Not-live gate gives My Shows next step; live exhibitor role-language contract not reached. |
| EUX-2026-07-30-03 | blocked | Live at-show Actions target could not be reached or measured. |
| MYK9-65 | duplicate | Retain canonical issue/closure; trial 122 and individual class 61 are different scopes, not a new mismatch. |
| EUX-2026-07-24-17 | resolved | Aug 25 MYK9-71 closure proof retained; new withdrawal not executed. |

References: [July weekly baseline](/Users/richardbeezley/AI Projects/myk9-platform/docs/ux-audits/exhibitor-elderly-novice-2026-07-30.md); [August closure proof](/Users/richardbeezley/AI Projects/myk9-platform/docs/ux-audits/exhibitor-elderly-novice-2026-08-25.md); [September 1 task walk](/Users/richardbeezley/AI Projects/myk9-platform/docs/audits/2026-09-01-exhibitor-task-walk-claude.md); [July date-family evidence](/Users/richardbeezley/AI Projects/myk9-platform/docs/audits/2026-07-02-exhibitor-elderly-ux-audit-claude.md). Registry/scorecard text is secondary to current Linear acceptance status; no audit-stream boundary advanced because this is a current-state role walk.

## Recent PR browser verification

Window **2026-09-01 19:45:50 UTC → 2026-09-03 19:45:50 UTC**: 53 merged PRs. Verdicts: 17 not applicable, 29 blocked, 5 verified, 2 failed.
“Verified” is limited to the described affected exhibitor behavior. Neither tests nor a successful generic page load stand in for the precise failure gate.

| PR | Title | Verdict | Browser evidence / reason |
| --- | --- | --- | --- |
| [#1997](https://github.com/rbeezley/myk9-platform/pull/1997) | ci: shuffle package tests | not applicable | CI ordering; no exhibitor UI change. |
| [#1996](https://github.com/rbeezley/myk9-platform/pull/1996) | ci: guard migration versions against shared history | not applicable | Migration CI guard. |
| [#1995](https://github.com/rbeezley/myk9-platform/pull/1995) | docs(openspec): archive MYK9-328 cleanup | not applicable | Archive documentation. |
| [#1994](https://github.com/rbeezley/myk9-platform/pull/1994) | test(auth): document and pin secretary qualification save permissions | not applicable | Secretary authorization tests. |
| [#1993](https://github.com/rbeezley/myk9-platform/pull/1993) | test(secretary): isolate deliberate exit dirty state | not applicable | Secretary test isolation. |
| [#1992](https://github.com/rbeezley/myk9-platform/pull/1992) | fix(auth): restrict judge qualification replacement RPC | not applicable | Judge qualification RPC; no exhibitor edit path. |
| [#1991](https://github.com/rbeezley/myk9-platform/pull/1991) | fix(settings): recheck queues before cache clear | blocked | Clear-cache confirmation opened/cancelled; queue race not injected. |
| [#1990](https://github.com/rbeezley/myk9-platform/pull/1990) | refactor(packages): complete internal dead-code sweep (MYK9-328) | blocked | Core routes rendered; package removal coverage is broader than this walk. |
| [#1989](https://github.com/rbeezley/myk9-platform/pull/1989) | fix(settings): protect unsynced work when clearing cache | blocked | Cache warning/cancel checked; unsynced-work deletion guard not exercised. |
| [#1988](https://github.com/rbeezley/myk9-platform/pull/1988) | fix(check-in): fail closed after cached settings refresh errors | blocked | No live self-check-in fixture or settings failure injection. |
| [#1987](https://github.com/rbeezley/myk9-platform/pull/1987) | fix(payments): complete MYK9-336 E2E contract | verified | My Payments net/refund arithmetic and past-due contact guidance; sampled normal path. |
| [#1986](https://github.com/rbeezley/myk9-platform/pull/1986) | docs(openspec): close MYK9-334 after verified deployment | not applicable | Archive documentation. |
| [#1984](https://github.com/rbeezley/myk9-platform/pull/1984) | chore: complete Wave 3 dead-code cleanup | blocked | Common routes smoke-tested; full dead-code surface not replayed. |
| [#1982](https://github.com/rbeezley/myk9-platform/pull/1982) | fix(edge): complete MYK9-334 hygiene and monitoring | blocked | Hosted email/webhook/monitoring triggers not executed. |
| [#1981](https://github.com/rbeezley/myk9-platform/pull/1981) | fix(registries): normalize trial timezone and registry reads | blocked | Normal trial pages rendered; timezone/registry fallback cases absent. |
| [#1980](https://github.com/rbeezley/myk9-platform/pull/1980) | fix: remediate components rest audit findings | failed | Cold offline My Shows has blank main; existing MYK9-347. Root cause not established. |
| [#1979](https://github.com/rbeezley/myk9-platform/pull/1979) | fix(secretary): hide inert promo-code management | not applicable | Secretary promo management. |
| [#1978](https://github.com/rbeezley/myk9-platform/pull/1978) | fix(exhibitor): prioritize mobile entry filters | verified | 390px time/status filters visible and Completed selection returns 192. |
| [#1977](https://github.com/rbeezley/myk9-platform/pull/1977) | refactor(supabase): remove unused client package APIs | blocked | Normal reads worked; all removed API consumers not browser-proven. |
| [#1976](https://github.com/rbeezley/myk9-platform/pull/1976) | fix(payments): remove dead past-show payment actions | verified | Past-due show balances offer Contact club, with no dead payment action. |
| [#1975](https://github.com/rbeezley/myk9-platform/pull/1975) | fix: start Wave 1 launch-readiness remediations | blocked | Broad Wave 1 changes; delete failures and live ringside not exercised. |
| [#1974](https://github.com/rbeezley/myk9-platform/pull/1974) | feat(dogs): passport-rail layout for the dog detail page | blocked | Passport rail rendered at three widths; complete layout contract not measured. Existing date-family failure in Career. |
| [#1973](https://github.com/rbeezley/myk9-platform/pull/1973) | feat(dogs): registry-card layout for My Dogs rail and /dogs grid | failed | Registry details computed at 10px/11px at all widths; elderly readability regression. |
| [#1972](https://github.com/rbeezley/myk9-platform/pull/1972) | docs(skills): seed bug-audit's do-not-report list from prior runs | not applicable | Skill documentation. |
| [#1971](https://github.com/rbeezley/myk9-platform/pull/1971) | fix(at-show): unify non-running entry lifecycle policy | blocked | Live non-running entry lifecycle unavailable. |
| [#1970](https://github.com/rbeezley/myk9-platform/pull/1970) | docs(skills): add bug-audit — the repo-wide correctness sweep, with model tiering | not applicable | Skill documentation. |
| [#1968](https://github.com/rbeezley/myk9-platform/pull/1968) | fix(tests): import the logger singleton in dateLocal, not the class | not applicable | Logger import/test repair; not a distinct browser workflow. |
| [#1967](https://github.com/rbeezley/myk9-platform/pull/1967) | fix: complete Wave 0 reliability fixes | blocked | Wave 0 backend/failure conditions not exercised. |
| [#1966](https://github.com/rbeezley/myk9-platform/pull/1966) | refactor(registration): remove the dead confirmRegistration chain | blocked | Normal wizard reached payment; full submission path not run. |
| [#1964](https://github.com/rbeezley/myk9-platform/pull/1964) | fix(registration): fail the wizard when enrollment creation fails | blocked | Enrollment failure not injected; no submission. |
| [#1963](https://github.com/rbeezley/myk9-platform/pull/1963) | fix(results): map AKC XML codes to the statuses the database stores | not applicable | AKC XML export mapping; outside exhibitor UI. |
| [#1962](https://github.com/rbeezley/myk9-platform/pull/1962) | test(e2e): record why the My Shows filter assertion is not above-the-fold | not applicable | E2E comment only. |
| [#1961](https://github.com/rbeezley/myk9-platform/pull/1961) | fix: repair secretary, exhibitor, and offline P2 paths | blocked | Broad reliability scope; offline symptom observed, exact individual fixes not isolated. |
| [#1960](https://github.com/rbeezley/myk9-platform/pull/1960) | fix(secretary): keep multi-day shows live for their whole run (MYK9-306) | blocked | No live multiday show; clock-only simulation did not open ringside. |
| [#1959](https://github.com/rbeezley/myk9-platform/pull/1959) | fix(lifecycle-emails): stop batch send broadcasting the first draft | blocked | No lifecycle email sent. |
| [#1958](https://github.com/rbeezley/myk9-platform/pull/1958) | fix(db): rename the class-rollup migration off a colliding version | blocked | Class rollup SQL not exercised with moved entries. |
| [#1956](https://github.com/rbeezley/myk9-platform/pull/1956) | fix: close confirmed P3 reliability defects | blocked | Broad reliability fixes; relevant mutation failures not injected. |
| [#1955](https://github.com/rbeezley/myk9-platform/pull/1955) | fix(db): club-less shows are site-admin only in view_authenticated_entry_results (MYK9-329) | blocked | Withheld UI observed; club-less RLS denial requires dedicated authorization proof. |
| [#1954](https://github.com/rbeezley/myk9-platform/pull/1954) | fix(scoring): stop moved and not-accepted entries blocking class completion | blocked | No scoring/class-completion fixture. |
| [#1953](https://github.com/rbeezley/myk9-platform/pull/1953) | fix(routing): remove dead support and judge links | verified | Help link opened guides; closed-show contact link reached Messages. Limited to exhibitor links. |
| [#1952](https://github.com/rbeezley/myk9-platform/pull/1952) | fix(exhibitor): page entry result reads past 1000 rows | blocked | Large entry set loaded; >1000 row completeness not reconciled against an authoritative count. |
| [#1951](https://github.com/rbeezley/myk9-platform/pull/1951) | fix(checkout): close delayed order visibility gap | blocked | No checkout or delayed-order injection. |
| [#1950](https://github.com/rbeezley/myk9-platform/pull/1950) | fix(exhibitor): keep past-due entry balances visible | verified | 180.00 past-due balance retained; named show contact paths available. |
| [#1949](https://github.com/rbeezley/myk9-platform/pull/1949) | fix(results): retire fabricated results dashboard | blocked | Retired results-dashboard redirect not directly replayed. |
| [#1948](https://github.com/rbeezley/myk9-platform/pull/1948) | chore: remove unreachable myK9Show code | blocked | Normal pages smoke-tested; all removed routes not replayed. |
| [#1947](https://github.com/rbeezley/myk9-platform/pull/1947) | fix(support): prioritize secretary day-of tickets | not applicable | Staff ticket priority. |
| [#1946](https://github.com/rbeezley/myk9-platform/pull/1946) | fix(entries): remove unsupported missing-info status actions | not applicable | Staff entry actions. |
| [#1945](https://github.com/rbeezley/myk9-platform/pull/1945) | fix(secretary): use server placements in placement tab | not applicable | Secretary placements. |
| [#1944](https://github.com/rbeezley/myk9-platform/pull/1944) | fix(subscription): make feature gate upgrade CTA navigate | blocked | Subscription upgrade action not exercised. |
| [#1943](https://github.com/rbeezley/myk9-platform/pull/1943) | fix(dogs): keep delete failures actionable | blocked | Dog deletion failure not injected; shared dogs preserved. |
| [#1942](https://github.com/rbeezley/myk9-platform/pull/1942) | fix(sync): deduplicate download failure toast | blocked | Exact repeated download failure/toast collision not injected. |
| [#1940](https://github.com/rbeezley/myk9-platform/pull/1940) | fix(entries): distinguish deleted shows from deleted entries | blocked | No deleted-show/retained-entry fixture. |
| [#1939](https://github.com/rbeezley/myk9-platform/pull/1939) | docs(audits): route all scheduled-task findings to Linear, no approval gate | not applicable | Audit policy documentation. |

## Rejected observations and environment limits

- Link-vs-button locator mistakes, stretched-card pointer interception and immediate checkbox reads before settling were harness observations, not filed defects.
- An initially empty results state later settled to the withheld-results message; no false-empty issue filed from that transient.
- The Messages composer screenshot is retained as a raw artifact, but its sparse capture was not conclusively diagnosed and is not a confirmed finding.
- Full-page screenshots may place sticky chrome at the capture scroll position; screenshot artifacts are not counted as product layout defects.
- Native zoom, screen reader, physical touch, first-user onboarding/empty data, live show operation, approved payment/CRUD, full/waitlist states, released results, offline installed-shell delivery, backend RBAC denial, and cache queue failure injection remain unverified.
- Current audited fixture is unsuitable for independently proving the complete novice golden path. An isolated scenario needs one novice dog, eligible novice classes, a controlled full/waitlist case, a live multi-day show and sanctioned payment/result states.

## Priorities and next proof

1. Restore usable cold-offline My Shows and verify actual installed-PWA launch; **MYK9-347 already owns the follow-up**.
2. Make the calendar date agree across Career and show/entry pages.
3. Disclose the complete card quote consistently in wizard and cart.
4. Make shared registry details readable and give existing dog controls accessible names.
5. Collapse Add Dog cancellation to one confirmation.

**Duplication question:** none of these needs a new page. Reuse the existing offline boundary, date helpers, money contract, dog controls and discard guard. The picker improvement belongs inside selection; financial history belongs on My Payments.

Recurring P2s C2/E1, E13, unnamed dog controls, E21 and E22 are available for optional triage; new P2s remain report-only. No new qualifying P0/P1 remained after deduplication, so no new Linear draft or issue was necessary. Full readiness requires the blocked lifecycle evidence above, not just merged PRs.

## Artifact handling

34 screenshots are preserved with this report. The browser contexts and the dev server started by this audit were stopped. Audit source files are documentation only; no implementation was changed. Durable report and assets live under this automation's reports directory so temporary worktree cleanup cannot lose evidence.
