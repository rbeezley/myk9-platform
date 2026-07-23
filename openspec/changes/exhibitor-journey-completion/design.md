## Context

The July 23 audit in `docs/ux-audits/exhibitor-elderly-novice-2026-07-23.md` walked the same exhibitor through free, complimentary Premium, and restored-free states at phone, tablet, tablet landscape, and desktop sizes. It found 18 issues, including two invalid-record paths, a date-only timezone defect, nonfunctional Health filters, seven clipped Dog Details tabs, clipped Pedigree and Health layouts, contradictory complimentary-access messaging, fake Subscription usage data, and unresolved entry/payment summary contradictions.

The existing implementation already has the right canonical surfaces:

- `DogDetailsMain` and `DogDetailsTabs` own dog identity, competitions, Title Progress, Statistics, Health Records, Training Journal, and Pedigree.
- `useSubscriptionGate` combines profile tier, `early_adopter_until`, and an optional scored-show trial count, while `SubscriptionManager` independently reads Stripe rows.
- `/admin/users` and `UserEditPanel` own platform user administration.
- `/exhibitor/entries` and `/exhibitor/payments` own exhibitor entry and money summaries.
- Existing hooks own Premium records: `useTitleProgress`, `usePerformanceStatistics`, the Health queries/mutations, Training Journal queries/mutations, and Pedigree queries/mutations.

The secretary redesign lessons apply directly: one concern should have one canonical surface; summaries must be shared agreements instead of local guesses; status must lead to its resolving action; complexity should be progressively disclosed; and validation, dates, and destructive actions must be reliable.

This is primarily an online account/dog-record experience. It does not change ringside or show-day mutation paths. Existing replication-backed entry/show reads remain replication-backed. Profile, Stripe, entitlement-grant, and admin-RPC reads are auth-adjacent online operations and fail closed without erasing cached show-day data.

## Goals / Non-Goals

**Goals:**

- Complete all five shipped Premium capabilities: Title Progress, Statistics, Health Records, Training Journal, and Pedigree.
- Make invalid persistence impossible through the UI and make mutation failures visible and recoverable.
- Replace seven equal Dog Details tabs with a hierarchy that fits and reads clearly at all audited sizes.
- Give every Premium gate and account surface one effective-entitlement result with a visible source and end date.
- Let a platform admin safely grant or revoke complimentary Premium from existing User Management.
- Make My Shows, My Payments, and entry-change actions honor existing shared truth contracts.
- Remove fake or placeholder claims from customer-facing account, pricing, and footer content.
- Preserve the exhibitor intent: "This respects my time."

**Non-Goals:**

- No new Premium dashboard, dog route, payment route, admin grant page, or entry workflow.
- No change to Premium prices, Stripe checkout, refunds, invoices, or club/platform reconciliation.
- No new dog-record feature beyond the five already shipped.
- No redesign of secretary, ringside, or show-day surfaces.
- No direct client write to entitlement state and no fake Stripe customer/subscription/order.

## Decisions

### 1. Consolidate Dog Details into Overview, Career, and Records

`/dogs/:id` remains the sole dog workspace. Replace the seven-item peer tab strip with three top-level concerns:

| Top level | Secondary views | Access |
| --- | --- | --- |
| Overview | Identity, registrations, activity | Free |
| Career | Competitions, Title Progress, Statistics | Competitions free; Title Progress and Statistics Premium |
| Records | Health, Training, Pedigree | Premium |

Top-level state uses stable URL parameters such as `section=career&view=titles`. Existing `tab=registrations|competitions|title-progress|statistics|health|training|pedigree` links map to the corresponding new section/view so bookmarks and upgrade returns remain valid. Activity renders once on Overview rather than below every selected view. The Title Progress sidebar card/teaser is removed or reduced to a deep link when it repeats Career content.

Secondary navigation uses a fitted segmented control on wide content containers and an accessible select or stacked section navigation when the container is narrow. Layout changes respond to the Dog Details content container, not only the browser viewport.

Alternative considered: keep seven tabs and make them horizontally scrollable. Rejected because scrolling hides five locked items for free users, keeps unrelated concerns at equal weight, and repeats the secretary-era mistake of accumulating peer tabs.

Alternative considered: add a Premium hub. Rejected because it duplicates Dog Details and fragments one dog's record.

### 2. Make each Premium feature complete at its existing source

Title Progress continues through `useTitleProgress` and the existing title engine. Statistics continues through `usePerformanceStatistics`. Health, Training, and Pedigree continue through their established query/mutation hooks. The change adds no parallel data store.

Each secondary view owns loading, empty, error/retry, populated, and locked states. Derived title/statistic values must come from saved/scored results and existing manual-result inputs; no demonstration metrics are rendered as user data.

Alternative considered: a shared all-purpose Premium data hook. Rejected because these features have different data and mutation lifecycles; the shared contract belongs at entitlement and presentation boundaries, not in a forced domain abstraction.

### 3. Put validation at the form boundary

Dialog buttons must invoke the form's real submission path using a submit button associated by `form` id or `HTMLFormElement.requestSubmit()`. `dispatchEvent(new Event('submit'))` is removed from the affected record dialogs.

Pedigree and Health forms validate required and conditional fields in TypeScript at the form boundary in addition to native attributes. Mutations run only after validation succeeds. A rejected mutation keeps the form open, preserves user input, focuses or announces the error summary, and offers retry. Dialogs close only after confirmed mutation success.

Shared dialog primitives are changed only if a focused inventory proves the behavior is common and focused regression tests protect existing callers.

Alternative considered: rely only on database constraints. Rejected because that still allows silent dialog closure and gives the exhibitor no useful recovery.

### 4. Treat date-only values as calendar dates

Introduce or reuse one date-only parser/formatter that splits `YYYY-MM-DD` into local calendar parts or formats it without timezone conversion. Health helpers and dialogs must not use `new Date('YYYY-MM-DD')`.

Timestamp values continue using the existing zoned/date-time helpers. Tests run under at least UTC and `America/Chicago` semantics and cover month/year boundaries.

Alternative considered: append a local time before constructing `Date`. Rejected because string parsing remains easy to misuse and obscures the domain distinction between a calendar date and an instant.

### 5. Use container-aware responsive records

Health headers and action groups wrap based on available content width. Filters remain visible and operable in phone, tablet portrait, and tablet landscape layouts.

Pedigree keeps the visual tree only when the container can fit it. Narrow containers render the same ancestors as ordered relationship groups—Parents, then Grandparents—with explicit relationship labels and the same add/view/edit actions. No horizontal clipping or browser-scale workaround is allowed.

Alternative considered: shrink cards and typography until the tree fits. Rejected because it harms the elderly/low-tech persona and still fails in the two-column Dog Details container.

### 6. Use one effective-entitlement value everywhere

Extract a pure resolver and a single React Query-backed hook that return:

```ts
type EntitlementSource = 'paid' | 'founding' | 'complimentary' | 'none';

interface EffectiveEntitlement {
  tier: 'free' | 'premium';
  source: EntitlementSource;
  status: 'active' | 'expired' | 'free';
  endsAt: string | null;
  evaluatedAt: string;
  trustedUntil: string;
  canManageBilling: boolean;
  analyticsTrial: {
    status: 'active' | 'used' | 'unavailable';
    scoredShowCount: number | null;
    showLimit: number;
  };
}
```

Precedence for account Premium is active paid Premium, active founding/complimentary grant, then free. If no account source is active but a paid subscription or grant ended, the resolver returns free with `status: 'expired'` and the most relevant end date. An active grant can therefore keep Premium available after a paid subscription ends without claiming that billing is active.

<!-- [EXPANDED after plan verification] -->
The existing first-three-scored-shows trial remains scoped to Premium Analytics, matching the current product copy and avoiding an unapproved expansion of Premium pricing terms. A server-evaluated, account-scoped entitlement-context RPC returns database evaluation time, a sanitized active/most-recent grant projection, and the distinct scored-show count needed by the existing Analytics trial rule. This removes caller-provided `trialShowCount` while preserving the existing capability boundary: paid/founding/complimentary access unlocks all five dog capabilities, while an Analytics trial unlocks only the currently trialed Analytics content. The account query uses one React Query key and is deduplicated across all consumers.

The resolver uses server `evaluatedAt`, not the device clock, for paid/grant boundaries. Each result has a bounded `trustedUntil`, no later than the active source end or the cache's short maximum-stale interval. The hook schedules invalidation at that boundary and revalidates on focus/reconnect. If refresh fails, the last trusted value may remain visible only until `trustedUntil`; Premium creation/update actions then fail closed even if the page stays open.

`useSubscriptionGate` becomes a compatibility wrapper or is migrated caller-by-caller to the new hook. Dog gates, Analytics, Subscription, Pricing, and account messaging consume the same effective result. They hold a neutral loading state until profile and grant reads settle, preventing a lock/unlock flash.

`SubscriptionManager` still owns Stripe billing details and customer-portal actions, but it receives effective entitlement rather than inferring access from the presence of a Stripe row. Billing controls render only for paid access. Founding and complimentary access display their source, end condition, and the correct next action. The existing Analytics trial is explained as capability-scoped progress, not mislabeled as an account subscription. Hardcoded usage metrics and unavailable invoice links are removed.

Alternative considered: add fake Stripe subscriptions for test users. Rejected because it corrupts billing truth and can accidentally trigger webhook, portal, invoice, or revenue behavior.

### 7. Replace `early_adopter_until` with auditable entitlement grants

Create `subscription_entitlement_grants` as the durable record:

- `id`, `person_id`
- `grant_type` constrained to `founding | complimentary`
- `starts_at`, `ends_at`
- `reason`
- `granted_by_person_id`, `created_at`
- nullable `revoked_at`, `revoked_by_person_id`, `revoke_reason`

The grant table is admin-readable only because its reason, actor, and revocation fields are internal. The current user receives only a sanitized source/status/start/end projection through the security-definer entitlement-context RPC. Direct authenticated select/insert/update/delete on the table is denied to non-admins. A server-authorized RPC grants or revokes access atomically, verifies `is_site_admin()`, requires a reason, validates the date range, locks the target person, closes any prior unrevoked grant, and records actor/target/reason. A partial unique index allows at most one unrevoked grant per person; the RPC serializes concurrent changes.

Existing non-null `people.early_adopter_until` values are backfilled as `founding` grants. During one compatibility release, the effective hook prefers the grant table but can fall back to the legacy column if the table is unavailable. After staging and production verification, a later migration in this change removes the fallback, legacy trigger, and legacy column.

The grant/revoke control is added inside the existing `UserEditPanel` for users with an exhibitor profile. It shows current source/end date and grant history, requires an expiration and reason for grant, requires a reason for revoke, confirms the resulting state, and refetches both admin-user and target entitlement queries only after RPC success.

Alternative considered: keep editing `early_adopter_until`. Rejected because ordinary test gifts appear as founding membership, the field has no reason or actor, revocation history is lost, and Subscription cannot explain the source accurately.

Alternative considered: a new Admin Subscriptions page. Rejected because user-scoped access administration belongs with the selected user.

### 7A. Enforce Premium record and manual-result creation and updates on the server

<!-- [ADDED after plan verification] -->
Add one server-side `has_effective_premium_access(person_id, evaluated_at)` helper that uses paid profile state and the active grant. The Analytics-scoped trial does not authorize dog-record or Premium manual-result creation/updates. Premium record and manual-result create/update policies or their established mutation RPCs call this helper in addition to ownership checks. Client gates remain the presentation layer; they are not the authorization boundary.

The implementation inventory decides the narrowest established enforcement point for Health, Training, Pedigree, and manual results created from the Premium competition UI. If a mutation already uses a security-definer RPC, enforce there. If it writes a table directly, add an RLS `WITH CHECK` condition for inserts/updates without weakening owner isolation. Existing owner reads, exports, and deletes remain available after downgrade so myK9 does not hold personal dog or manually entered competition data hostage; the canonical Records/manual-results views become read-only and explain that account Premium is required to add or edit. Title Progress and Statistics remain derived read features over legitimately visible owner data, with paid presentation gated consistently.

Use the same server helper in the entitlement-context RPC so UI and create/update authorization cannot encode different account-Premium rules. SQL tests cover Health, Training, Pedigree, and manual-result paths for free, paid, founding, complimentary, Analytics trial, expired, revoked, non-owner, read/export/delete, and non-admin cases.

Alternative considered: keep Premium as a client-only lock. Rejected because a direct API call could continue writing paid records after free, expiry, or revocation.

### 8. Reuse entry and payment truth; do not create a new summary

The existing `exhibitor-money-clarity` shared amount-due selector remains authoritative. My Shows and My Payments must receive the same scoped result and explain any past/current scope difference. `unified-financial-dashboard` remains responsible for broader accounting and reconciliation; this change does not consume its operator-only totals as exhibitor debt.

The existing `exhibitor-count-integrity` lifecycle classifiers/selectors remain authoritative. Differences such as orders, dogs, class entries, current entries, and all history must use explicit labels rather than one generic "entries" label.

The active `improve-exhibitor-entries-scan` change continues to own card density and hierarchy. This change only patches shared truth or entry-change wording that remains after that branch lands.

Entry actions describe their real scope:

- `Change entry` opens the existing edit flow when existing classes can be changed.
- A flow that can only add classes says `Add classes`.
- Already-entered classes explain why they are unavailable.
- Post-close or otherwise unsupported changes deep-link to the existing show-team contact path.

Alternative considered: add cross-page reconciliation UI. Rejected because the user needs agreement, not another explanation surface.

### 9. Make destructive actions and controls accessible

Training deletion uses an accessible label and either a confirmation dialog or an immediate undo toast whose completion is tied to mutation success. A failed delete restores/retains the item and announces the error. Training labels use programmatic associations, rich-text controls have accessible names and pressed states, and keyboard/focus order follows the visual order.

The same 44px touch floor and visible focus standards apply to Health, Pedigree, secondary navigation, Payments mobile disclosure, and admin grant controls.

### 10. Restore orientation and remove false promises

Dog-card navigation resets the new detail page to its heading and moves focus to the main heading after route completion, except browser Back/Forward restores the browser's saved position. Secondary deep links focus the selected section without unexpected midpage landing.

Pricing recognizes any active Premium entitlement and replaces purchase CTAs with the correct current-access message; only paid subscribers see billing-management language. Footer phone/address/social/help links are removed unless backed by real destinations. Premium roadmap documentation is reconciled with the five shipped capabilities so active product behavior is not described as parked.

## Risks / Trade-offs

- [Entitlement migration briefly has two representations] → Backfill first, prefer the grant table, log fallback use, compare grant/profile results in staging, and remove the legacy column only after evidence.
- [Grant abuse or self-service escalation] → Deny direct writes, authorize in the RPC, require actor/reason/expiry, use RLS, test non-admin and self-call attempts, and audit every state change.
- [Concurrent grant/revoke requests race] → Lock the target person and enforce one unrevoked grant with a partial unique index.
- [A failed entitlement read could lock a legitimate user] → Keep the last successful React Query value only until its bounded `trustedUntil`, show a non-destructive account error, and fail Premium creation/update closed after that boundary without changing billing/grant data.
- [Dog deep links or bookmarks break] → Map every legacy tab id, test forward/back navigation, and retain one release of compatibility parsing.
- [Consolidation hides a Premium feature] → Show all secondary views inside their owning group, preserve direct links, and include free/Premium discovery tests for all five features.
- [Responsive fixes regress desktop density] → Use content-container breakpoints, snapshot/source guards, and browser evidence at all four audited viewport classes.
- [Form refactor affects unrelated dialogs] → Prefer local form wiring; broaden shared primitives only after caller inventory and regression coverage.
- [Payment/count fixes overlap active changes] → Rebase after their merge, consume shared selectors, and remove duplicate tasks rather than create a second implementation.
- [Schema deployment or rollback leaves access inconsistent] → Use additive migrations first, preserve the legacy source through verification, and make cleanup a separately approved migration.
- [Entitlement context is fetched by many components] → Use one account-scoped React Query key, server aggregation, appropriate person/grant/result indexes, and record `EXPLAIN (ANALYZE, BUFFERS)` evidence against a high-history fixture.
- [A browser remains open across an expiry] → Evaluate against server time, invalidate at the nearest boundary, and revalidate on focus/reconnect before allowing the next Premium creation/update.
- [Grant/RPC failures become invisible operationally] → Persist grant history atomically, emit structured failure logs without PII/reasons, and add a staging query/runbook for recent grants, revocations, denials, and legacy-fallback mismatches.

## Migration Plan

1. Land assertion-first form/date/filter integrity fixes without schema changes.
2. Land Dog Details hierarchy and responsive record layouts with legacy URL compatibility.
3. Add the entitlement-grant table, RLS, indexes, backfill, server entitlement-context/helper functions, Premium mutation enforcement, and grant/revoke RPC. Regenerate database types and verify locally.
4. After explicit shared-system approval, deploy the additive migration to staging and verify founding, complimentary, revoked, expired, paid, trial, and free states.
5. Land the unified effective-entitlement hook, User Management control, Subscription/Pricing integration, and placeholder-content removal.
6. Land cross-surface payment/count/action truth fixes after reconciling the active My Shows and financial changes.
7. Re-walk the full role journey, including accessibility and responsive evidence.
8. After a compatibility release and explicit shared-system approval, remove `early_adopter_until` fallback/trigger/column. If rollback is required after removal, reconstruct the legacy value from the latest unrevoked founding grant before reverting app code.

No migration or deployment runs as part of planning. Database pushes and production cleanup require the repository's shared-system confirmation gate.

## Open Questions

No blocking product decisions remain for implementation. The UI term is `Complimentary Premium`; `Founding member` is reserved for migrated founding grants. The implementation inventory must still confirm whether any external bookmarked Dog Details URLs use legacy tab parameters beyond those found in the app before removing compatibility.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The change crosses authorization, RLS/RPC migrations, subscription access, payments, entry truth, responsive navigation, and multiple Premium mutation paths.
