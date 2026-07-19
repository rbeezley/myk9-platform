## Context

The platform currently has three financial entry points with different purposes:

- The show-scoped Financial Report is a printable closeout report and intentionally
  excludes lifecycle statuses such as withdrawn and scratched.
- `/club-admin/payments` owns Stripe onboarding and payout history, but not a complete
  club accounting view.
- `/admin/payouts` shows platform payout liabilities, but not gross versus net platform
  fee income or a unified reconciliation feed.

The existing code already contains the fee-book totals projection, payout calculation,
payout settlement badge resolver, Stripe order records, and operator alerts. The
design joins those existing sources rather than replacing them. The financial surface
is an accounting and oversight workflow, not a show-day workflow; ringside data and
mutations continue through the established replication-backed paths.

The design must preserve the role intent in `docs/INTENT.md`: site admins need calm
oversight, secretaries need an easy closeout, and club treasurers need an authoritative
record they can explain. Exhibitors keep the existing payment surface and are not
given a second dashboard in this change.

## Goals / Non-Goals

**Goals:**

- Make one source-grounded financial model available at platform, club, and show
  scopes, with role-derived authorization.
- Preserve historical money facts, including the fee rate and Stripe processing fee
  that applied to each online charge.
- Include every financially active entry in accounting totals while keeping printable
  show closeout semantics unchanged.
- Separate charge verification from club payout settlement, and surface mismatches as
  actionable attention items.
- Let a club reconcile a show-level net transfer to Stripe using a copyable transfer id.
- Roll out through existing `/club-admin/payments` and `/admin/payouts` before
  consolidating to `/financial`.

**Non-Goals:**

- Rebuilding `/exhibitor/payments` or creating a separate exhibitor financial dashboard.
- Matching a Stripe transfer to the club's bank statement inside myK9; link out to
  Stripe for that final hop.
- Collapsing the deliberately separate fee-calculation implementations that are
  protected by colocated tests.
- Adding financial actions to `/at-show` or making show-day operations depend on an
  online Stripe reconciliation request.

## Decisions

### 1. Use a layered financial model

The entry accounting projection is the primary record of club revenue: entry fees,
discounts, waived amounts, refunds, and outstanding amounts. Stripe order snapshots
prove online charge details, while `show_payouts` proves money transferred toward a
club. These are displayed together but never conflated.

**Alternatives considered:**

- Stripe as the sole source: rejected because checks, cash, waived entries, and the
  platform's club accounting are not represented there.
- The printable Financial Report as the sole source: rejected because its lifecycle
  filters omit financially active withdrawn/scratched records.

### 2. Snapshot historical Stripe facts at charge time

Extend the order data contract with immutable cent-based values for entry subtotal,
platform fee, applied fee rate, Stripe processing fee, and refunded cents. The webhook
captures processing fees from the charge balance transaction when available; a missing
processing-fee value remains explicitly pending rather than being treated as zero.
Refund handling updates only the refunded amount, never the original charge facts.

This prevents a later platform-fee setting change from rewriting historical income and
keeps gross platform fees distinct from net income.

**Alternatives considered:**

- Recompute historical fees from today's setting: rejected because it changes history.
- Estimate Stripe processing fees by percentage: rejected because reconciliation
  requires the actual balance-transaction fee.

### 3. Expose a scoped, PII-free server projection

Provide a `SECURITY DEFINER` RPC or security-barrier projection that authorizes
platform, club, and show scope on the server and returns only reconciliation fields.
Totals are aggregated in SQL for unbounded platform and club datasets; row-level lists
paginate to completion. The client never reads `stripe_orders` directly to bypass its
existing RLS contract.

**Alternatives considered:**

- UI-only scope filtering: rejected because hidden rows are not authorization.
- Client-side loading of all rows: rejected because PostgREST's row cap can silently
  understate totals.

### 4. Keep charge and settlement states independent

Charge verification uses `Verified`, `Attested`, or `Mismatch`. Settlement reuses the
existing `resolvePayoutBadge` vocabulary and recognizes `completed` as the successful
transfer state. A pending or self-healing payout is not mislabeled as a financial
failure; genuine failures and unresolved mismatches become attention items.

### 5. Enrich before consolidating

Phase 0 establishes the data contract. Phase 1 adds the accounting projection and
shared service with parity tests. Phase 2 enriches `/club-admin/payments`; Phase 3
enriches `/admin/payouts`; Phase 4 introduces `/financial` and redirects legacy
financial entry points. The existing show Financial Report remains the printable
closeout surface throughout.

This sequencing reduces launch risk and answers the duplication question directly:
existing surfaces are reused where their concern already lives, and the final new
route exists only to remove overlapping entry points.

### 6. Treat the dashboard as online oversight, not ringside infrastructure

The Stripe proof layer is online-only and may show an explicit unavailable/stale state
when disconnected. Show-day scoring, check-in, and other persistent show operations
must continue using `@myk9/replication` and existing mutation flows. No financial
dashboard request is allowed to block or alter ringside workflows.

### 7. Derive the refund ledger only from terminal Stripe facts

The order refund ledger records a refund as money returned only when Stripe reports
`succeeded`. `pending` and `requires_action` remain unbooked until a later
`refund.updated`; `failed` and `canceled` are terminal audit states that contribute
nothing to derived refund totals. Both `charge.refunded` reconciliation and
`refund.updated` use the same status decision, and refund-list expansion drains every
page rather than assuming the first 100 rows are complete.

Order timestamps follow order status, not refund arithmetic alone. A fully refunded
local order that is still `pending` or `processing` retains that status and does not
receive `refunded_at`; its recorded refund facts remain visible in reconciliation so
gross, fee, and refund amounts net together instead of disappearing from the report.
The unique `stripe_orders.stripe_payment_intent_id` constraint is the attribution
contract, so refund RPCs select the single matching order without an unreachable
multi-order tie-break.

**Alternatives considered:**

- Book in-flight refunds optimistically: rejected because a later cancellation can
  otherwise leave a permanent phantom refund.
- Keep source-text pins as the primary regression proof: rejected for money behavior;
  executable Postgres assertions and behavior tests are the authority.

## Risks / Trade-offs

- **[Historical orders lack snapshots]** → Mark them rate-unverifiable or net-pending;
  never backfill by silently applying today's fee rate.
- **[Webhook balance-transaction fetch is delayed or fails]** → Persist the charge
  facts that are known, log the missing processing fee, and display net income as
  pending until the fee is captured.
- **[RPC authorization drift]** → Add authorization tests for platform, club, show,
  and unauthorized callers; return no customer PII.
- **[Large club/platform datasets]** → Aggregate totals server-side and require
  complete pagination for detail rows; add indexes based on query plans.
- **[Users confuse gross fees with club net or platform net income]** → Label the
  three figures separately, show the formula/source, and preserve the existing calm
  role-specific language.
- **[Canonical-route migration breaks saved links]** → Keep explicit redirects and
  route tests for legacy paths and onboarding return URLs before deleting overlap.
- **[Refund lifecycle events arrive out of order]** → Keep one audit row per refund,
  make terminal failure/cancellation authoritative, and replay status permutations in
  executable SQL tests.
- **[Refund list exceeds one Stripe page]** → Follow `has_more`/`starting_after` to
  completion and behavior-test the page boundary and empty-page failure guard.

## Migration Plan

1. Add and test immutable order snapshot fields and refund cents; deploy the migration
   before deploying webhook writes.
2. Add the scoped RPC/projection, explicit grants, aggregation, and authorization
   tests. Validate referenced schema rows and columns before any shared database push.
3. Add the accounting projection and `getFinancialSummary(scope, scopeId)`; prove
   show-level parity against the current Financial Report before changing its source.
4. Enrich the existing club Payments page and site-admin Payouts page with focused
   component and regression coverage.
5. **Go/no-go checkpoint before `/financial`.** Phase 5 (canonical route + redirects)
   is not assumed scope. After Phases 0–4 ship, evaluate with the operator whether the
   enriched `/club-admin/payments` and `/admin/payouts` surfaces already answer the
   money questions. Proceed to `/financial` only if a concrete overlap or navigation
   problem remains; otherwise close this change at the enriched surfaces and record
   the decision in MYK9-54.
6. If rollout must be halted, keep the snapshot columns and RPC backward-compatible,
   stop at the last enriched surface, and leave legacy routes active. Do not remove
   existing reports or payout paths until redirect tests and operator evidence pass.

## Resolved Questions

- **Snapshot location:** columns directly on `stripe_orders`. The webhook writes one
  order row per charge (migration 005 schema; `stripe_payment_intent_id` is UNIQUE),
  so charge and snapshot cardinality are 1:1 and a linked table adds a join without
  adding information. Revisit only if a future contract needs multiple snapshots per
  order.
- **Authorization predicates:** platform scope uses `is_site_admin()`, club scope uses
  `is_club_admin(check_club_id)` (both redefined last in migration 156,
  `SECURITY DEFINER`, `search_path = ''`), and show scope uses
  `can_manage_show(check_show_id)` (migration 038). "Treasurer" is a club-membership
  office label (`club-membership-types.ts`), not an RBAC role in `user_roles`, so
  treasurer access is club-admin access — no permission broadening is needed or
  permitted by this change.
- **Historical backfill:** none. The platform is pre-launch with no real users; orders
  that predate the snapshot contract are marked rate-unverifiable / net-pending and
  are never backfilled from the current `platform_fee_percent` setting.
