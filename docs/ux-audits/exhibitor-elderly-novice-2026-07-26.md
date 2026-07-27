# Exhibitor Role Journey UX Audit — Elderly Novice

- **Date:** 2026-07-26
- **Persona:** Retired exhibitor with no computer or smartphone skills. Reads labels literally,
  does not discover hidden scrolling, and assumes every status and dollar amount is authoritative.
- **Account:** `e2e-exhibitor@test.myk9.com` (Complimentary Premium, dark mode)
- **Viewports:** mobile 390×844 (full walk), desktop 1280×800 (full pass), tablet 834×1112
  portrait and 1112×834 landscape (differential pass)
- **Baseline:** [`exhibitor-elderly-novice-2026-07-24.md`](exhibitor-elderly-novice-2026-07-24.md)
- **PR window:** merged from 2026-07-25 00:26 UTC through 2026-07-27 00:26 UTC
- **Payment boundary:** no Stripe purchase was authorized or completed

## Executive assessment

The exhibitor journey is materially more trustworthy than it was two days ago. My Shows and My
Payments now agree that the account owes `$0.00`, entry statuses use the clearer **Pending
Secretary Approval** label, mobile payments expose the amount and receipt, the map view works,
dog registration data survives add/edit flows, and checkout failures terminate with an
understandable recovery screen.

It is still unsafe for a novice to complete the whole journey without help.

The most serious defect is unchanged: a toast can cover the wizard's sticky **Back / Next**
footer. During this walk, tapping Next while **Added to cart** covered the footer produced no
visible result; closing the toast and tapping again worked. This is the same interaction family
that silently discarded a dog edit in the previous audit.

The app also exposes two conflicting mental models. Exhibitors see a read-only warning on class
pages but can open an enabled **Edit Class** dialog and browse operational trial controls.
Separately, dog identity is now correctly registration-centered in storage and display, while the
forms still ask for base-level Registered Name and Breed and still warn that an unregistered dog
will be saved as Mixed Breed.

**Overall UX health: Needs work.** The journey is completable, but the app still makes a low-skill
user doubt whether a tap worked, whether an entry was rejected, where dog identity belongs, and
whether they are allowed to operate the show.

## Regression line

Against the 2026-07-24 baseline of 24 findings:

- **RESOLVED: 5** — mobile Add/Edit Dog primary buttons are no longer clipped (#2); an
  unregistered dog is no longer persisted and displayed as Mixed Breed (#4); My Shows and My
  Payments agree on amount due (#6); the misleading **Add or Change Entries** CTA is now **Add
  Classes** (#7); sidebar and dog-card links now have accessible names (#18).
- **STILL OPEN: 19** — including the critical toast/footer collision (#1), mobile validation
  summary (#3), base-dog Registered Name (#5), entry change/withdrawal ambiguity (#8), **Not
  accepted** (#9), count ambiguity (#10), desktop payment clipping (#11), truncated navigation
  help (#12), nested wizard scrolling (#13), dog-detail hierarchy (#14), class guidance (#15),
  registration warning without an action (#16), visually icon-only show views (#17), repeated
  payment copy (#19), repeated pending schedule rows (#20), and polish findings #21–#24.
- **NEW: 6** — exhibitor access to operational class/trial controls; broken tablet wizard
  progress; overlapping tablet payment totals; unnamed dog checkboxes and map marker; Ringside
  navigation that conflicts with the exhibitor role intent; stale Mixed Breed helper text after
  the underlying model was corrected.

Several baseline items improved without fully resolving: the dog Overview now has two rather than
three registration CTAs; payment history is good on phone but still clips on desktop and overlaps
at tablet portrait; the Find Shows icons have accessible names but no visible labels; count labels
are clearer on My Shows but show detail still mixes dogs, entries, and classes.

## Top five fixes

1. **Make toast and sticky-action layers mutually exclusive.** Never let a toast overlap a form
   or wizard footer. Route changes should dismiss old toasts, and dirty forms need a leave guard.
2. **Give submitted entries one honest management path.** On the existing entry card or show
   detail, say whether the exhibitor can edit/withdraw or must contact the secretary, and link to
   that existing contact surface. Use **Awaiting review**, not **Not accepted**.
3. **Remove operational show controls from the exhibitor experience.** The class page cannot say
   read-only while exposing Edit. Present the exhibitor schedule/result view and deep-link staff
   to the existing operational page; do not build another management surface.
4. **Finish the dog-identity consolidation in the UI.** Registered name and breed belong to a
   registration. Remove them from the base dog form and delete the now-false Mixed Breed copy.
5. **Treat tablet as its own breakpoint.** Fix the four-step progress layout, payment-summary
   overlap, clipped tab strips, and sidebar/content competition at 834px.

## Major journey coverage

| Journey                                              | Mobile                      | Desktop | Tablet | Result                                                      |
| ---------------------------------------------------- | --------------------------- | ------- | ------ | ----------------------------------------------------------- |
| Two-step sign-in and account recovery affordances    | Full                        | Spot    | Spot   | Pass; echoed email still truncates on phone                 |
| My Shows, status filters, cards, details, directions | Full                        | Full    | Full   | Improved; counts/statuses still conflict on detail          |
| My Dogs list, search/filter surface, dog detail      | Full                        | Full    | Full   | Pass with hierarchy and identity-language issues            |
| Add dog, add AKC registration                        | Full mutation               | Layout  | Layout | Created successfully; registration persisted                |
| Edit dog and registration                            | Full mutation               | Full    | Spot   | Name, measurements, and registration edit persisted         |
| Find Shows cards/table/calendar/map and show detail  | Full                        | Full    | Full   | Map works; icon-only controls and unnamed marker remain     |
| Four-step entry wizard                               | Full through payment review | Full    | Full   | One class left in cart; no payment; toast blocked Next once |
| My Payments, receipt links, refund row               | Full                        | Full    | Full   | Money agrees; tablet totals overlap; desktop table clips    |
| Checkout cancel and missing-session success          | Full                        | Spot    | Spot   | Clear recovery; no indefinite loading                       |
| Check-in                                             | Full dialog                 | Spot    | Spot   | Status choices clear; cancelled without mutation            |
| Messages                                             | Full compose surface        | Spot    | Spot   | Clear; no message sent                                      |
| Account, preferences, subscription, Premium records  | Full                        | Full    | Spot   | Unified account works; Health form opened then cancelled    |
| Class detail, results, trial detail                  | Full                        | Full    | Spot   | Exhibitor sees operational controls despite read-only copy  |
| Ringside `/at-show` landing and show gate            | Full                        | Full    | Full   | Gate is clear; role/navigation mismatch remains             |

`/exhibitor/dashboard`, `/my-entries`, `/exhibitor/show-day`, and `/exhibitor/profile` correctly
consolidate into the canonical My Shows or Account surfaces. The inventory route
`/exhibitor/entries/history` returns a 404; no live user-facing link to it was found.

## Findings

Severity follows `UX-Audit`: **Critical** = core task/data safety; **High** = significant struggle;
**Medium** = friction; **Low** = polish.

| #   | Severity | Reg                        | Viewport                      | Path                                | Confusion and impact                                                                                                                                                                                                                                                                                          | Concrete improvement                                                                                                                                                            |
| --- | -------- | -------------------------- | ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Critical | STILL OPEN                 | Mobile, likely all            | Entry wizard sticky footer          | The **Added to cart** toast covered Back/Next. A tap on Next did nothing until the toast was closed. The prior audit proved the same pattern can navigate away and discard an edit. [Evidence](assets/exhibitor-elderly-novice-2026-07-26/mobile-toast-overlay.jpg).                                          | Reserve space for one layer, dismiss route-stale toasts, and add dirty-form navigation protection. Add an interaction test that taps the footer while a toast is visible.       |
| 2   | High     | NEW                        | All                           | Class and trial detail              | A banner says the exhibitor has read-only access, but **Edit** opens enabled Judge and Status controls. Trial detail exposes Timeline, judge supplies, entry counts, and class operations.                                                                                                                    | Use the existing exhibitor schedule/result presentation for exhibitors. Hide staff mutations by role at both routing and component boundaries.                                  |
| 3   | High     | STILL OPEN                 | All                           | Submitted entries and show schedule | Existing entries have no explicit Edit/Withdraw path. Some schedule rows still say **Not accepted** while entry cards say **Pending Secretary Approval**.                                                                                                                                                     | On the existing entry card, expose the permitted action or a secretary-contact deep-link. Standardize lifecycle vocabulary.                                                     |
| 4   | High     | NEW / baseline #4 evolved  | All                           | Add/Edit Dog                        | Storage and profile now correctly derive identity from registrations, but Add Dog still says an unregistered dog is saved as Mixed Breed, and Edit Dog still requires base-level Registered Name and offers Breed.                                                                                            | Remove stale Mixed Breed copy and base-level registered identity fields. Keep call name on the dog and registered name/breed on registrations only.                             |
| 5   | High     | STILL OPEN                 | Mobile                        | Add Dog empty submit                | The footer error summary wraps almost one word per line and hides an error behind **(+1 more)**. Inline errors are readable, but the summary is not. [Evidence](assets/exhibitor-elderly-novice-2026-07-26/mobile-validation.jpg).                                                                            | Put the complete summary above the footer at full width; make each item focus its field.                                                                                        |
| 6   | High     | NEW                        | Tablet portrait and landscape | Entry wizard progress               | At 834px, steps display as `Current`, `2Jpcoming`, `3Jpcoming`, `4Jpcoming`; at 1112px the labels and descriptions truncate into fragments. [Evidence](assets/exhibitor-elderly-novice-2026-07-26/tablet-entry-wizard.jpg).                                                                                   | At tablet widths show short labels only, with state below; move descriptions into the active-step heading. Test 834 and 1112 widths.                                            |
| 7   | Medium   | NEW / baseline #11 evolved | Tablet portrait, desktop      | My Payments                         | At 834px, Gross paid, Refunds, and Net paid values overlap. At 1280px the table still needs horizontal scrolling and clips Receipt/refund description. [Tablet](assets/exhibitor-elderly-novice-2026-07-26/tablet-payments.jpg) · [Desktop](assets/exhibitor-elderly-novice-2026-07-26/desktop-payments.jpg). | Keep the card list through tablet, stack the three totals below ~900px, and make the desktop table fit without hiding Receipt.                                                  |
| 8   | Medium   | NEW                        | All                           | Wizard dog picker; Find Shows map   | The real dog-selection checkboxes have no accessible names, and the Leaflet show marker is an unnamed button.                                                                                                                                                                                                 | Associate each input with the dog-card label and give each marker the show name, date, and location. Add an unnamed-control axe assertion.                                      |
| 9   | Medium   | STILL OPEN                 | All                           | My Shows and show detail            | The account shows 5 current entries, 7 all entries, a My Entries badge of 15, and “10 classes across 5 dogs.” My Shows labels improved, but the show screen still does not state the counting unit.                                                                                                           | Name every unit: dogs, submitted entries, and class entries. Use shared selectors and consistent terms.                                                                         |
| 10  | Medium   | STILL OPEN                 | Desktop, tablet               | Sidebar                             | All navigation helper text truncates, including the novice-oriented explanation of Ringside and payments. [Desktop evidence](assets/exhibitor-elderly-novice-2026-07-26/desktop-dashboard.jpg).                                                                                                               | Allow two lines or widen/collapse the rail at intermediate widths.                                                                                                              |
| 11  | Medium   | STILL OPEN                 | Mobile, tablet                | Entry wizard step 1                 | The dog list is a fixed-height inner scroll inside the page scroll. A novice can miss later dogs and the Next button.                                                                                                                                                                                         | Use page scrolling below desktop; keep a contained list only where pointer and viewport size support it.                                                                        |
| 12  | Medium   | STILL OPEN                 | Mobile                        | Dog Overview                        | Registrations appear before basic identity and two Add Registration CTAs remain. The About information is below most page content.                                                                                                                                                                            | Put identity first and keep one registration CTA inside the existing registration section.                                                                                      |
| 13  | Medium   | STILL OPEN                 | All                           | Entry wizard classes                | Advanced and Master classes are offered without eligibility or “start with Novice” guidance, even though a mistaken paid class has no clear edit path.                                                                                                                                                        | Add concise eligibility/starting-level guidance and disable known-ineligible choices.                                                                                           |
| 14  | Medium   | STILL OPEN                 | All                           | Entry wizard dog warning            | **No registration on file — verify before submitting** has no action and does not explain the narrow exception.                                                                                                                                                                                               | Link directly to that dog's existing Add Registration panel and state when registration is required.                                                                            |
| 15  | Medium   | STILL OPEN                 | Mobile, tablet                | Find Shows                          | Cards/Table/Calendar/Map now have accessible names but remain visually icon-only; the entered-show tab clips, and the map pin has no visible or accessible label.                                                                                                                                             | Add visible short labels, wrap the tabs, and label pins. Do not add a new page.                                                                                                 |
| 16  | Medium   | STILL OPEN                 | All                           | Wizard payment                      | The secure-checkout reassurance is repeated twice verbatim plus a third variant.                                                                                                                                                                                                                              | Keep one reassurance beside the payment action.                                                                                                                                 |
| 17  | Medium   | STILL OPEN                 | All                           | Show schedule                       | Ten rows repeat Time pending, Armband pending, and Judge TBD.                                                                                                                                                                                                                                                 | Collapse unavailable schedule data into one dated expectation and notify when published.                                                                                        |
| 18  | Medium   | NEW                        | All                           | Navigation → Ringside               | The exhibitor sidebar promises check-in/run order in **Ringside**, while `INTENT.md` says exhibitors never need the ringside operational app. The landing says “step into the ring,” then gates access by date/passcode.                                                                                      | Keep show-day exhibitor information in My Shows and link staff roles to Ringside. If the link remains, rename it to the exact exhibitor outcome and remove staff-oriented copy. |
| 19  | Low      | STILL OPEN                 | All                           | Dog edit and records                | Raw enum values such as `female` appear lowercase.                                                                                                                                                                                                                                                            | Use shared display-label formatters.                                                                                                                                            |
| 20  | Low      | STILL OPEN                 | All                           | Entry wizard                        | Dog names and agreement copy use ALL CAPS, unlike the rest of the app.                                                                                                                                                                                                                                        | Use title/sentence case.                                                                                                                                                        |
| 21  | Low      | STILL OPEN                 | All                           | Add Dog vs Edit Dog                 | Add uses Essential / Registration / Optional details; Edit uses Basic Info / More for this dog, with different field placement.                                                                                                                                                                               | Reuse one vocabulary and field order.                                                                                                                                           |
| 22  | Low      | STILL OPEN                 | Mobile, tablet                | Sign-in; My Dogs strip              | The echoed email truncates before `.com`, and horizontal dog cards clip with no scroll cue. [Sign-in evidence](assets/exhibitor-elderly-novice-2026-07-26/mobile-sign-in.jpg).                                                                                                                                | Wrap the email and add a fade/arrow plus keyboard-accessible scrolling to horizontal strips.                                                                                    |

## Verification of PRs merged in the prior 48 hours

Every merged PR in the exact window was screened. The table below contains the PRs with
exhibitor, dog, checkout, or at-show behavior observable in this journey. Infra, docs, security,
secretary-only, and internal refactor PRs were reviewed for scope but are not claimed as
browser-verified.

| PR                                                                                                                                                                                                         | Browser result                    | Evidence                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#1428](https://github.com/richardbeezley/myk9-platform/pull/1428)                                                                                                                                         | **Verified**                      | Mixed-status rows showed the appropriate payment/check-in actions; check-in dialog had clear status choices.                                                      |
| [#1456](https://github.com/richardbeezley/myk9-platform/pull/1456)                                                                                                                                         | **Verified**                      | My Shows and My Payments both say paid in full / `$0.00`; mobile payment cards expose amount, status, and receipt.                                                |
| [#1460](https://github.com/richardbeezley/myk9-platform/pull/1460)                                                                                                                                         | **Partial**                       | Premium access resolved successfully. Judge-assignment transition behavior is staff-only and was not reachable as an exhibitor.                                   |
| [#1461](https://github.com/richardbeezley/myk9-platform/pull/1461), [#1462](https://github.com/richardbeezley/myk9-platform/pull/1462)                                                                     | **Blocked by correct gate**       | Next-up/quick-advance and favorite push are behind the at-show date/passcode gate and are not exhibitor operations. The landing and gate were verified.           |
| [#1464](https://github.com/richardbeezley/myk9-platform/pull/1464)                                                                                                                                         | **Partial**                       | Complimentary Premium Records and a Health form opened; dog-card/nav accessible names improved. New unnamed wizard checkboxes remain.                             |
| [#1469](https://github.com/richardbeezley/myk9-platform/pull/1469)                                                                                                                                         | **Verified with copy defect**     | Add Dog stayed mounted through registration and saved successfully; Pending Secretary Approval appears. The stale Mixed Breed copy remains.                       |
| [#1472](https://github.com/richardbeezley/myk9-platform/pull/1472), [#1477](https://github.com/richardbeezley/myk9-platform/pull/1477), [#1478](https://github.com/richardbeezley/myk9-platform/pull/1478) | **Verified**                      | Profile and wizard read registered name, breed, and number from the AKC registration; call name is required; an unregistered dog no longer receives a fake breed. |
| [#1473](https://github.com/richardbeezley/myk9-platform/pull/1473)                                                                                                                                         | **Verified**                      | Dog-card links and menus have meaningful accessible names.                                                                                                        |
| [#1475](https://github.com/richardbeezley/myk9-platform/pull/1475)                                                                                                                                         | **Not directly observable**       | Favorite scoping/reliability requires a reachable live at-show session.                                                                                           |
| [#1480](https://github.com/richardbeezley/myk9-platform/pull/1480)                                                                                                                                         | **Out of role**                   | Prefilled entry blanks are secretary-facing.                                                                                                                      |
| [#1481](https://github.com/richardbeezley/myk9-platform/pull/1481)                                                                                                                                         | **Verified**                      | `/checkout/cancel` explains recovery; `/checkout/success` without a session terminates at Payment Status Unavailable rather than hanging.                         |
| [#1482](https://github.com/richardbeezley/myk9-platform/pull/1482)                                                                                                                                         | **Verified**                      | Add Dog panel uses the available tablet width and full-screen mobile layout.                                                                                      |
| [#1483](https://github.com/richardbeezley/myk9-platform/pull/1483)                                                                                                                                         | **Verified**                      | Call name, weight, and height edits persisted.                                                                                                                    |
| [#1484](https://github.com/richardbeezley/myk9-platform/pull/1484)                                                                                                                                         | **Verified with a11y defect**     | Map view renders the show and opens its popup; marker is unnamed.                                                                                                 |
| [#1485](https://github.com/richardbeezley/myk9-platform/pull/1485)                                                                                                                                         | **No intended UI delta**          | Entry cards rendered normally after the refactor.                                                                                                                 |
| [#1486](https://github.com/richardbeezley/myk9-platform/pull/1486)                                                                                                                                         | **Partial**                       | My Shows uses honest Pending Secretary Approval / In Ring labels; show schedule still says Not accepted.                                                          |
| [#1487](https://github.com/richardbeezley/myk9-platform/pull/1487)                                                                                                                                         | **Desktop pass, responsive fail** | Four labeled steps are excellent at desktop. Phone requires horizontal discovery; tablet labels overlap or truncate.                                              |
| [#1490](https://github.com/richardbeezley/myk9-platform/pull/1490)                                                                                                                                         | **Verified**                      | The AKC registration remained visible after dog and registration edits and across route reloads.                                                                  |
| [#1491](https://github.com/richardbeezley/myk9-platform/pull/1491)                                                                                                                                         | **Functional pass**               | Registration creation succeeded in the required order. Cross-device replication ordering was not provable in one browser session.                                 |

## Responsive observations

- **Mobile 390×844:** primary buttons now fit, payment cards are effective, and checkout recovery
  is clear. It remains the least safe viewport because toasts cover sticky actions, error summaries
  collapse, the dog picker nests scroll regions, and horizontal progress/tabs lack discovery cues.
- **Desktop 1280×800:** the clearest overall layout. The entry stepper is excellent here. The
  payment table still clips/scrolls, navigation help truncates, and role/data-model contradictions
  remain because they are not responsive defects.
- **Tablet portrait 834×1112:** the weakest breakpoint in this run. A fixed 236px sidebar leaves
  roughly 600px for desktop-oriented content. Wizard state labels corrupt, payment totals overlap,
  entry tabs clip, and the horizontal dog strip cuts cards mid-content.
- **Tablet landscape 1112×834:** My Shows is healthy after loading, but the entry stepper still
  truncates every label/description and the payment table returns to desktop horizontal clipping.

## What worked well

- Sign-in is calm, two-step, and includes Edit, show-password, and Forgot Password.
- My Shows now states **5 current entries: 3 accepted · 2 pending** and **Paid in full**.
- Mobile My Payments is excellent: amount, status, refund meaning, and receipt are all visible.
  [Evidence](assets/exhibitor-elderly-novice-2026-07-26/mobile-payments.jpg).
- Adding a dog and nested AKC registration completed without the panel remount/data-loss failure.
- Dog and registration edits persisted, including measurements and registered identity.
- The show map works at every viewport, and the four view buttons have accessible names.
- Checkout terminal states explain what happened and how to recover.
- Check-in vocabulary is plain: Checked-in, At Gate, Conflict, Pulled.
- At-show correctly blocks an upcoming show before opening operational tools.
- Consolidation redirects avoid duplicate dashboards and profile pages.

## Duplication and intent check

**Does any recommendation require a duplicate page? No.**

- Submitted-entry help belongs on existing My Shows cards/show detail and can deep-link to the
  existing message/secretary contact surface.
- Exhibitor schedule/results should reuse the existing exhibitor presentation; staff operations
  already have class/trial surfaces.
- Dog identity belongs in the existing Dog Overview and Registration panel.
- Money belongs on My Payments, summarized by My Shows.
- Toast/footer, stepper, and responsive summary fixes belong in shared primitives.

This follows [`docs/INTENT.md`](../INTENT.md): the exhibitor target feeling is “This respects my
time.” The current Ringside navigation is the clearest intent mismatch; the document explicitly
says exhibitors never need the operational ringside app.

## Data and side effects left behind

- **Created:** dog **Audit Clover Updated**, Female, DOB 4/15/2021, 42 lb, 21 in
  (`46cdef3c-b484-4fd8-bf7f-10570252fdab`).
- **Created and edited:** AKC registration **Cloverfield Audit Star II**, Golden Retriever,
  `QA-CLOVER-0726`.
- **Cart:** one unsubmitted `$30.00` class selection remains — Audit Clover Updated, Container
  Novice A. The cart shows a 7% fee and `$32.10` total.
- **Not performed:** Stripe payment, check-in mutation, message send, Health record save, dog
  deletion, account deletion, passcode entry, push notification, or staff-side mutation.
- Console diagnostics had no application errors. Repeated
  `[useSubscriptionGate] legacy/resolver mismatch` warnings appeared for the Complimentary Premium
  account, plus `[entries] Skipping remote sync without show scope`.
- Eight screenshots are stored under
  [`assets/exhibitor-elderly-novice-2026-07-26`](assets/exhibitor-elderly-novice-2026-07-26).
- This report is audit-only. No application source was changed.
