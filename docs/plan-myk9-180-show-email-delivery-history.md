# MYK9-180 — Show email delivery history

## Goal

Let a show secretary answer “Did we send that?” from the existing show-filtered
Communication History surface. The history must distinguish provider acceptance
from webhook-confirmed delivery and expose failures without creating another
communications page.

Linear: [MYK9-180](https://linear.app/myk9-platform/issue/MYK9-180/show-email-delivery-history-in-communication-history)

This plan completes the History and Authorization requirements in
[`docs/superpowers/specs/2026-07-08-show-email-sequence-design.md`](superpowers/specs/2026-07-08-show-email-sequence-design.md).

## Validation Profile [ADDED]

- Risk: high
- Validation: full
- Rationale: This work changes a database authorization boundary, adds a
  migration and read RPC, instruments multiple email senders, and exposes
  recipient delivery data in a secretary-facing workflow.

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
- Several active show-related senders are not represented by the original
  two-source plan: manual entry decisions and waitlist notifications write
  differently shaped `email_log` rows, while Heritage confirmations and results
  submissions currently do not write `email_log` rows at all. Without a sender
  inventory, “show email history” would silently omit valid show email. [ADDED]

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

## V1 scope [EXPANDED]

- Show one row per delivery attempt, newest first. Retries remain separate rows
  so the audit trail is not overwritten.
- Inventory every production Resend writer and classify it as show-scoped or
  platform-scoped before changing the schema. The V1 show-scoped set must cover:
  - registration confirmations
  - Heritage entry confirmations
  - lifecycle emails
  - manual entry-decision emails
  - waitlist offer/reminder/expiry emails
  - registry results-submission emails
- Explicitly exclude account/auth email, support notifications, platform
  waitlist invites, and welcome email because they are not owned by one show.
- If an active show-scoped sender cannot bind its log to a server-verified show,
  add that logging metadata in this issue before calling coverage complete. Do
  not infer show ownership from recipient address, subject text, or client input.
- Include lifecycle attempts that failed before a provider message ID was
  created; label these as failed attempts, not sent emails.
- Show recipient name when safely resolvable, recipient email, email type,
  attempted/sent time, final status, and a plain-language failure summary.
- Use `email_log.status` as delivery truth whenever an email-log row exists.
- Treat `sent` as “Sent — awaiting delivery confirmation.” Only `delivered`
  means delivered.
- Map `bounced`, `failed`, and `complained` to calm “Needs attention” states.
- Map an unknown future provider status to “Status unavailable”; never treat an
  unrecognized value as delivered.
- Link recovery to the existing owner surface:
  - registration, Heritage confirmation, or manual entry decision →
    `/shows/<showId>/entry-management`
  - lifecycle email →
    `/secretary/messages?showId=<showId>&view=email#scheduled-emails`
  - waitlist notification →
    `/shows/<showId>/entry-management?tab=waitlist`
  - registry results submission → `/shows/<showId>/submit-results`
- Paginate or cap the first query so Communication History remains responsive.

## Data contract [EXPANDED]

Add a read-only, authenticated, show-scoped RPC such as
`get_show_email_delivery_history(p_show_id, p_limit, p_before_created_at,
p_before_id)`.

Add nullable `email_log.show_id` as the canonical show-history scope. Every
active show-scoped sender must derive this value server-side from its authorized
resource and write it on both successful provider acceptance and locally known
failed attempts. Do not trust a client-supplied show ID without independently
authorizing and resolving the referenced resource. Keep `related_id` for source
recovery links, but stop using its polymorphic value as the authorization anchor.

Backfill `show_id` only where ownership is deterministic through an enrollment,
lifecycle job, waitlist event, or entry/trial relationship. Heritage entry rows
with a durable message ID may be converted into history records using their
server-resolved recipient and show. Leave irrecoverable historical records
unscoped and invisible rather than guessing. Results submissions made before
durable logging cannot be backfilled.

The RPC should return only presentation-safe fields:

- stable attempt/log identifier
- show ID
- source kind from the verified V1 show-scoped source set
- lifecycle step type when applicable
- enrollment/job reference needed for recovery routing
- recipient name and email
- attempted/created timestamp
- status-updated timestamp
- normalized delivery status
- sanitized failure summary

The query should combine:

1. `email_log` rows with the requested canonical `show_id`.
2. lifecycle attempts whose job belongs to the requested show but which failed
   before an `email_log` row could be created.

Avoid widening direct client access to all `email_log` rows. The RPC must check
the caller can manage the requested show or is a site admin, use an explicit
`search_path`, and expose no cross-show rows. Orphaned or ambiguously related
records must be omitted rather than guessed into a show.

The migration must revoke public execution, grant execution only to
`authenticated`, clamp `p_limit` to 1–100, reject malformed cursor combinations,
and use `(created_at, id)` as a deterministic descending cursor. Use static SQL;
do not interpolate client-provided sort fields or identifiers. Full recipient
email is permitted only in this authorized secretary/site-admin response and
must not be copied into client logs, analytics, or error monitoring.

The normalized timestamp is `status_updated_at` for a provider-updated final
state and `created_at`/attempt time otherwise. A webhook update that occurs while
the user is viewing the page may update the row in place, but must not duplicate
or reorder it across pagination boundaries.

## UX contract [EXPANDED]

- Keep the existing Communication History route and show filter. Add a simple
  **Messages / Email delivery** view switch below the show filter so delivery
  rows use the main content width instead of being squeezed into the existing
  `md:w-80` message rail. Messages remains the default and its thread workflow
  remains unchanged.
- In Email delivery mode, keep Scheduled emails as the first operational
  control and render Delivery history below it. History is supporting evidence,
  not a competing send workflow. A canonical deep link may use
  `?showId=<id>&view=email`.
- If no show is selected, ask the secretary to select a show rather than issue a
  global history query.
- Use readable text labels with status icons; do not rely on color or hover.
- Default to the newest attempts and provide a simple “Show more” action when
  more records exist.
- Empty: “No show emails have been sent yet.”
- Error: “Email delivery history isn’t available right now. Try again.” Existing
  message threads and scheduled-email controls must remain usable.
- Missing legacy details should display “Details unavailable” without exposing
  raw IDs or provider payloads.
- When the show filter changes, clear the previous show’s delivery rows while
  the new request loads; never display stale recipient data under the new show
  name.
- At desktop and tablet widths, preserve the existing message-thread space and
  minimum 44px interactive targets. On mobile, the view switch and history must
  work without hover-only details.

## Implementation phases

### Phase 0 — Sender coverage inventory [ADDED]

- Produce a checked source matrix of every production Resend writer, its
  `email_type`, durable source reference, server-verifiable show path, whether it
  records provider failures, and whether webhook status can reach its log row.
- Add a source-contract test that fails when a new show-scoped sender is added
  without canonical `show_id` logging or an explicit platform-scoped exclusion.
- Confirm the active call sites for legacy `send-email` variants; do not migrate
  dead/demo-only paths into the launch-critical history.

### Phase 1 — Secure read model

- Add `email_log.show_id`, deterministic safe backfills, sender instrumentation,
  the show-scoped RPC, and an index supporting `(show_id, created_at DESC, id
  DESC)`. Validate the final index choice with `EXPLAIN` on representative data.
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

- Verify every source in the show-scoped sender matrix appears, and every
  platform-scoped source remains excluded.
- Verify a webhook status transition from `sent` to `delivered` updates the UI.
- Verify failures route to the existing recovery surface.
- Apply the migration only after explicit shared-system approval.
- After deployment, send controlled test emails and capture browser evidence
  from a secretary account.

## Rollout and rollback [ADDED]

- This is additive: do not remove existing `email_log` columns, RLS policies,
  Entry Management indicators, or Scheduled emails queries in the same change.
- Deploy the database migration and instrumented Edge Functions before the app
  UI. Smoke-test the RPC with a same-show secretary, a cross-show secretary, and
  a site admin before exposing the history.
- Deploy the app only after the RPC and sender logs are available. A missing or
  temporarily unavailable RPC must degrade to the isolated history error state;
  it must not break messages or scheduled-email controls.
- Roll back the app UI first if production verification fails. Existing senders
  continue operating because `show_id` is nullable and logging is additive.
- If database rollback is required, use a follow-up migration to revoke/drop the
  RPC and new index/column only after the app no longer calls it. Never rewrite
  or delete existing delivery records as part of rollback.

## Operational concerns [ADDED]

- No new environment variables or secrets are required. Reuse the existing
  Resend webhook and Supabase authorization path.
- Report RPC/query failures through existing app error instrumentation without
  recipient email, provider payload, or message ID.
- After deployment, verify one controlled email reaches `sent`, then
  webhook-confirmed `delivered`, and that a controlled failure is visible only
  to the correct show manager. Record timestamps and screenshots on MYK9-180.
- Check query latency and returned row count during rollout. Investigate an
  unexpected increase rather than raising the 100-row page cap.

## Testing phase

### Database and authorization

- Same-show secretary can read registration and lifecycle attempts.
- Site admin can read a requested show.
- Secretary for Show A cannot read Show B, including direct RPC invocation.
- An authenticated non-manager cannot read the history.
- Orphaned and malformed references do not leak recipient data.
- Pagination is stable when attempts share a timestamp.
- Invalid limits and half-specified/malformed cursors fail closed.
- RPC execution is unavailable to `anon`/`PUBLIC` and available only to
  authenticated callers who pass the internal show authorization check.
- Recipient addresses do not appear in application logs or monitoring events.
- Every active show-scoped sender writes canonical `show_id`; platform-scoped
  senders remain excluded by a source-contract test.

### Read model

- Mixed email types are ordered newest first.
- `delivered` is distinct from `sent`/awaiting confirmation.
- Bounced, failed, and complained statuses normalize correctly.
- Lifecycle pre-provider failures appear without pretending an email was sent.
- Missing legacy data produces safe fallback copy.
- Unknown future webhook statuses render as unavailable, never delivered.
- A webhook update during pagination updates one stable attempt row without
  duplication.

### Components

- Delivered, awaiting delivery, needs-attention, and legacy rows render with
  text labels and accessible icons.
- Empty, loading, error, and show-more states render correctly.
- Recovery links point to Entry Management or Scheduled emails as appropriate.
- Changing the show filter changes the query key and visible rows.
- A history-query failure does not hide existing messages or scheduling tools.
- Switching shows never displays the previous show’s recipient history while
  loading.
- Messages / Email delivery navigation works at mobile, tablet, and desktop
  widths without hover-only status details.

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
- Heritage confirmations, manual entry decisions, waitlist notifications, and
  results submissions are included once sent after instrumentation; active
  show-scoped senders cannot silently bypass the history contract.
- Cross-show access is denied at the database boundary.
- Failures lead to an existing recovery surface instead of duplicating actions.
- Existing Entry Management status indicators, Scheduled emails controls, and
  message history continue to work.
- Automated tests and secretary browser evidence are recorded on MYK9-180.

## Non-goals

- No new communications page or campaign tool.
- No changes to recipient selection, content, scheduling, or send triggers.
  Adding canonical show-scoped delivery logging is in scope.
- No automatic retry.
- No global admin email-log viewer.
- No speculative backfill of records that cannot be safely associated with a
  show; deterministic source-specific backfills are allowed.
- No requirement for email delivery while offline; core show operations must
  remain unaffected when connectivity is unavailable.

## Risks

- Joining polymorphic `email_log.related_id` values incorrectly could leak
  cross-show recipient data. The RPC and authorization tests are release gates.
- Treating lifecycle job `sent` as delivered would preserve the current false
  assurance. Webhook-updated `email_log.status` must take precedence.
- Large histories could slow Communication History. Use bounded queries and
  deterministic pagination rather than loading the entire log.
- Multiple senders currently have inconsistent logging. Missing one would make
  the feature look complete while silently omitting email; the sender matrix and
  source-contract test are release gates. [ADDED]
- Migration and app deploy independently. The database-first/app-second rollout
  and UI-first rollback order prevent either side from depending on a missing
  RPC. [ADDED]
