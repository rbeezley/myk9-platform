# Design

## Context

See proposal.md. `ClubAccessRequestsSection` currently keeps approved club IDs only in React state and links to `/clubs/:id`. `OnboardingInboxPage` already owns admin intake. `useClubAuthorizationControl` calls the site-admin-only `set_club_authorization` RPC from Club Details. Darboshea's unauthorized club was visible to a secretary but not to the site-admin test account through the signed-in club replica, while a direct authorized server read returned the club. The admin queue therefore needs its own narrow server read.

## Goals / Non-Goals

**Goals:** Make the pending step durable and allow a site admin to complete it with honest feedback on the existing admin surface.

**Non-Goals:** Change approval RPC semantics, grant roles, alter club RLS, publish shows, add a route, or refactor the club replica. The admin authorization check is online-only; show-day data remains on established replication paths.

## Decisions

1. Add a named, site-admin-only read of non-deleted clubs with `authorized_at IS NULL`, returning exact IDs and limited review context (name, website, location, creation date). Use the existing `clubs` table under RLS. This includes manually created clubs such as Darboshea, which a request-only join would miss.
2. Render a `PendingClubAuthorizationsSection` in Admin → Onboarding, above the two request lists. This is decision context on the owner surface, not a new page. The existing club detail action remains for in-context administration, but a link alone is insufficient because the approved-request link is transient and an unauthorized club may not resolve in the site-admin's signed-in replica.
3. Use the existing `setClubAuthorization(id, true)` service and its audited RPC, with a club-named confirmation. The action never writes `authorized_at` directly. A successful write refetches the queue; a failed read or write has a visible retry path. A second admin's prior authorization is safe because the RPC is idempotent.
4. Invalidate the pending authorization query after approving an access request, so the newly created club enters the queue without a reload. Remove the one-time approval callout once the durable queue is active, keeping one admin handoff.

## Risks / Trade-offs

- [A club appears in the queue without a formal request] → Include basic club metadata for review and require explicit confirmation; only site admins can call the RPC.
- [A server error could look like an empty queue] → Keep error, loading, and empty states distinct; do not infer authorization from a failed read.
- [The admin query is online-only] → Authorization itself already requires the server; no core show-day path is changed.
- [Club detail still uses the replica] → The queue does not depend on that route. A separate replica investigation can address the site-admin detail visibility without blocking this handoff.

## Migration Plan

Ship the app change through the normal PR and Deploy myK9Show workflow. No schema migration or data backfill is needed. Rollback is an app rollback; existing club authorization records and RPC audit entries remain intact.
