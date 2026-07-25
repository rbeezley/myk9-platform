# Exhibitor Role Journey UX Audit — Elderly Novice

- **Date:** 2026-07-23
- **Auditor:** Codex (`role-journey-ux-audit`)
- **Account:** canonical seeded exhibitor (`e2e-exhibitor@test.myk9.com`)
- **Viewports:** mobile 390×844 full walk; desktop 1280×800 full pass; tablet 834×1112 plus 1112×834 landscape spot check
- **Premium states:** Free, temporary complimentary Premium, and restored Free
- **Baseline:** 2026-07-08 full-role audit plus the 2026-07-09 My Shows and 2026-07-10 entry-journey focused audits

## Overall experience

The redesigned My Shows page is now much closer to the secretary redesign's strongest lesson: one calm home surface with a clear next action and links to the canonical work pages. The July entry-status contradiction is resolved, Ringside now explains when it opens, and the dog add/edit forms remain clear and well validated.

The exhibitor role is **not completely finished**, primarily because the shipped Premium experience has not received the same consolidation and reliability pass. Premium is spread across seven horizontally scrolling dog tabs, several of which are clipped even on desktop. Pedigree and Health Records break at common tablet widths. More seriously, Premium record forms can bypass required-field validation, a selected health date renders one day early, and the Subscription page contradicts a valid complimentary entitlement while displaying fabricated secretary-style usage counts.

For an elderly novice, these are trust failures. Health history, pedigree, payment, and entitlement state must be at least as reliable as the secretary's show-day data before Premium can be sold.

**Overall UX health: Not launch-ready.** The Free exhibitor lifecycle is substantially improved; Premium needs a focused reliability and consolidation remediation.

## Regression line

Compared with the prior audits:

- **NEW:** 12 findings, primarily in Premium surfaces that were not included in earlier full walks.
- **STILL OPEN:** 3 findings — contradictory money state, inconsistent entry counts, and the five-lock Premium tab density.
- **RESOLVED:** 7 previously high-impact behaviors were directly re-walked and are now working: visible My Shows orientation, calmer entry cards, actionable payment-due cards, show-date rendering, show-day recovery, open-show discovery, and the former show-detail “My Entries 0” contradiction.
- **NOT RE-TESTED:** destructive dog deletion/refetch, exhibitor check-in dialog vocabulary, stale cart behavior, and Developer menu visibility.

## Premium scope walked

All currently shipped Premium surfaces were included:

1. Title Progress, including manual result validation and cancel.
2. Statistics and charts.
3. Health Records, including timeline/traditional views, empty state, create, edit, validation, date rendering, filters, import/export affordances, and cleanup.
4. Training Journal, including create, edit, delete, progress report, goals, empty state, and cancel.
5. Pedigree, including create validation, the resulting invalid record, delete confirmation, and responsive tree layout.
6. Pricing.
7. Subscription Management.
8. Free → complimentary Premium → Free entitlement transitions.

`Competitions` was walked as part of the dog profile but is not Premium-gated. `/exhibitor/analytics` remains feature-disabled and is not treated as a shipped Premium surface.

## Top 5 to fix first

1. **Stop invalid Premium records at the form boundary.** Submitting an empty required Pedigree form created a blank sire. The same programmatic-submit pattern silently closed the Health dialog on invalid input.
2. **Make effective entitlement the subscription source of truth.** A complimentary user sees “Founding member — premium is on us” and unlocked features, but the same page says “No active subscription” and offers “View Plans.”
3. **Fix health-record integrity.** A July 23 vaccination was stored and shown in Edit as July 23, but Timeline and Traditional views rendered July 22. Search and year filters are also nonfunctional in source.
4. **Replace the seven-tab overflow with a discoverable dog-profile structure.** Tabs clip on phone, tablet, and desktop; Pedigree and Health layouts overflow inside the narrowed content column.
5. **Remove false promises and fabricated data.** “Add or Change Entries” cannot change existing classes, Subscription displays hardcoded usage, and Pricing ships fake contact details plus `#` links.

## Findings

| # | Severity | Regression | Tag | Viewport(s) | Surface | Finding | Concrete fix |
|---|---|---|---|---|---|---|---|
| 1 | Critical | NEW | buildable | all | Dog → Pedigree → Add Sire | Pressing **Add** with the required Registered Name empty created a blank sire. `PedigreeAncestorAddDialog` programmatically dispatches `submit`, bypassing native constraint validation, and the handler does not validate the value. | Use `requestSubmit()` or schema validation and do not mutate/close until valid. Add assertion-first tests proving blank `registered_name` is never sent. Apply the same repair to all `StandardDialog` form dispatchers. |
| 2 | High | NEW | buildable | all | Dog → Health Records → Add Event | Empty required submission silently closes. The same programmatic-submit pattern bypasses native validation; the DB happened to reject/avoid a visible blank record, but no error reached the user. | Centralize validated form submission in `StandardDialog`; keep the dialog open, focus the first invalid field, show an inline summary, and surface mutation errors. |
| 3 | High | NEW | buildable | all | Dog → Health Records | A vaccination selected as **July 23** and shown as `07/23/2026` in Edit rendered as **7/22/2026** in both Timeline and Traditional views. | Parse date-only values as local calendar dates (`parseLocalDateString`/shared helper), never `new Date('YYYY-MM-DD')`. Add date-only tests in a negative UTC offset. |
| 4 | High | NEW | buildable | all | Health Timeline | Search is controlled with `value={''}`, so input cannot persist. Year select is also `value={''}`, and every year option has `value={''}`. | Bind search to `searchTerm`, year select to `selectedYear`, and each option to its year. Add interaction tests for search, type, and year combinations. |
| 5 | High | NEW | buildable | mobile, tablet, desktop | Dog detail navigation | Seven peer tabs overflow at every tested width. Deep-linking centers the selected tab and clips earlier/later destinations; on Free, five adjacent lock icons recreate the “everything is paywalled” feeling from finding #17 of the 7/8 audit. | Keep one canonical dog page, but group the tabs into a smaller novice-first structure such as Profile / Career / Care, with Premium destinations inside those existing sections. Do not create a Premium dashboard. |
| 6 | High | NEW | buildable | mobile, tablet, desktop | Pedigree | The fixed flex tree cuts off grandparent cards and labels at 390, 834, 1112, and 1280 widths. At desktop, the app sidebar and dog About rail leave too little width for the four-card row. | Use a responsive tree/list: stack lineage branches on narrow content widths and avoid a four-card fixed row. Preserve explicit Sire/Dam relationships without gesture-only horizontal panning. |
| 7 | High | NEW | buildable | tablet landscape; mobile | Health Records | Header/actions and event cards overflow the dog content column. At 1112×834, the Health description collapses word-by-word, Add Event is clipped, and the right edge is covered by the About rail. At 390px, badges and activity rows overlap or leave content offscreen. | Make the section respond to its **container**, not only viewport breakpoints; wrap actions, stack metadata/badges, and collapse the dog sidebar sooner. |
| 8 | High | NEW | buildable | all | Subscription Management | A valid complimentary grant unlocks Premium and shows a Founding Member banner, while Current Subscription says **No active subscription** and shows **View Plans**. There is no generic gift/complimentary state. | Render one effective entitlement model: Paid Premium, Complimentary Premium until date, Trial Premium, Expired, or Free. Only show Stripe management for Stripe-backed plans. |
| 9 | High | NEW | buildable | all | Subscription Management | “Usage This Month” is hardcoded to **12 Shows Created, 45 Dogs Registered, 89 Entries Processed, 156 Reports Generated**. These are fabricated and secretary-oriented values shown to an exhibitor. | Delete the card. If useful exhibitor metrics are later justified, derive them from real data and place them on the canonical dog/show surfaces, not billing. |
| 10 | High | STILL OPEN | buildable | all | My Shows vs My Payments | My Shows says **$150 due** and provides Finish Payment, while My Payments says **$0.00 — Current entries are paid up**. The 7/8 audit's most important money contradiction remains. | Derive amount due and payment actions from one server-backed selector used by both pages. Add a cross-page contract test for the canonical account. |
| 11 | High | NEW | buildable | all | Show detail → Add or Change Entries | The CTA promises existing entries can be changed, but every existing class is disabled and Next remains disabled when no new class is available. There is no explanation or change/withdraw path. | If fall scope is add-only, rename to **Add Classes** and explain existing entries are managed through the show team. Do not imply deferred self-service withdrawal/move-up support. |
| 12 | Medium | STILL OPEN | buildable | all | My Shows / show detail | Counts remain hard to reconcile: My Shows shows 7 entry records, the show tab says My Entries 15, while the schedule says 10 classes across 5 dogs. The labels do not explain status or record scope. | Define and name the counting unit (“dogs,” “class entries,” “upcoming runs”) and use shared selectors. Do not add another summary surface. |
| 13 | Medium | NEW | buildable | all | Training Journal | Delete is an unlabeled trash icon that immediately removes the entry with no confirmation or undo. The walkthrough deleted the synthetic session in one tap. | Give the control an accessible name and use a short undo toast. A blocking confirm is unnecessary if undo is reliable. |
| 14 | Medium | NEW | buildable | all | Training Journal / Goals | Visual labels are not programmatically associated with fields; Rich Text toolbar buttons and the delete button are unnamed; Goals includes an unlabeled date field. | Use `Label htmlFor`, descriptive button names/tooltips, and an accessible rich-text toolbar. Add an axe/role-name test for both dialogs. |
| 15 | Medium | NEW | buildable | mobile | Dog list → Dog detail | Opening Willow from the bottom of the dog list preserved the prior scroll position and landed midway down the dog page, hiding the dog identity and tabs until the next interaction. | Reset scroll on entity-route navigation while preserving scroll only for back-navigation to the list. |
| 16 | Medium | NEW | buildable | mobile | My Payments | The desktop table is retained on phone; only Date and Show are visible, while Amount, Status, and Receipt are offscreen without a clear continuation cue. | Use a compact payment card/row at narrow widths with amount, status, and receipt visible. Keep the canonical Payments page; do not duplicate receipts. |
| 17 | Medium | NEW | buildable | all | Pricing | Pricing does not recognize an already-entitled complimentary user and still says Subscribe Now. Its footer contains a fake `555` phone number, San Francisco location, generic copy, and many `#` links. | Make the CTA entitlement-aware and reuse the real public-site footer/contact data; delete unavailable links. |
| 18 | Low | NEW | cosmetic-only | repository | Premium scope documentation | `docs/future/exhibitor-premium.md` says these features are parked and must not be built, while the app, pricing, and the requested launch direction ship them. | Resolve the product decision. Given the current direction, update the role/future docs and make Premium part of the exhibitor completion plan. |

## Responsive / cross-breakpoint notes

- **Mobile 390×844:** My Shows and dog add/edit remain usable. The main Premium navigation requires horizontal discovery; Free shows five lock icons; Health event cards and My Payments overflow; opening a dog can preserve list scroll.
- **Tablet portrait 834×1112:** the persistent 236px sidebar leaves a narrow Premium content column. Pedigree grandparents are clipped and early tabs disappear off the left edge.
- **Tablet landscape 1112×834:** adding the dog About rail makes Health and Pedigree worse, not better. Health actions are clipped; Pedigree loses both outer grandparent cards.
- **Desktop 1280×800:** Statistics and Training become usable, but the seven-tab strip and Pedigree still clip. This confirms the breakage follows **available content width**, not simply device width.
- **Light mode:** not re-walked; the canonical account remained in dark mode. No conclusion about light-mode contrast is claimed.

## Secretary-redesign lessons to apply

1. **One concern, one canonical surface.** Secretary work improved when duplicate Today/Wrap-up surfaces were collapsed. Exhibitor should likewise keep My Shows, Find Shows, My Dogs, Payments, Account, and Ringside as the canonical lifecycle. Premium belongs inside the existing dog record, not on a new Premium dashboard.
2. **Summaries must be agreements, not estimates.** Show Desk and Entry Management succeeded only when their counts and statuses used shared selectors. Exhibitor money, entry counts, title legs, and entitlement need the same contract.
3. **Every status should land on the resolving action.** “Payment due” should open the exact payable items; “Premium until…” should open the matching entitlement state; “Add or Change” must actually allow change or use honest wording.
4. **Role voice follows the user's job.** Secretaries manage many people and exceptions. Exhibitors need personal answers: “Am I entered?”, “Do I owe anything?”, “Where do I go?”, and “What did my dog earn?”
5. **Progressive disclosure beats peer-tab accumulation.** Secretary complexity is exposed in context. Exhibitor Premium should group career, care, and training details instead of presenting every capability as a peer destination.
6. **Trustworthy destructive and data-entry behavior is part of polish.** Validation, confirmation/undo, visible save state, and date-only correctness are not edge cases when the data is a dog's permanent record.

## Complimentary/test subscriptions

The current system has two legitimate paths:

- **Paid subscription:** user completes Stripe checkout; Stripe/webhook-backed subscription records drive billing management.
- **Complimentary/test access:** a site admin or database owner sets `people.early_adopter_until` to a future timestamp. `useSubscriptionGate` then unlocks Premium without creating fake Stripe records. Set it to `NULL` (or a past date) to revoke.

This works technically but is branded only as “Founding member” and has no normal admin workflow. If complimentary access will be routine, add **Complimentary Premium until…** to the existing User Management surface with grant/revoke, reason, expiry, and audit history. This does **not** justify a new subscription-admin page.

The Subscription page must then display that effective entitlement instead of “No active subscription.” Never manually fabricate `stripe_customers` or `stripe_subscriptions` rows for test users.

## Duplication check

**Does the remediation duplicate an existing page?** No new page is justified.

- Subscription grant/revoke belongs on existing User Management.
- Effective plan state belongs on existing Subscription Management.
- Premium dog capabilities belong inside the existing dog record.
- Payment truth belongs on My Payments and is linked from My Shows.
- Entry changes belong in the existing registration/show-detail flow, with honest scope.

The main information-architecture change should consolidate seven dog tabs into fewer existing sections, not add another exhibitor dashboard.

## What worked well

- Two-step sign-in remains understandable.
- My Shows now has a visible title, clearer entry cards, payment actions, and useful filter states.
- Browse Shows and show detail now agree that the canonical account has entries; the former “My Entries 0” contradiction is resolved.
- The registration wizard clearly disables already-entered classes and can be cancelled without mutation.
- Title Progress explains legs remaining in plain language; manual-result validation summarizes missing fields.
- Statistics provides real dog-level totals and readable charts on desktop.
- Training create/edit, progress report, and goals surfaces are conceptually cohesive.
- Pedigree deletion uses a clear irreversible-action confirmation.
- Free → Premium → Free gating updated correctly after reload.
- Ringside's pre-show state now routes the exhibitor back to My Shows instead of presenting a worker-access dead end.

## Method notes and cleanup

- The complimentary grant was applied for the walk, then restored to `NULL`.
- One synthetic vaccination, one synthetic training entry, and one invalid blank pedigree ancestor were created. All were deleted; the staging account was left in its original Free entitlement state.
- No payment, Stripe checkout session, email, push notification, dog deletion, or account deletion was performed.
- Invalid, empty, success, edit, cancel, and delete states were exercised where safe. Loading/error components were source-inspected; a network failure was not forced because the connected browser does not intercept requests.
- Browser diagnostics contained local Vite HMR websocket noise caused by another dev server using the HMR port; no user-facing runtime crash occurred.
- This report is audit-only. No application source was changed.
