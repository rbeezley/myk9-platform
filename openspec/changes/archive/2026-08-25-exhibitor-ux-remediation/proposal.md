## Tracking

[MYK9-88](https://linear.app/myk9-platform/issue/MYK9-88/exhibitor-ux-remediation-tracked-in-openspec-change-exhibitor-ux)

MYK9-88 is a pointer issue; `tasks.md` is the execution tracker. Related: [MYK9-71](https://linear.app/myk9-platform/issue/MYK9-71/complete-the-exhibitor-journey-and-premium-entitlement-experience) (`exhibitor-journey-completion`) owns the findings excluded from this change — see Non-Goals.

## Why

The 2026-07-24 exhibitor role-journey audit ([`docs/ux-audits/exhibitor-elderly-novice-2026-07-24.md`](../../../docs/ux-audits/exhibitor-elderly-novice-2026-07-24.md)) walked the Free exhibitor lifecycle as an elderly novice across phone, tablet, and desktop and found one **Critical data-loss defect**: a lingering success toast renders on top of sticky footer action bars, so a tap intended for **Save Changes** activates the toast's CTA instead — the app navigates away and discards the edit with no error, no confirmation, and no unsaved-changes prompt, _while the footer is displaying "Unsaved changes."_ The same collision recurs on the entry wizard's Back/Next bar, so it is a shared-primitive defect, not a one-screen bug.

Alongside it the audit found the mobile sticky footer overflowing its viewport (clipping the primary button), a dog record that reports one empty breed value three different ways, a required field the create form never collects and no surface ever displays, and a set of legibility failures concentrated exactly on the explanatory text written for novice users. Losing a user's edit silently and asserting facts they never entered are the two failures that end trust for this persona, which makes them fall 2026 launch-readiness blockers.

## What Changes

- Guarantee that a **sticky action bar is never obscured** by a toast, and that its primary control stays fully within the viewport at every supported width. **BREAKING** for any surface that positions toasts by hard-coded z-index or bottom offset.
- Add a **dirty-form navigation guard** so a form that is tracking unsaved changes cannot be abandoned by an accidental navigation without confirmation.
- Make **validation summaries fully legible**: full-width, no one-word-per-line crushing, and no error hidden behind an un-actionable "(+1 more)".
- **Remove "Registered Name" from the base dog record** and capture it inside each registration instead. A dog has one call name ("Tera"); a registered name belongs to a registration with an organization ("Maia TeraByte Van Neerland" with AKC) and may differ per organization. `dog_registrations` already holds `registered_name`, `breed`, and `variety` per organization, so this **deletes** a required field rather than adding one.
- **Stop asserting a breed the owner never supplied.** Breed likewise belongs to a registration. A dog added without one displays no breed instead of being recorded as "Mixed Breed" — a claim about someone's dog that is stored and can reach entry paperwork. Fully dropping the column needs the data-model change (`dogs.breed` is `NOT NULL`); this change stops the placeholder reaching the owner or any submission.
- **Treat a missing registration for the sanctioning organization as blocking** in the entry wizard — a dog must be registered to compete, the sole exception being conformation puppy classes.
- Render **one stored value one way** across the dog list, dog record, and entry wizard (currently "Unknown" vs "Breed not set" for the same value), and ensure an untouched field survives an unrelated edit.
- Give the **entry wizard** page-flow scrolling at narrow widths (removing a nested 464px scroll container), class-level eligibility guidance, an actionable link on the "No registration on file" warning, and one payment reassurance statement instead of three.
- Extend the canonical **entry review vocabulary** to exhibitor-facing surfaces so "Not accepted" no longer reads as _rejected_ on entries that are merely awaiting review.
- Repair **exhibitor surface legibility**: untruncate sidebar nav subtitles, stop the My Payments table clipping its Receipt column at desktop width, label the icon-only Find Shows view toggles, give nav and dog-card links accessible names, collapse ten consecutive "Time pending · Armband pending · Judge TBD" rows into one honest message, and make the dog record lead with the dog rather than with registrations.

## Duplication Decision

**Does this duplicate an existing surface? No — and it deliberately hands off overlapping work rather than re-specifying it.**

The active change `exhibitor-journey-completion` (MYK9-71), created from the 2026-07-23 audit, already owns: the Dog Details Overview/Career/Records consolidation, honest entry-change wording, and enforcement of the existing `exhibitor-money-clarity` and `exhibitor-count-integrity` contracts. The 2026-07-24 re-walk confirmed those findings are still open, but they are **already specified there and are excluded from this change** (see Non-Goals). This change covers only what MYK9-71 does not.

No new page, route, dialog, or dashboard is introduced. Every fix lands on a canonical surface that already exists, and the largest item is a **shared layout primitive** — fixing toast/action-bar layering once covers every dialog and wizard in the app rather than patching each screen. Two items are deletions: duplicate payment reassurance copy, and the repeated pending-schedule rows. A link cannot substitute here, because the defects are collisions, clipping, silent persistence, and wording _inside_ the canonical surfaces themselves.

## Non-Goals

- **Excluded — owned by `exhibitor-journey-completion` (MYK9-71) slice 4, which had not started as of 2026-07-24:** the money contradiction (audit #6, its tasks 6.1–6.2), "Add or Change Entries" honest scope and the absence of any withdraw/edit path (#7, #8, its tasks 6.4–6.5), entry-count reconciliation (#10, its task 6.3), and the **phone-width** half of the My Payments disclosure (#11, its task 6.6). This change consumes those contracts; it does not restate them. The **desktop** clipping in #11 is retained here because task 6.6 explicitly scopes itself to 390px and leaves the desktop table alone.
- **Not excluded, contrary to an earlier draft — the dog record hierarchy (#14) is in scope.** MYK9-71 slice 2 (PR #1438, "consolidate dog workspace into Overview/Career/Records") is **already merged**. The audit ran against that merged result and found defects in it: Overview still opens on registrations rather than the dog, the same add-registration action is offered three times with three capitalizations, and on a phone the identity panel sits below the entire tab content. These are defects in shipped work, not a re-plan of it.
- **Excluded — cosmetic-only, deliberately deferred:** raw lowercase enum leakage (`male`, `health`) (#21), ALL-CAPS dog names and agreement label (#22), Add-vs-Edit tab vocabulary drift (#23), truncated sign-in email echo and the clipping My Dogs strip (#24). None of these cause task failure or a costly mistake; they are recorded in the audit for a later polish pass.
- No Premium surface work — the audited account is Free and every Premium create/edit control is gated read-only, so the baseline's Premium findings could not be re-tested and remain with MYK9-71.
- No new exhibitor dashboard, payment page, dog page, or parallel entry workflow.
- No change to Stripe checkout, pricing, refunds, or entry fees.
- No secretary, judge, ringside, or show-day redesign.

## Capabilities

### New Capabilities

- `form-action-safety`: App-wide contract that sticky/persistent action bars stay reachable and unobscured — toast layering below action bars, toast dismissal on route change, primary control never clipped at any supported width, dirty-form navigation guard, and fully legible validation summaries.
- `dog-record-field-integrity`: A dog is identified by its call name and a registered name belongs to a registration with an organization — never fabricated from another field to satisfy a storage constraint. One stored value renders one way across list, record, and wizard, and a field the owner did not touch survives an edit.
- `entry-wizard-guidance`: The registration wizard is navigable and self-explanatory for a novice — single page-flow scroll at narrow widths, class-level eligibility guidance before money is committed, actionable prerequisite warnings, and non-redundant payment copy.
- `exhibitor-surface-legibility`: Explanatory and tabular content on the exhibitor's canonical surfaces outside My Shows (sidebar navigation, My Payments, Find Shows, show-detail schedule) stays readable and complete at every supported width, with accessible names on all interactive elements. Complements `exhibitor-my-shows-legibility`, which remains scoped to the My Shows page.

### Modified Capabilities

- `entry-review-vocabulary`: Extends the canonical review-state vocabulary — currently scoped to secretary-facing surfaces — to exhibitor-facing renderings, so a state that is awaiting review never renders as "Not accepted" to the exhibitor.

## Impact

- **myK9Show UI:** the shared toast/sonner layer and sticky action-bar/footer primitives (highest blast radius — every dialog and wizard), `StandardDialog` validation summary, Add/Edit Dog forms, dog list and detail renderers, the registration wizard steps 1–3, sidebar navigation, My Payments table, Find Shows view toggles, and the show-detail run schedule.
- **Shared logic:** a breed/empty-field display formatter and the exhibitor-facing review-state label mapping are extracted as pure functions, making them directly unit-testable.
- **No database migration and no edge-function change.** No Supabase deploy or shared-system approval gate is required.
- **Offline-first:** untouched. All changes are presentation-layer or client-side validation; no replication-backed read or mutation path is modified.
- **Testing:** unit tests for the extracted formatters and label mapping, component tests for the toast/action-bar collision and the dirty-form guard (regression tests for the Critical finding), an accessible-name check, and a manual multi-viewport re-walk at 390×844, 834×1112, 1112×834, and 1280×800.
