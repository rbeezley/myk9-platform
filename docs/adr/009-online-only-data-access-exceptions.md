# ADR-009: Online-Only Data Access Exceptions

## Status

Accepted

## Date

2026-06-15

## Context

ADR-004 establishes offline-first data access for myK9Show. Core show-day data
must keep working from the local replicated store when venue connectivity is
weak. The remaining direct Supabase reads are not all equal: some are real drift
from the offline-first architecture, while others are intentionally online-only
because the data is auth-adjacent, payment-adjacent, administrative, or
unreplicated by design.

Without an exception boundary, architecture reviews keep rediscovering the same
question and callers can accidentally move core show-day reads back into
components or hooks.

## Decision

Core persistent show-day reads must go through `apps/myk9show/src/services/database/*`
modules that read from replication first and use PostgREST only as a private
fallback. Hooks, pages, routes, and components must not assemble those direct
Supabase reads themselves.

Direct Supabase reads are acceptable only for explicit online-only categories:

- Auth, session, RBAC, and current-user role/profile checks.
- Payments, checkout, billing, Stripe Connect, promo-code redemption, and other
  money paths that require current server state.
- Administrative/configuration surfaces that are not part of venue show-day
  execution.
- Reporting/export flows that require unreplicated owner, registration, address,
  or organization-specific submission details.
- Public unauthenticated browse/search reads where the replication store is not
  available before auth.
- Private PostgREST fallbacks inside database modules, used only after the
  replication path fails or lacks the requested row.

The public TV display read path is an online-only exception. It is venue-facing
show-day display data, but `/tv/:showId` is a public unauthenticated route and
does not enter the authenticated `/at-show/:showId` sync scope that warms
show/trial/class/entry/dog replicated stores. Its direct PostgREST reads must
stay contained in `services/database/tv-display`; hooks and render components
must not assemble those queries themselves.

## Consequences

### Positive

- Secretary/ringside workflows keep the offline-first model: local data first,
  server fallback second.
- Public TV display reads keep working before auth because they do not depend on
  cold replicated stores.
- Direct Supabase usage remains allowed where it is genuinely online-only, so
  architecture cleanup does not become a blind rewrite.
- Future drift audits can classify findings by category instead of relitigating
  the boundary each time.

### Negative

- Some database modules now contain workflow-level composition, not only one
  entity. This is acceptable for show-day read models but should stay narrowly
  named.
- Online-only module queries still need focused tests so their shape does not
  silently drift from the TV display view model.

### Neutral

- This ADR does not change mutation rules. Mutations continue to follow the
  established mutation manager / replication workflow for their domain, with
  RPCs and server-only operations documented where they are intentionally
  online-only.
