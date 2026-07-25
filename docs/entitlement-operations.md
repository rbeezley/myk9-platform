# Entitlement Operations

> **Status:** Reference

Operational checks for the Premium entitlement system: complimentary and founding grants, their lifecycle, and how to see what happened without exposing anyone's personal data.

Added for [MYK9-71](https://linear.app/myk9-platform/issue/MYK9-71/complete-the-exhibitor-journey-and-premium-entitlement-experience) task 7.9. Schema lives in `supabase/migrations/20260724120000_subscription_entitlement_grants.sql`; behaviour is pinned by `supabase/tests/subscription_entitlement_grants_test.sql`.

## Where the audit trail actually lives

**The `subscription_entitlement_grants` table is the audit log.** There is no separate event stream, and that is deliberate rather than an omission: the table is append-and-annotate, never delete.

- Revoking sets `revoked_at`, `revoked_by_person_id`, `revoke_reason`. The row stays.
- Superseding sets `superseded_at` and `superseded_by_grant_id`. The row stays.
- Natural expiry writes nothing at all — status is derived by comparing `ends_at` to server time, so an expired grant is simply a past row.

That last point matters when reading these queries: **expiry is not an event.** Nothing fires when a grant lapses, so "when did this user lose Premium?" is answered by `ends_at`, not by a timestamp of something happening.

A consequence worth remembering: revocation and supersession are different things. A superseded grant was replaced by a newer one and the user likely never lost access; a revoked grant was taken away. Do not collapse them in a report.

## Operational checks

All queries are read-only. Run them against the linked project (`sojmvhhwsjxmfistvzbe`); the database password lives in `supabase/.env` as `SUPABASE_DB_PASSWORD`. Each query was verified against staging on 2026-07-25.

### Who currently has granted Premium

```sql
SELECT grant_type, count(*) AS active
FROM public.subscription_entitlement_grants
WHERE revoked_at IS NULL AND superseded_at IS NULL
  AND starts_at <= now() AND ends_at > now()
GROUP BY grant_type ORDER BY grant_type;
```

Counts only. A sudden jump in `complimentary` without a corresponding support ticket is the signal worth chasing.

### Lifecycle events in the last 7 days

```sql
SELECT
  count(*) FILTER (WHERE created_at    > now() - interval '7 days') AS granted,
  count(*) FILTER (WHERE revoked_at    > now() - interval '7 days') AS revoked,
  count(*) FILTER (WHERE superseded_at > now() - interval '7 days') AS superseded
FROM public.subscription_entitlement_grants;
```

### Grants lapsing soon

```sql
SELECT count(*) AS expiring_soon
FROM public.subscription_entitlement_grants
WHERE revoked_at IS NULL AND superseded_at IS NULL
  AND ends_at > now() AND ends_at <= now() + interval '30 days';
```

Because expiry is silent, this is the only advance warning that a batch of users is about to lose access. Worth checking before any period where a support surprise would be costly.

### Legacy fallback parity

```sql
SELECT
  (SELECT count(*) FROM public.people
    WHERE early_adopter_until IS NOT NULL) AS legacy_rows,
  (SELECT count(*) FROM public.subscription_entitlement_grants
    WHERE grant_type = 'founding') AS founding_grants;
```

These two must stay equal until the legacy column is removed. The backfill (migration task 4.4) created exactly one founding grant per non-null `early_adopter_until`, and `useSubscriptionGate` still falls back to the legacy column. **A mismatch means the two sources of truth have diverged** — resolve it before anyone relies on either. Section 8 of the OpenSpec change removes the legacy column, and this query is its precondition.

## PII posture

| Surface                                | Exposes                                          | Gate                      |
| -------------------------------------- | ------------------------------------------------ | ------------------------- |
| `get_own_entitlement_context()`        | type, status, start, end, scored-show count      | Caller's own row only     |
| `subscription_entitlement_grants` rows | + reason, granting/revoking actor, revoke reason | RLS: site admin only      |
| Admin grant history UI                 | as above                                         | `admin:manage` permission |

The own-context RPC is **sanitized by construction** — `reason`, `granted_by_person_id`, `revoked_by_person_id` and `revoke_reason` are not among its returned columns, so an exhibitor cannot read who granted them access or what was written about them. This is asserted directly by the SQL suite ("sanitized own-context returns type/status/start/end (no reason/actor columns exist)").

Note both RPCs are caller-scoped. Querying `has_effective_premium_access()` or `get_own_entitlement_context()` as the `postgres` superuser returns nulls or false, because the superuser is neither the subject nor a site admin. That is correct behaviour and not a bug — impersonate the intended caller when verifying:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','<auth_user_id>','role','authenticated')::text, true);
SELECT public.has_effective_premium_access('<person_id>'::uuid, now());
ROLLBACK;
```

## Known gap: denials are not recorded

**There is no application-level structured logging for entitlement events.** A grep of `features/entitlement` and `services/database/entitlement` finds no `logger`, no `auditService`, and no Sentry capture.

For grants, revocations and supersessions this does not lose information — the table records them with actor and reason. But two things leave no trace anywhere:

- **Denials.** When a non-admin's grant RPC is rejected, or a free user's Premium write is refused by RLS, nothing is written. The rejection is correct and proven by the SQL suite, but it is invisible afterward, so "is someone probing this?" cannot be answered from data.
- **Fallback mismatches.** `useSubscriptionGate` silently prefers the trusted server result over the legacy `early_adopter_until` value. If the two disagree, no signal is emitted.

Neither blocks the entitlement system's correctness, and neither is fixed here — recorded so the absence is a known state rather than an assumption that logs exist somewhere. Add structured logging before treating "no denial activity" as evidence of anything.
