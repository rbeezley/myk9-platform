# Design — exhibitor-ux-remediation

## Context

The exhibitor journey audit (docs/ux-audits/exhibitor-elderly-novice-2026-07-08.md) found that individual exhibitor surfaces are healthy in isolation but disagree with each other: payment state, counts, and dates are computed independently per surface. The fixes are reconciliation work on existing surfaces — entries page, cart, shows list, heritage landing, /at-show gate, dogs list — with no new pages. Constraints: preserve the documented 'paid'-stays-pending entry review bucketing (secretary needs-review semantics), preserve offline-first reads via @myk9/replication and the `account-entry-sync` reconciliation rules, and preserve the exhibitor intent "this respects my time" (docs/INTENT.md).

## Goals / Non-Goals

**Goals**
- One derivation of "amount due" consumed by the entry chip, dashboard stats, and My Payments.
- Cart cannot pay into a closed show; carts are discoverable and self-expiring.
- Every exhibitor-facing counter agrees with the list it summarizes.
- Heritage landing dates render in trial timezone; venue falls back to the show address.
- Show day nav is useful (or at least honest and exhibitor-voiced) for entered exhibitors.
- Check-in dialog has an exhibitor voice with staff-only statuses hidden.

**Non-Goals**
- No new pages, sheets, or nav destinations (the Show day fix reuses existing surfaces/routes).
- No changes to entry *review* status semantics ('paid' entries stay in the pending/needs-review bucket).
- No Stripe/checkout flow changes beyond gating the pay action.
- Excluded audit findings: Developer menu item, audit-pages inventory doc, premium upsell density.

## Decisions

1. **Amount-due as a selector, not a new field.** Extend `services/entryDisplay/entryDisplaySelectors.ts` with a pure `selectAmountDue(entries/payments)` (or equivalent) that all three surfaces consume. The "Payment Due" chip becomes a function of amount-due > 0 for that entry, decoupled from the review-status bucket in `entryStatusUiAdapter.ts`. *Alternative rejected:* per-surface patching — that is how the drift happened.
2. **Pay path = deep link, not new UI.** When amount-due > 0, the entry card renders a "Pay now" action linking into the existing cart/checkout flow (per `entry-payment-golden-path`, no duplicate payment workflow). *Alternative rejected:* inline payment on the card.
3. **Cart gating client + server.** Client: disable the pay button with an explanation when the target show's entries-close (in trial timezone) has passed; auto-remove/flag expired items on cart load. Server: verify `submit_show_entries`/checkout already rejects closed shows; if not, add the guard there too (fail closed). *Alternative rejected:* client-only gating — costly-mistake risk remains via stale tabs.
4. **Counter scope audit, label follows scope.** For each counter (stats pill, My Entries tabs, Entered-as-exhibitor tab, heritage "Entries received", per-dog upcoming), identify the query scope; either fix the query (bugs: entered-tab 0, dog upcoming vs dog page) or fix the label ("13 class entries" vs "9 shows entered"). Counter derivations become pure functions with unit tests pinning scope. Reads stay on replicated tables / documented fallbacks (`account-entry-sync`); the heritage "Entries received" public counter uses the existing public read path (see `project_public_results_release_gate` constraints), not a new direct read.
5. **Heritage dates via `getTrialTimezone`.** All date/close rendering in `features/registries` heritage landing goes through the canonical date module with the trial's IANA timezone — this turns the existing date-formatting spec's landing-page exception into a requirement. Venue: fall back to the show's address record when the heritage venue field is empty.
6. **Show day for exhibitors: reroute, don't rebuild.** In the exhibitor sidebar, "Show day" keeps its route, but `/at-show/:showId`'s no-access state distinguishes audiences: an exhibitor with entries in that show sees exhibitor-voiced guidance and links to their entries' show-day info (check-in on My Shows, run order when public); the passcode CTA remains secondary for actual workers. *Alternative rejected:* granting exhibitors ringside access (RLS/authz scope creep; see at-show gating map).
7. **Check-in dialog: one component, voice prop.** The existing dialog gains an audience variant (exhibitor vs staff): first-person labels, staff-only statuses (Conflict, Pulled) hidden for exhibitors, header shows "Confirmation #" correctly, dangling "#" removed. *Alternative rejected:* a second dialog component (duplication).
8. **Polish batch is mechanical.** Dogs delete → invalidate the dogs query + toast; stats grid wraps at intermediate widths; dog rail gets a scroll affordance; heritage hero max-height on short viewports; /shows none-enterable empty state; single "Breed not set" placeholder; trial chip label de-dup.

## Risks / Trade-offs

- [Amount-due derivation disagrees with Stripe reality] → derive from the same payment rows My Payments already uses (it is currently the most accurate surface); unit-test against seeded contradiction cases from the audit.
- [Chip decoupling accidentally changes secretary views] → per `status-display`, role-specific copy differences are documented; snapshot secretary surfaces before/after and keep the review-status classifier untouched.
- [Cart expiry deletes something a user meant to keep] → expire only when entries-close has passed (the entry could never be submitted anyway); message it in the cart.
- [Timezone fix shifts dates on other registries' pages] → helpers default to `America/New_York`; test AKC + heritage fixtures both.
- [Show-day gate change leaks ringside data] → no authz change; only copy/branching on the existing no-access state.

## Migration Plan

Pure frontend + selector work; ship as one PR (or two: money/counters vs polish batch) behind no flags. No DB migration expected; if the server-side closed-show guard is missing, that is one small migration/RPC guard with its own review. Rollback = revert.

## Open Questions

- Does checkout already reject closed shows server-side? (Verify during implementation; decision 3 covers both outcomes.)
- Should the dashboard stats pill count shows or class entries? (Pick during implementation; label must match either way.)
