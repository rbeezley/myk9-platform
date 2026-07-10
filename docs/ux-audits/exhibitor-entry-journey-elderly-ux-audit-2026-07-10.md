# UX Audit: Exhibitor Entry Journey — Elderly Novice

**Date:** 2026-07-10  
**Scope:** Find Shows → show detail → registration classes → payment review; existing cart only  
**Persona:** Older exhibitor with limited computer experience, reduced visual acuity, and touch-first use  
**Sources:** authenticated staging walk as the canonical exhibitor at 390×844 and 1440×900; `docs/INTENT.md`; registration/cart source; maintained exhibitor self-registration E2E coverage

## Verdict

**Overall UX health: Needs targeted repair.** The entry wizard itself is calm, readable, and prevents an accidental payment submission. The most serious problem is earlier: the same show simultaneously tells the exhibitor that they have submitted entries and that they have no entries. That contradiction makes the rest of the workflow hard to trust.

The audit reopened the seeded Heartland Scent Work Classic by moving its **test-only** entry-close date from July 1 to July 31, 2026. Its August 1–3 show dates were already suitable. No cart item, entry, payment choice, agreement, or payment was changed during this review.

## Pass 1: Mental Model Alignment

| UI element | A novice expects | Observed behavior | Severity |
|---|---|---|---|
| Browse Shows card | A clear answer to “am I entered?” | Says **Entry Submitted** | High |
| Same show’s My Entries tab | The same answer and a list of entries | Says **My Entries 0** and “You haven't entered any classes” | High |
| Same show’s Classes tab / wizard | Entry state consistent with the prior two places | Shows “My entry” classes and dogs already entered; the existing cart is reconciled into the wizard | High |
| Registration wizard | A short, guided way to enter | Correctly communicates a three-step sequence: Classes, Payment, Receipt | Good |

The intended mental model is simple: find a show, choose a dog/class, review, pay. The contradictory entry status forces the user to decide which screen is telling the truth before they can confidently proceed.

## Pass 2: Information Architecture

The journey uses existing surfaces rather than duplicate workflows: Browse Shows, Show Detail, the registration wizard, and Cart. That is the right architecture.

The main structural issue is competing entry summaries. Browse Shows labels the show “Entry Submitted”; Show Detail leads with an empty-state tab; the Classes tab and wizard reveal existing entered/cart state. A novice must hunt across tabs to establish whether anything is actually entered.

The wizard header repeats breadcrumb, show name, stepper, step label, Save Draft, and Load Draft before the class task. It remains legible, but this tall orientation stack means the phone screen reaches the first dog/class card only after substantial scrolling.

## Pass 3: Affordance Clarity

| Element | Assessment |
|---|---|
| “Add or Change Entries” | Clear, specific, and safer than a vague “Enter” label. |
| Three-step progress | Clear on phone and desktop; current step is obvious. |
| Dog tabs and entered/cart badges | Helpful evidence, but six tabs require horizontal scrolling on phone. |
| Class cards and checkboxes | Clear selection and disabled “Already entered” state. |
| Payment card | Clearly identifies credit/debit checkout and explains when the entry is confirmed. |
| Payment remove icon | Icon-only and 32×32px in source; too small for the project’s 44px touch target. |
| Cart “Continue Shopping” | Clear wording, but the default button is 40px high rather than 44px. |

## Pass 4: Cognitive Load

The wizard asks for one meaningful decision at a time, which is excellent. The class screen provides dog-specific status (“Already entered” or “in cart”) and a visible Cart Total. The payment screen makes its irreversible action unavailable until the agreement is checked.

Two areas add unnecessary load:

- The registration summary and payment summary repeat the chosen payment method and the secure-checkout explanation. One compact, clearly titled review summary would reduce scanning.
- The phone class screen opens with six dog tabs before the current task. For repeat exhibitors this is useful; for a novice, keep the selected dog prominent and make the remaining-dog strip easier to discover without relying on a thin horizontal-scroll cue.

## Pass 5: State Coverage

| State | Quality | Evidence |
|---|---|---|
| Entries closed | Good recovery | The closed state plainly explains that normal online entry is unavailable and offers show-team contact. |
| Entries open | Functionally good | Existing cart state reconciles into class selection; Next leads to payment review without creating new data. |
| Existing entry / no entry | Broken | Browse card, My Entries tab, Classes tab, and wizard disagree. |
| Payment not ready | Good | Submit & pay remains disabled and explains that agreement review is needed. |
| Error/diagnostics | Good for this walk | No console warnings or errors on the open show, class selection, or payment review. |

## Pass 6: Flow Integrity

| Step | Result | Friction |
|---|---|---|
| Find the Heartland show | Completed | None once its test entry window was reopened. |
| Decide whether already entered | Contradictory | Browse says submitted; My Entries says zero; classes/wizard show entered state. |
| Open registration | Completed | “Add or Change Entries” is clear. |
| Review classes | Completed without mutation | Readable cards and entered/cart badges; many dog tabs create phone scanning overhead. |
| Move to payment | Completed without mutation | Existing cart item carried through. |
| Understand payment / avoid accidental charge | Completed | Clear total, agreement gate, disabled submit button. |

**Flow verdict: completable, but not trustworthy at the show-detail decision point.** An older exhibitor may abandon the self-service flow or contact the secretary because the app first appears to deny that their existing entries exist.

## Prioritized Summary

### High priority

1. **Make entry status consistent across Browse Shows, Show Detail, Classes, and registration.** Resolve the `Entry Submitted` versus `My Entries 0`/empty-state contradiction before refining visual polish. This is a trust issue, not merely a label issue.
2. **Show the appropriate existing state on the My Entries tab.** If cart lines are intentionally not submitted entries, say so explicitly and keep them distinct; otherwise include them in the derived count/list. Do not add another entry dashboard.

### Medium priority

1. Raise the registration payment remove control from 32×32px and Cart “Continue Shopping” from 40px to the project’s 44×44px touch floor.
2. Simplify the phone payment review by removing duplicated method/secure-checkout explanation while retaining total, confirmation timing, agreement, and back action.
3. Strengthen the dog-strip continuation cue or present the current dog as a focused task with an explicit “Other dogs” control.

### What is already working

- The closed-entry state is clear, calm, and gives a useful recovery path.
- The three-step wizard makes progress and the final action understandable.
- Existing class state is preserved and visible instead of silently overwritten.
- The payment action is safely gated; no accidental checkout occurred in this audit.

## Duplication Check

No new page, dialog, or alternate entry flow is justified. The fixes belong in the existing show-detail derived-entry state and the existing registration/cart controls. That tightens the exhibitor’s one workflow rather than adding another surface.

## Verification Notes

- Staging route: `/shows/dededede-0000-0000-0000-000000000010/register`
- Phone: 390×844; desktop: 1440×900
- Browser diagnostics: no warning or error logs during the reopened flow
- Existing maintained automated coverage: `apps/myk9show/src/test/e2e/registration/exhibitorSelfRegistration.spec.ts`; it exercises the exhibitor flow without shared entry/cart writes by intercepting those requests
