## Why

The elderly exhibitor browser audit found trust-breaking contradictions in the core exhibitor journey: closed shows looked enterable, existing entries stopped explaining what could be changed, payment due was split from payment history, show-day views implied "No Entries Yet" despite entered dogs, check-in exposed staff jargon, dog-profile blanks displayed as bad data, and onboarding could appear to restart. This supports fall 2026 launch readiness by making the existing exhibitor workflow calm, obvious, and respectful of non-technical users' time.

## What Changes

- Tighten existing show landing/detail and registration-wizard entry gates so closed shows never present a normal "Enter this show" path, including direct wizard URLs.
- Replace post-close edit-entry disappearance with plain-language guidance and a route to the existing show-team/message surface.
- Align My Shows fee summaries, My Payments amount-due visibility, cart/payment handoff, and paid/refund/net-paid history using existing money-path data rather than creating a new payment dashboard.
- Reframe exhibitor show-day routing around "Your dogs today" while keeping ringside/class lists secondary and avoiding empty states that contradict entered dogs.
- Translate exhibitor check-in choices into plain language while preserving existing internal statuses for staff workflows.
- Simplify dog-profile editing and registration guidance without adding a new dog workflow; keep invalid blank measurements from displaying as `NaN` or accidental zero.
- Trace onboarding completion state and replace unexpected restart behavior with saved-progress guidance when more setup is required.
- Track testing and browser-audit evidence in the existing remediation plan.
- Non-goals:
  - No new exhibitor dashboard, payment dashboard, show-day dashboard, dog-profile replacement, or standalone entry workflow.
  - No duplicated payment collection, entry editing, messaging, or show-day operations.
  - No changes to Stripe, payout, refund, or Supabase shared-system behavior unless explicitly added to a later scoped change.

Duplication answer: this change touches multiple surfaces, but it does not duplicate an existing page. The work tightens the existing canonical surfaces and adds links/deep-links when another page owns the concern.

## Capabilities

### New Capabilities

- `exhibitor-journey-trust`: Defines the elderly exhibitor trust contract across closed-entry gates, entry-change guidance, amount-due visibility, exhibitor-first show-day state, plain check-in language, dog-profile clarity, onboarding saved progress, and browser-audit evidence.

### Modified Capabilities

- `entry-payment-integrity`: Amount-due and payment-history displays must stay consistent with existing entry/cart/payment records and avoid contradictory paid/due states.

## Impact

- Affected app surfaces:
  - `apps/myk9show/src/features/monogram/landing/*`
  - show detail / landing variants and registration wizard entry gating
  - `apps/myk9show/src/pages/MyEntriesPage/*`
  - `apps/myk9show/src/pages/MyPaymentsPage*` and related payment/cart hooks
  - exhibitor show-day / at-show routes and check-in controls
  - `apps/myk9show/src/components/dogs/DogDetailsMain/*`
  - onboarding completion hooks/pages
- Affected docs/tracking:
  - `docs/plan-exhibitor-elderly-ux-remediation.md`
  - `docs/audits/2026-07-06-exhibitor-elderly-browser-ux-audit.md`
  - relevant backlog/tracking document after each completed slice
- Testing impact:
  - focused Vitest coverage for gating helpers, status-label mapping, dog measurement parsing/display, onboarding state, and affected components
  - focused Playwright coverage for open-show entry, closed-show recovery, existing entry edits, amount due, and exhibitor show-day state
  - targeted typecheck for touched TypeScript areas
