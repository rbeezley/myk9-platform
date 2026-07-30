# Weekly exhibitor UX walk — 2026-07-30

**Role:** Exhibitor

**Persona:** retired, elderly, first-time exhibitor with limited computer experience

**Baseline:** `46847e5024588b55a7ddc7d9e0d751ed90f2ba0b` (`main`)

**Environment:** local myK9Show at `http://localhost:5173`, shared e2e exhibitor account

**Viewports:** desktop 1440×900, tablet 768×1024, mobile 390×844

**Method:** real browser replay using the role-journey audit method and the quality finding lifecycle. Tests and source inspection were used only for orientation and deduplication.

## Executive assessment

An elderly first-time exhibitor **could discover the Heartland show and reach payment review, but could not yet complete the whole journey independently with confidence**.

- **Discover a show:** mostly understandable. Dates, location, deadline, base/day-of fees, and payment method are visible.
- **Enter a dog:** unsafe. A mobile toast physically covers Back/Next, tablet progress labels lose their meaning, class eligibility is not explained, and a full/wait-list class appears as a payable item before silently disappearing after refresh.
- **Understand confirmation:** improved. Pending, accepted, paid, check-in, results, receipt, and edit/pull actions are clearer. Contradictory counts and dog-career empty states still undermine trust.
- **Use the app at the show:** possible after entering a show passcode. Class state and released results are readable, but the exhibitor is sent into an operational “Ringside” surface contrary to the role intent, and the only class action is behind a 20×20 px target.

Overall: **not ready for independent elderly-novice use**. The golden path remains Yellow/Red because state can be lost or silently changed during entry.

## Coverage and records touched

| Workflow | Desktop | Tablet | Mobile | Result |
| --- | --- | --- | --- | --- |
| Sign in, sign out, session recovery, account menu | Full | Responsive | Full | Verified; password-reset entry exists after email step |
| Orientation, My Shows, navigation, account/preferences redirects | Full | Responsive | Full | Core destinations reachable; legacy `/exhibitor/entries/history` is still a 404 |
| Show discovery, detail, trials, classes, fees, deadlines | Full | Responsive | Full | One available show; closed/ineligible show fixtures unavailable |
| Add/edit dog and safe validation | Full/no save | Responsive | Full/no save | Validation blocks; mobile summary hides one error |
| Entry: dog → classes → review/payment | Full to review | Full to review | Full to review + refresh | No submission/payment; recovery defect reproduced |
| Existing entry status, receipt, edit/pull/check-in | Full/no mutation | Responsive | Responsive | Clearer actions; no shared status mutation |
| At-show gate, class list/detail, released results | Full | Full | Full | No unreleased result exposure observed |
| Dog career, qualifications, placements, results | Full | Responsive | Responsive | Upcoming contradiction reproduced; past Q/placement visible |
| Browser zoom | 125% spot-check | N/A | N/A | Primary action and financial summary clip |
| Failure/offline/staleness | Loading/transient states | Loading/transient states | Refresh recovery | True offline replay not completed |

Records viewed: **Heartland Scent Work Classic**, Saturday Trial, Container Novice A, and the test dogs Willow, Scout, and Ranger. The account currently contains **68 dogs, 68 entry records, and 511 class entries** (63 dogs named `Load ##`), so load/performance observations are fixture-contaminated. No dog, entry, payment, result, check-in, message, scratch, transfer, move-up, or shared fixture was created, deleted, or saved. Class selections reached local cart/review state only.

## Finding disposition

- **New:** 4 — EUX-2026-07-30-01 through -04.
- **Unchanged:** 17 — longstanding browser-reproduced findings listed below.
- **Resolved:** 1 — the prior entry-management/status finding now has explicit Edit Entry, per-class Pull, Finish Payment, receipt, and clear Pending Secretary Approval language.
- **Duplicate:** 1 — the class-count contradiction is MYK9-65.
- **Rejected:** 1 — the old hypothesis that the defect is necessarily a stored `Mixed Breed` value is obsolete after dog-identity normalization; the still-visible false helper copy remains a UX defect.
- **Blocked findings:** 0.
- **Blocked coverage gates:** 4 — real payment/duplicate-submit/refund; shared entry mutations (scratch/transfer/move-up/check-in); email delivery/confirmation-return replay; true offline and mobile soft-keyboard obstruction.

This is the first run of the weekly automation, so new 2026-07-30 findings remain “new.” Findings reproduced in the 2026-07-24 and 2026-07-26 audits have consecutive evidence and are promoted as recurring rather than presented as new.

## Findings

Viewport matrix: ✓ reproduced, — not applicable/not replayed.

| ID | Status | Classification | Severity | First / last seen | Desktop | Tablet | Mobile | Route and exact evidence | Expected, impact, recommendation, and closure proof |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EUX-2026-07-24-01 / MYK9-88 | Unchanged; recurring | Confirmed defect / Responsive design | **Pilot blocker** | 2026-07-24 / 2026-07-30 | — | — | ✓ | `/shows/:showId/register`: selecting a class displayed a 347×74 toast over the sticky footer. Measured overlap: Back 3,740 px²; Next 3,571 px². Leaving payment review also discarded the in-progress flow without a warning. [Screenshot](assets/exhibitor-elderly-novice-2026-07-30/mobile-toast-footer-collision-2.png). | Actions must remain tappable and dirty entry work must survive or warn. Reserve non-overlapping layers and add route-leave/reload recovery. Close only after mobile browser replay taps Back/Next while the toast is visible and verifies refresh/back recovery. |
| EUX-2026-07-30-01 | New | Confirmed defect | **High** | 2026-07-30 / 2026-07-30 | — | — | ✓ | `/shows/:showId/register`: selected `Container Novice A` marked **Full: join wait list** and `Exterior Open`; review showed both as payable, total **$60**. Reload returned to step 1; Cart then contained only Exterior Open, total **$32.10**, with no explanation. [Before](assets/exhibitor-elderly-novice-2026-07-30/mobile-entry-payment.png) · [after](assets/exhibitor-elderly-novice-2026-07-30/mobile-cart-after-refresh.png). | A wait-list request must never be represented as a normal payable line and silently disappear. Persist an explicit wait-list state or block advancement with plain-language next action. Close with mobile/tablet/desktop reload and navigation-away replay plus focused state-contract tests. |
| EUX-2026-07-26-02 | Unchanged; recurring | Confirmed defect | **High** | 2026-07-26 / 2026-07-30 | ✓ | ✓ | Responsive | `/shows/:showId/trials/:trialId/classes/:classId`: an exhibitor sees “read-only access,” but **Edit** opens enabled Judge and Status controls; trial detail exposes Timeline, Judge Supplies, and operational class controls. No save was attempted. [Screenshot](assets/exhibitor-elderly-novice-2026-07-30/desktop-exhibitor-edit-class.png). | Exhibitors must see their schedule/results, not staff mutation affordances. Hide operational controls at route/component authorization boundaries and prove server rejection separately. Close with exhibitor browser replay plus RBAC mutation tests. |
| EUX-2026-07-30-02 | New | Confirmed defect | **High** | 2026-07-30 / 2026-07-30 | ✓ | Responsive | Responsive | `/dogs/:dogId`: Overview says Willow has **1 entry this season**; My Shows says **2 upcoming classes**; Career → Competitions → Upcoming Shows says **No Upcoming Shows** and tells the user to browse. [Screenshot](assets/exhibitor-elderly-novice-2026-07-30/desktop-dog-career-upcoming-empty.png). | One canonical dog-entry query must drive both surfaces. A false empty state can make an exhibitor miss a show. Close after cross-surface seeded browser replay and query-contract coverage. |
| EUX-2026-07-24-03 / MYK9-88 / MYK9-90 | Unchanged; recurring | UX friction | **High** | 2026-07-24 / 2026-07-30 | ✓ | Responsive | Responsive | Add Dog → Registration still says an unregistered dog “is saved as Mixed Breed,” while normalized registration identity is now authoritative; Edit Dog still presents base Registered Name/Breed concepts. [Screenshot](assets/exhibitor-elderly-novice-2026-07-30/desktop-dog-registration-copy.png). | Copy and fields must describe the actual registration model. Remove false storage claims and keep registered identity on registrations. Close with add/edit browser replay for registered and unregistered dogs plus schema-backed component tests. |
| EUX-2026-07-24-04 / MYK9-88 | Unchanged; recurring | Responsive design | **High** | 2026-07-24 / 2026-07-30 | Responsive | Responsive | ✓ | `/dogs` → Add Dog → empty submit: inline errors are readable, but the footer compresses them to `Please enter a call name • Please select a gender (+1 more)` and hides Date of Birth. Both footer buttons are only 40 px high. [Screenshot](assets/exhibitor-elderly-novice-2026-07-30/mobile-add-dog-validation.png). | Show every actionable error at full width and focus the field from the summary; use ≥44 px targets. Close with 390×844 browser replay and keyboard/focus tests. |
| EUX-2026-07-26-05 / MYK9-102 | Unchanged; recurring | Responsive design | **High** | 2026-07-26 / 2026-07-30 | ✓ | ✓ | ✓ | Entry stepper at 768×1024 shows only `1 Current`, `2 coming`, `3 coming`, `4 coming`; mobile horizontally clips/scrolls the same sequence. Step names and purposes disappear. [Tablet](assets/exhibitor-elderly-novice-2026-07-30/tablet-entry-step1.png) · [mobile](assets/exhibitor-elderly-novice-2026-07-30/mobile-entry-step1.png). | Every breakpoint must name the current step and remaining journey. Close with 390×844, 768×1024, and desktop browser screenshots plus no-overflow assertions. |
| EUX-2026-07-30-04 | New | Accessibility / Responsive design | **High** | 2026-07-30 / 2026-07-30 | ✓ | — | — | `/exhibitor/entries` at two browser zoom increments (about 125%): the Enter action is clipped at the right edge, Current Fees is cut off, and the dog strip extends beyond the visible content. [Screenshot](assets/exhibitor-elderly-novice-2026-07-30/desktop-zoom.png). | At 125–200% zoom, primary actions and money must remain visible without two-dimensional hunting. Reflow the dashboard rather than fixing widths. Close with 125%, 150%, and 200% browser replays and horizontal-overflow assertions. |
| EUX-2026-07-26-06 | Unchanged; recurring | Responsive design | **Medium** | 2026-07-26 / 2026-07-30 | ✓ | ✓ | Responsive | `/exhibitor/payments` at 768×1024: Gross, Refunds, and Net overlap; measured totals container overflow is 21 px. [Screenshot](assets/exhibitor-elderly-novice-2026-07-30/tablet-payments.png). | Stack totals at tablet width. Close with 768×1024 visual/browser proof and no-overflow assertion. |
| EUX-2026-07-26-07 | Unchanged; recurring | Accessibility | **Medium** | 2026-07-26 / 2026-07-30 | ✓ | ✓ | ✓ | Entry dog-selection inputs expose no useful checkbox names; Find Shows map marker is a role=button with no aria-label/title/alt. | Name each dog checkbox and marker with show/date/location. Close with browser accessibility snapshot and automated unnamed-control checks. |
| EUX-2026-07-24-08 | Unchanged; recurring | UX friction | **Medium** | 2026-07-24 / 2026-07-30 | ✓ | ✓ | ✓ | My Shows says `68 entries`; show detail says `My Entries 513` and later `511 classes across 68 dogs`. The detailed caption helps, but the primary labels still mix record units. | Name dogs, entry records/orders, and class entries at every summary. Close with a cross-surface seeded count contract and visible-label browser replay. |
| EUX-2026-07-24-09 | Unchanged; recurring | Responsive design | **Medium** | 2026-07-24 / 2026-07-30 | ✓ | ✓ | Responsive | Sidebar helper text still truncates `Your entries, dogs,…`, `Your online entry…`, and `Find check-in, run…`; tablet inherits the same rail. | Preserve the novice-oriented explanation or remove it; do not render half a sentence. Close with desktop/tablet visual replay. |
| EUX-2026-07-24-10 | Unchanged; recurring | Responsive design | **Medium** | 2026-07-24 / 2026-07-30 | Responsive | ✓ | ✓ | Entry step 1 nests a fixed-height dog-list scroll inside page scroll. With 68 dogs, reaching Willow and then Next requires competing scroll regions. | Let the list participate in page scroll below desktop. Close by selecting the last dog one-handed at mobile/tablet. |
| EUX-2026-07-24-11 | Unchanged; recurring | UX friction | **Medium** | 2026-07-24 / 2026-07-30 | ✓ | Responsive | Responsive | Willow Overview presents **Add New Registration**, **Add Registration**, and sidebar **Add registration** on one screen, before basic identity. | Keep one registration CTA on the existing dog page; do not add a new surface. Close with desktop/mobile browser replay. |
| EUX-2026-07-24-12 | Unchanged; recurring | UX friction | **Medium** | 2026-07-24 / 2026-07-30 | ✓ | ✓ | ✓ | Entry class selection offers Advanced, Excellent, and Master without eligibility or “start with Novice” guidance. Existing Advanced protection loads asynchronously. | Explain entry level and disable known-ineligible choices without adding another page. Close with novice and titled-dog fixtures across viewports. |
| EUX-2026-07-24-13 | Unchanged; recurring | UX friction | **Medium** | 2026-07-24 / 2026-07-30 | ✓ | ✓ | ✓ | `No registration on file — verify before submitting` has no action and does not explain the exception. | Deep-link to that dog’s existing registration panel and state when registration is required. Close with browser replay returning to the same entry draft. |
| EUX-2026-07-24-14 | Unchanged; recurring | Accessibility | **Medium** | 2026-07-24 / 2026-07-30 | Responsive | ✓ | ✓ | Find Shows exposes Cards/Table/Calendar/Map as visually icon-only controls. Accessible names exist, but the elderly visible-label-only persona cannot infer them. [Screenshot](assets/exhibitor-elderly-novice-2026-07-30/mobile-show-discovery.png). | Add short visible labels on the existing controls. Close with visible-label-only replay at 390 and 768 px. |
| EUX-2026-07-24-15 | Unchanged; recurring | UX friction | **Medium** | 2026-07-24 / 2026-07-30 | ✓ | ✓ | ✓ | Payment review repeats secure-checkout reassurance twice plus a third confirmation variant. | Keep one statement beside the submit action. Close by verifying one complete payment summary at all viewports. |
| EUX-2026-07-24-16 | Unchanged; recurring | UX friction | **Medium** | 2026-07-24 / 2026-07-30 | ✓ | Responsive | Responsive | Hundreds of schedule rows repeat `Time pending` and `Judge TBD`; fixture volume makes the empty promise overwhelming. | Collapse unpublished schedule facts into one expectation and publish rows only when useful. Close with published/unpublished fixtures. |
| EUX-2026-07-26-17 | Unchanged; recurring | UX friction | **Medium** | 2026-07-26 / 2026-07-30 | ✓ | ✓ | ✓ | Sidebar promises exhibitor check-in/run order under **Ringside**, while INTENT says exhibitors should not need the operational ringside app. The landing requires a show passcode and says “step into the ring.” | Keep exhibitor show-day status in My Shows and deep-link staff to operational Ringside; do not duplicate either surface. Close with a role-language audit and browser replay. |
| EUX-2026-07-30-03 | New | Accessibility | **Medium** | 2026-07-30 / 2026-07-30 | — | ✓ | ✓ | `/at-show/:showId/class/:classId`: the only `Actions menu` target is 20×20 px; Pending/Completed tabs and favorite buttons are 44 px. [Tablet](assets/exhibitor-elderly-novice-2026-07-30/tablet-at-show-class.png) · [mobile](assets/exhibitor-elderly-novice-2026-07-30/mobile-at-show-class.png). | Make the menu ≥44×44 px. Close with tablet/mobile measurements and one-handed refresh replay. |
| MYK9-65 | Duplicate | Confirmed defect | **High** | Existing issue / 2026-07-30 | ✓ | Responsive | Responsive | Show Overview reports **0 entries** on classes while Trials reports 126–133; transient at-show hydration also briefly displayed confident 0/0. This is the same canonical-count/cold-hydration defect already tracked in [MYK9-65](https://linear.app/myk9-platform/issue/MYK9-65/fix-class-entry-counts-disagreeing-between-show-desk-and-class). | Use the existing issue. Closure requires its stated replication-backed count agreement and cold-start browser proof. |

### Resolved

**EUX-2026-07-24-17 — entry management and status vocabulary.** In `/exhibitor/entries`, a pending Ranger entry now says **Pending Secretary Approval**, exposes **Edit Entry**, shows payment due, and provides per-class **Pull** controls. Willow exposes results, placement, check-in, receipt, and show link. Resolution proof was desktop browser replay; no mutation was performed. Reopen only if a submitted entry again lacks the permitted action or contact path.

### Rejected hypothesis

The 2026-07-24 hypothesis “the product defect is a deliberate stored Mixed Breed default” is no longer accepted as the finding contract. MYK9-90 normalized registration identity. The current browser defect is narrower and directly observed: the UI still claims the old storage behavior and presents base identity fields that contradict the current model.

## High-severity Linear actions — approved and filed

Batch approval was received on 2026-07-30. The six approved actions are now in Linear:

- [MYK9-88](https://linear.app/myk9-platform/issue/MYK9-88/exhibitor-ux-remediation-tracked-in-openspec-change-exhibitor-ux) — reopened to Todo/Urgent with sanitized browser-regression evidence.
- [MYK9-102](https://linear.app/myk9-platform/issue/MYK9-102/exhibitor-registration-steps-are-missed-top-nav-tabs-are-not-visible) — reopened to Todo/High with sanitized responsive-progress evidence.
- [MYK9-121](https://linear.app/myk9-platform/issue/MYK9-121/dog-career-shows-false-empty-state-for-upcoming-entries) — created, Todo/High.
- [MYK9-122](https://linear.app/myk9-platform/issue/MYK9-122/full-wait-list-class-silently-disappears-after-entry-refresh) — created, Todo/High.
- [MYK9-123](https://linear.app/myk9-platform/issue/MYK9-123/hide-operational-class-and-trial-controls-from-exhibitors) — created, Todo/High.
- [MYK9-124](https://linear.app/myk9-platform/issue/MYK9-124/my-shows-clips-primary-actions-at-browser-zoom) — created, Todo/High.

The filed issue contracts are preserved below.

### A. Reopen/update MYK9-88 — form-action safety regressions remain

- **Problem/reproduction:** mobile entry toast covers Back/Next; navigation away drops entry work; Add Dog error summary hides one required error; dog-registration copy describes an obsolete model.
- **Evidence:** EUX-2026-07-24-01, -03, and -04 screenshots above.
- **Actual/expected:** primary controls and form state are obstructed/lost; they must remain operable and recoverable.
- **Impact/severity:** Pilot blocker; target persona can lose paid-entry work.
- **Likely root cause:** shared bottom-right toast/sticky-action layout and incomplete dirty-form recovery contract, already documented by MYK9-88.
- **Approach:** reopen the existing umbrella, restore separate one-defect tasks, and re-run its original browser evidence gate.
- **Acceptance/proof:** mobile toast interaction; route-away/reload recovery; complete validation summary/focus; registered/unregistered dog copy replay.
- **Routes/files/logs:** `/shows/:showId/register`, `/dogs`; existing MYK9-88 source references; no browser errors required.

### B. Create — full/wait-list class silently disappears after refresh

- **Problem/reproduction:** select a class labelled `Full: join wait list` plus an open class; payment review totals both; reload; cart silently drops the full class.
- **Evidence:** EUX-2026-07-30-01 before/after screenshots.
- **Actual/expected:** a $60 review becomes a $32.10 cart with no state explanation; wait-list intent must persist explicitly or never enter payable review.
- **Impact/severity:** High; the exhibitor can believe a requested class was submitted when it was not.
- **Likely root cause:** not established; inspect class-capacity normalization versus cart persistence before editing.
- **Approach:** define one class-selection state machine for open, full/wait-list, already entered, and recovered drafts.
- **Acceptance/proof:** desktop/tablet/mobile selection, refresh, back/forward, and duplicate-protection replays; assertion-first state-contract tests.
- **Routes:** `/shows/:showId/register`, `/cart`.

### C. Create — exhibitor sees operational class/trial mutation controls

- **Problem/reproduction:** sign in as exhibitor; open class detail; read-only alert appears, but Edit opens Judge/Status controls; trial detail exposes Judge Supplies.
- **Evidence:** EUX-2026-07-26-02 screenshot.
- **Actual/expected:** operational controls are enabled in the exhibitor UI; they should not render and server authorization must reject direct mutation.
- **Impact/severity:** High; mistake anxiety and possible unauthorized shared-show mutation.
- **Likely root cause:** view access and operational component authorization are not separated.
- **Approach:** reuse exhibitor schedule/result presentation and deep-link authorized staff to the existing operational surface.
- **Acceptance/proof:** exhibitor browser replay at all viewports plus RBAC mutation denial tests.
- **Routes:** `/shows/:showId/trials/:trialId`, `/shows/:showId/trials/:trialId/classes/:classId`.

### D. Create — Dog Career false-empty upcoming shows

- **Problem/reproduction:** Willow Overview has one upcoming entry and My Shows has two upcoming classes; Career says No Upcoming Shows.
- **Evidence:** EUX-2026-07-30-02 screenshot.
- **Actual/expected:** contradictory empty state; the same dog/show scope must agree.
- **Impact/severity:** High; the exhibitor may miss where and when to compete.
- **Likely root cause:** not established; inventory Overview, Career, and My Shows query scopes first.
- **Approach:** consolidate onto the existing replication-backed dog-entry query; do not add a new dog surface.
- **Acceptance/proof:** seeded upcoming/completed/pending fixtures, offline/cold hydration, and cross-surface browser replay.
- **Routes:** `/dogs/:dogId`, `/exhibitor/entries`.

### E. Create or reopen MYK9-102 — entry progress breaks at tablet/mobile

- **Problem/reproduction:** at 768×1024 the four steps lose their names; at 390×844 they horizontally clip.
- **Evidence:** EUX-2026-07-26-05 screenshots.
- **Actual/expected:** `1 Current / 2 coming...` does not orient the user; every viewport must name the current task and next step.
- **Impact/severity:** High for a literal, anxious novice completing a paid entry.
- **Likely root cause:** responsive stepper content is hidden instead of adopting a compact named layout.
- **Approach:** update the existing wizard shell; do not create a second flow.
- **Acceptance/proof:** 390×844, 768×1024, 1440×900; light/dark; no overflow; step purpose announced and visible.
- **Related:** MYK9-102, MYK9-14.

### F. Create — My Shows clips primary actions at browser zoom

- **Problem/reproduction:** open `/exhibitor/entries` at desktop and increase browser zoom twice (about 125%).
- **Evidence:** EUX-2026-07-30-04 screenshot.
- **Actual/expected:** Enter and Current Fees are clipped; actions and money must reflow through 200% zoom.
- **Impact/severity:** High for the target persona, who is likely to use zoom.
- **Likely root cause:** desktop-only minimum widths/horizontal strips without a zoom reflow contract.
- **Approach:** make the existing dashboard container-responsive; no alternate large-text page.
- **Acceptance/proof:** 125/150/200% browser replay, keyboard access, and no two-dimensional scrolling for primary tasks.
- **Route:** `/exhibitor/entries`.

## Recent PR verification — previous 48 hours

| PR(s) | Status | Browser evidence |
| --- | --- | --- |
| [#1524](https://github.com/rbeezley/myk9-platform/pull/1524) desktop account menu to sidebar | **Verified** | Desktop sidebar account button is present, labelled with Exhibitor identity, and opens the consolidated menu. |
| [#1521](https://github.com/rbeezley/myk9-platform/pull/1521) account actions | **Verified** | Desktop/mobile menu shows Account, AskQ, Help & Guides, About, Developer (dev), and Sign out. |
| [#1520](https://github.com/rbeezley/myk9-platform/pull/1520) role sidebar hierarchy | **Verified with recurring defect** | Exhibitor destinations are consolidated and reachable; explanatory helper text still clips at desktop/tablet. |
| [#1518](https://github.com/rbeezley/myk9-platform/pull/1518) sidebar identity | **Verified** | `Exhibitor / Exhibitor` appears on desktop and account identity remains available on mobile. |
| [#1516](https://github.com/rbeezley/myk9-platform/pull/1516) brand icon/header mark | **Verified** | Brand mark is visible on sign-in and authenticated headers at all three viewports. |
| [#1522](https://github.com/rbeezley/myk9-platform/pull/1522) RBAC query load | **Verified for exhibitor browser scope** | Real two-step sign-in, account reloads, show/class/dog/entry reads, and passcode at-show access completed without browser errors. |
| [#1509](https://github.com/rbeezley/myk9-platform/pull/1509), [#1505](https://github.com/rbeezley/myk9-platform/pull/1505) entry access/RLS | **Verified for exhibitor browser scope** | Own entries, check-in/status/receipt, class queue, and released results loaded. No unpublished result was observed; cross-role policy proof remains outside this walk. |
| [#1513](https://github.com/rbeezley/myk9-platform/pull/1513) confirmation return target | **Blocked** | Forgot-password entry was browser-verified, but no confirmation email was sent, so its external action URL/return target was not replayed. |
| [#1515](https://github.com/rbeezley/myk9-platform/pull/1515) branded auth email | **Blocked** | Requires receiving an external email; no email was triggered. |
| #1525, #1523 | **Not applicable** | Admin template authoring/removal only. |
| #1519, #1517, #1511 | **Not applicable** | Load-rehearsal infrastructure only. |
| #1514, #1512, #1503 | **Not applicable** | QA/test harness only; passing tests were not counted as browser verification. |
| #1510, #1506 | **Not applicable** | OpenSpec documentation/archive only. |
| #1508, #1504 | **Not applicable** | Database advisor/index maintenance with no scoped exhibitor UI behavior. |
| #1507, #1496 | **Not applicable** | Skills workflow and CI dependency maintenance. |

## Top five improvements

1. Preserve one explicit entry state across selection, wait list, cart, refresh, back/forward, and checkout.
2. Make toasts, sticky actions, and dirty-form recovery one shared safety contract.
3. Remove exhibitor access to existing staff controls; link roles to the correct existing surface.
4. Treat tablet, 390 px mobile, touch targets, and 125–200% zoom as mandatory wizard/dashboard breakpoints.
5. Consolidate count/upcoming-state queries so My Shows, Show Detail, Dog Overview, Career, and class surfaces cannot disagree.

## Console, confidence, gaps, and next verification

Browser console contained no errors. Repeated warnings included `entries: Skipping remote sync without show scope`, subscription-gate legacy/resolver mismatch, Base UI animation warnings, and dev-mode LCP warnings from about 4.4 s to 37.5 s. Because the local server is a development build and the account has 68 dogs/511 class entries, performance is classified **test/environment/inconclusive**, not a confirmed product finding.

**Confidence:** high for the browser-reproduced findings and viewport measurements; medium for underlying causes; low for performance and security behavior not exercised by safe browser actions.

Next run should:

1. Replay EUX-2026-07-30-01; promote only if it reproduces on the second weekly run.
2. Use a clean, purpose-built exhibitor fixture with open, closed, ineligible, full/wait-list, upcoming, completed, scratched, transferred, and move-up states.
3. With explicit shared-system approval, exercise one disposable submit/payment-cancel, scratch/transfer/move-up, check-in correction, and duplicate-submit attempt.
4. Replay true offline/reconnect and stale-data recovery at `/at-show`.
5. Re-test MYK9-65 and every approved High draft after implementation; never mark resolved from tests alone.
