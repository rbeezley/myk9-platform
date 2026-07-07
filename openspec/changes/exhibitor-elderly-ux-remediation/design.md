## Context

The remediation starts from `docs/audits/2026-07-06-exhibitor-elderly-browser-ux-audit.md` and is tracked in `docs/plan-exhibitor-elderly-ux-remediation.md`. The current branch already fixed the first Monogram closed-show CTA contradiction and dog measurement `NaN` display issue. The remaining work spans existing exhibitor surfaces: show landing/detail, registration wizard, My Entries, My Payments, show day, check-in, dog profile, and onboarding.

The role intent is exhibitor: "This respects my time." The design should remove contradictory state and dead ends without creating another dashboard or duplicating canonical workflows. Existing pages continue to own their current concerns; cross-surface fixes should use links, deep-links, shared helpers, and clearer empty states.

Show-day persistent data must continue through established offline-first query/mutation paths. This change must not introduce direct Supabase reads in core show-day flows or bypass existing registration/payment submission paths.

## Goals / Non-Goals

**Goals:**

- Let an elderly, low-tech exhibitor answer these questions without guessing: can I enter, is my dog entered, do I owe money, and what do I do today?
- Gate entry affordances and direct registration URLs with the same business rules used at submission time.
- Explain unavailable edit actions after close instead of making them disappear.
- Make amount due visible where the user expects payment status, while keeping payment history and refunds understandable.
- Default exhibitor show-day navigation to the user's dogs and next actions.
- Convert exhibitor-facing check-in choices to plain language while preserving staff-only operational precision.
- Keep dog profile edits simple and trustworthy.
- Preserve onboarding progress when completion is partial.
- Maintain focused automated coverage plus a browser audit pass.

**Non-Goals:**

- No new exhibitor dashboard, show-day dashboard, payment dashboard, or dog-profile replacement.
- No replacement registration wizard, checkout flow, Stripe integration, payout engine, or refund engine.
- No staff workflow reduction; secretary/gate steward views keep operational statuses where needed.
- No shared-system mutation as part of implementation unless explicitly approved in a separate step.

## Decisions

### Decision: Use shared availability helpers for closed-entry gates

Show landing/detail CTAs and the registration wizard direct-entry guard will share a single typed availability/result helper, or reuse an existing one if present. The helper should return a user-facing unavailable reason and recovery destination, not just a boolean.

Alternative considered: patch each CTA independently. Rejected because landing pages and direct wizard URLs can drift and recreate the contradiction.

### Decision: Replace unavailable primary actions with explanation plus canonical recovery links

Closed entry and post-close edit states will show concise copy and route to the existing show-team/message support surface. The action does not collect entry-change details in place.

Alternative considered: add a late-entry request dialog to each card. Rejected because it duplicates message/support workflow and creates another place for secretaries to monitor.

### Decision: Treat My Payments as the money-status home

My Payments will show unpaid balances before paid history when any amount is due. My Shows can summarize fees, but it should link to My Payments or the cart with relevant context rather than reimplementing payment history.

Alternative considered: expand My Shows into a payment dashboard. Rejected because payment history already belongs on My Payments.

### Decision: Exhibitor show day starts from owned entries, not ringside class administration

For exhibitor roles, show-day links should land on a "Your dogs today" view or tab that lists their entries, class, armband/confirmation, check-in state, and next action. Full class/ringside lists remain available as secondary navigation.

Alternative considered: keep the current class-first surface and tune the empty state. Rejected because an exhibitor's first question is about their own dogs, not the entire running order.

### Decision: Map plain check-in labels to existing statuses at the boundary

Exhibitor check-in controls will display labels such as "I am here", "I am not there yet", and "I have a conflict - tell the secretary" and map those labels to the current internal statuses. Staff views continue to display staff-grade status names.

Alternative considered: rename statuses globally. Rejected because secretary and steward workflows rely on precise operational language.

### Decision: Simplify dog editing in place

Dog detail/editing keeps the existing page and form structure but groups low-friction basics ahead of advanced details, adds format/help text, and removes duplicate add-registration affordances on the same surface.

Alternative considered: build a new "simple dog editor." Rejected because it duplicates the existing dog profile workflow.

### Decision: Onboarding completion must distinguish saved progress from restart

If completion is partial, onboarding should present "Finish setting up" with saved state and explicit missing pieces. A reload should not visually send the user backward without explanation.

Alternative considered: suppress onboarding after any save. Rejected because it could hide required setup.

## Risks / Trade-offs

- [Risk] Entry availability logic may not have one existing source of truth. -> Mitigation: inventory current close-date/submission guards before adding the shared helper and write helper tests first.
- [Risk] Payment due data can diverge between cart, entries, refunds, and history. -> Mitigation: use existing payment/cart data sources and add assertions that My Shows and My Payments show the same due amount for the same entries.
- [Risk] Show-day data may be empty because running order is unpublished, not because the dog is unentered. -> Mitigation: base exhibitor "Your dogs today" on owned entries first, then layer class/running-order data when available.
- [Risk] Plain check-in labels can lose staff audit precision. -> Mitigation: map labels to existing internal statuses and leave staff views unchanged.
- [Risk] Onboarding state may depend on seed data instead of app code. -> Mitigation: trace profile completion from save through redirect/reload before changing behavior.

## Migration Plan

1. Finish closed-entry and post-close edit guidance together, including direct wizard guards and recovery links.
2. Add My Payments amount-due visibility and My Shows links using existing data sources.
3. Reframe exhibitor show-day routing and check-in language while preserving staff views.
4. Polish dog profile editing and onboarding state.
5. Run focused unit/component tests after each slice and an elderly exhibitor browser pass after seed data includes at least one currently open show.
6. Roll back by reverting UI/helpers for the affected slice; no data migrations or shared-system writes are planned.

## Open Questions

- Which existing message/show-team route should be the canonical recovery destination for late entry and post-close change requests if multiple message surfaces exist?
- Does My Payments already expose a reusable cart/balance hook, or should the amount-due section consume the same query used by My Shows?
- Is onboarding replay caused by seed/profile data, or by completion-state persistence after save?
