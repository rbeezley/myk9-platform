## Why

Original request: “review and fix these 9 P3 bugs.” Follow-up: “deploy supabase”. Current continuation: “continue”.

PR #1956 merged the behavioral fixes, but MYK9-334 still lacks waitlist cron monitoring, removal of unreachable email templates, behavioral edge tests, and verified remote deployment. This follow-up continues `docs/plan-p3-bug-and-dead-code-batch.md` to improve fall 2026 show-day reliability.

## What Changes

- Add best-effort cron check-ins and deduplicated operator alerts for waitlist state-work failures, preserving successful HTTP responses for retryable notification delivery errors.
- Delete the four email templates already rejected by authorization; keep the two supported types and server-derived recipients.
- Add behavioral regression coverage for the merged no-subscription upsert and error handling.
- Verify and, with approval, deploy only the three affected functions to the existing remote Supabase project.

No UI surface is introduced or duplicated; these are existing server paths. Non-goals: other agents' dead-code sweeps, replication TTL wiring, package compatibility decisions, migrations, local Supabase/Docker, or payment redesign.

## Capabilities

### New Capabilities

- `waitlist-cron-outcome-monitoring`: Operational failures produce non-success responses, error check-ins, and deduplicated alerts; notification retries remain non-blocking.

### Modified Capabilities

- `email-fn-send-email-authz`: Explicitly limit this endpoint to its two authorized email types.

## Impact

App-level waitlist cron and Stripe webhook; root send-email function; edge test registration; existing batch tracking. Reuse current Sentry and operator-alert helpers. Shared deployments, PR/merge, and external tracking remain approval-gated. MYK9-298 is Done; MYK9-308/313/322 are active elsewhere; MYK9-328's merged subset does not authorize broader package deletions.
