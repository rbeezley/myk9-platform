## Context

See `proposal.md` for motivation. `SupportInboxPage` currently derives filtered tickets and counts from `tickets.data ?? []`, renders `tickets.error` independently, and then renders loading/empty/data branches independently. This lets query failure masquerade as an empty queue. The existing `useSupportTickets` hook already returns TanStack Query state and `refetch`.

The Support Inbox is an online-only site-admin operations surface, not core show-day replicated data. This change does not affect offline-first storage, replication, API requests, RBAC, or ticket persistence.

## Goals / Non-Goals

**Goals:**

- Derive one page-level query state and give error precedence over cached or defaulted data.
- Keep counts truthful by rendering an unavailable marker until a successful query result exists.
- Reuse the query result's `refetch` for an accessible, bounded recovery action.
- Preserve the Site Admin intent that platform health is knowable, using calm and actionable copy.

**Non-Goals:**

- No new surface, query hook, data source, or error abstraction.
- No changes to filters, diagnostics, replies, status mutations, or support-ticket authorization.
- No offline/replication work because this admin oversight query is intentionally online-only.

## Decisions

### Decision: Render the query result as an exclusive page state

`SupportInboxPage` will branch on the ticket query before rendering queue contents: initial loading, then error, then successful empty/data. Error takes precedence so stale or default-empty arrays cannot create success claims. Alternatives considered were hiding only the empty message or changing `filterTickets`; both leave counts or the detail pane capable of implying success.

### Decision: Represent unknown counts with an em dash

Filter labels remain visible and usable, but their counts become `—` whenever the ticket result is not successful. This keeps the established filter control and clearly distinguishes unknown from numeric zero. Disabling or removing filters would add unnecessary state-dependent navigation changes.

### Decision: Retry the existing query

A normal shadcn `Button` with `type="button"` calls `tickets.refetch()`. Native button semantics provide keyboard activation; the action is disabled while a retry is fetching to prevent request stacking. No additional page, dialog, or alternate query path is introduced.

### Decision: Normalize error text at the presentation boundary

The page uses a non-blank `Error.message` when available and otherwise displays calm fallback copy explaining that ticket availability cannot currently be confirmed. The query and transport layers remain unchanged because the defect is how this surface presents failures.

## Risks / Trade-offs

- [A refetch error may coexist with cached data] → Error state wins and suppresses all ticket-derived success UI until recovery.
- [Repeated Retry activation could stack requests] → Disable Retry while the query is fetching.
- [The em dash could be mistaken for a formatting omission] → Pair it with a destructive alert that explicitly says the queue could not be loaded.
- [Component-only verification cannot prove the deployed request lifecycle] → Keep the issue open until post-merge controlled-500 browser replay passes at both required viewports.

## Migration Plan

Ship as a revertible UI-only commit. Rollback is a normal commit revert; there is no data migration or shared-system configuration. After merge and staging deployment, replay a controlled HTTP 500 followed by success at 1440×900 and 768×1024 before closing MYK9-225.
