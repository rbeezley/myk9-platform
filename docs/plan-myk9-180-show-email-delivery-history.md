# MYK9-180 — Show email delivery history

## Goal

Let a show secretary answer “Did we send that?” from the existing show-filtered
Communication History surface. The history must distinguish provider acceptance
from webhook-confirmed delivery and expose failures without creating another
communications page.

Linear: [MYK9-180](https://linear.app/myk9-platform/issue/MYK9-180/show-email-delivery-history-in-communication-history)

This plan completes the History and Authorization requirements in
[`docs/superpowers/specs/2026-07-08-show-email-sequence-design.md`](superpowers/specs/2026-07-08-show-email-sequence-design.md).

## Problem

The current experience is fragmented:

- Entry Management shows only the latest registration-confirmation status per
  enrollment.
- Communication History shows aggregate lifecycle job counts, where `sent`
  means the send was dispatched rather than webhook-confirmed delivery.
- `email_log.related_id` points to an enrollment for registration confirmations
  but to a lifecycle job for lifecycle emails. The current `email_log` RLS policy
  recognizes only enrollment-linked rows, so it cannot safely power a unified
  secretary history.
- There is no chronological show-level audit trail of recipient, email type,
  attempt time, and final delivery state.

The result is avoidable uncertainty when an exhibitor says an email did not
arrive. This conflicts with the secretary intent, “That was easy.”

## Duplication decision

This work does not justify a new page. Add delivery history to the existing
`/secretary/messages?showId=<id>` Communication History surface, below the
existing Scheduled emails controls. Entry Management remains the owner of
registration fixes, and Scheduled emails remains the owner of lifecycle review
and retry actions.

## User story

As a show secretary, I want one delivery history for the selected show so that I
can quickly confirm what was sent, to whom, when, and whether it was delivered
or needs attention.

## V1 scope

- Show one row per delivery attempt, newest first. Retries remain separate rows
  so the audit trail is not overwritten.
- Include registration confirmations and lifecycle emails.
- Include lifecycle attempts that failed before a provider message ID was
  created; label these as failed attempts, not sent emails.
- Show recipient name when safely resolvable, recipient email, email type,
  attempted/sent time, final status, and a plain-language failure summary.
- Use `email_log.status` as delivery truth whenever an email-log row exists.
- Treat `sent` as “Sent — awaiting delivery confirmation.” Only `delivered`
  means delivered.
- Map `bounced`, `failed`, and `complained` to calm “Needs attention” states.
- Link recovery to the existing owner surface:
  - registration confirmation → `/shows/<showId>/entry-management`
  - lifecycle email → the existing `#scheduled-emails` section
- Paginate or cap the first query so Communication History remains responsive.

## Data contract

Add a read-only, authenticated, show-scoped RPC such as
`get_show_email_delivery_history(p_show_id, p_limit, p_before)`.

The RPC should return only presentation-safe fields:

- stable attempt/log identifier
- show ID
- source kind: registration confirmation or lifecycle email
- lifecycle step type when applicable
- enrollment/job reference needed for recovery routing
- recipient name and email
- attempted/created timestamp
- status-updated timestamp
- normalized delivery status
- sanitized failure summary

The query should combine:

1. `email_log` rows whose `related_id` joins through an enrollment to the
   requested show.
2. lifecycle attempts/jobs whose job joins directly to the requested show,
   using the linked `email_log` row when present.

Avoid widening direct client access to all `email_log` rows. The RPC must check
the caller can manage the requested show or is a site admin, use an explicit
`search_path`, and expose no cross-show rows. Orphaned or ambiguously related
records must be omitted rather than guessed into a show.

## UX contract

- Render a compact **Delivery history** section in Communication History only
  when a show is selected.
- Keep Scheduled emails as the first operational control; history is supporting
  evidence, not a competing workflow.
- Use readable text labels with status icons; do not rely on color or hover.
- Default to the newest attempts and provide a simple “Show more” action when
  more records exist.
- Empty: “No show emails have been sent yet.”
- Error: “Email delivery history isn’t available right now. Try again.” Existing
  message threads and scheduled-email controls must remain usable.
- Missing legacy details should display “Details unavailable” without exposing
  raw IDs or provider payloads.

## Implementation phases

### Phase 1 — Secure read model

- Add the show-scoped RPC and required indexes only if query evidence shows an
  existing index is insufficient.
- Normalize statuses and timestamps in a typed app read model.
- Keep raw provider errors server-side; return a sanitized summary.
- Regenerate or update Supabase TypeScript types according to the repository’s
  established generated-types workflow.

### Phase 2 — Existing-surface UI

- Add a query hook and Delivery history component under the existing Scheduled
  emails section in `SecretaryMessagesPage`.
- Preserve the current show filter as the single source of scope.
- Add status labels, empty/loading/error states, pagination, and recovery links.
- Reuse the existing status icon grammar where it fits; do not create a second
  conflicting set of delivery meanings.

### Phase 3 — Verification and rollout

- Verify registration confirmations and lifecycle emails both appear.
- Verify a webhook status transition from `sent` to `delivered` updates the UI.
- Verify failures route to the existing recovery surface.
- Apply the migration only after explicit shared-system approval.
- After deployment, send controlled test emails and capture browser evidence
  from a secretary account.

## Testing phase

### Database and authorization

- Same-show secretary can read registration and lifecycle attempts.
- Site admin can read a requested show.
- Secretary for Show A cannot read Show B, including direct RPC invocation.
- An authenticated non-manager cannot read the history.
- Orphaned and malformed references do not leak recipient data.
- Pagination is stable when attempts share a timestamp.

### Read model

- Mixed email types are ordered newest first.
- `delivered` is distinct from `sent`/awaiting confirmation.
- Bounced, failed, and complained statuses normalize correctly.
- Lifecycle pre-provider failures appear without pretending an email was sent.
- Missing legacy data produces safe fallback copy.

### Components

- Delivered, awaiting delivery, needs-attention, and legacy rows render with
  text labels and accessible icons.
- Empty, loading, error, and show-more states render correctly.
- Recovery links point to Entry Management or Scheduled emails as appropriate.
- Changing the show filter changes the query key and visible rows.
- A history-query failure does not hide existing messages or scheduling tools.

### Required checks

- Run focused migration/source-contract tests.
- Run focused Vitest files for the read model, hook, and component.
- Run the myK9Show TypeScript check.
- Run relevant lint/build checks if the migration or generated types affect
  broader packages.
- Browser-walk the secretary flow at desktop and tablet widths.

## Acceptance criteria

- A secretary can see show-scoped email attempts newest first in Communication
  History.
- Every row shows type, recipient, time, and truthful delivery status.
- Registration confirmations and lifecycle emails share one history.
- Cross-show access is denied at the database boundary.
- Failures lead to an existing recovery surface instead of duplicating actions.
- Existing Entry Management status indicators, Scheduled emails controls, and
  message history continue to work.
- Automated tests and secretary browser evidence are recorded on MYK9-180.

## Non-goals

- No new communications page or campaign tool.
- No changes to composition, scheduling, or send behavior.
- No automatic retry.
- No global admin email-log viewer.
- No speculative backfill of records that cannot be safely associated with a
  show.
- No requirement for email delivery while offline; core show operations must
  remain unaffected when connectivity is unavailable.

## Risks

- Joining polymorphic `email_log.related_id` values incorrectly could leak
  cross-show recipient data. The RPC and authorization tests are release gates.
- Treating lifecycle job `sent` as delivered would preserve the current false
  assurance. Webhook-updated `email_log.status` must take precedence.
- Large histories could slow Communication History. Use bounded queries and
  deterministic pagination rather than loading the entire log.

