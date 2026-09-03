# To Do reliability batch 1

## Original request

Review linear issues that have the status of to do in a terminological order to implement them in batches and recent sub-agents

## Scope

Implement the edge-function reliability work in MYK9-334: surface waitlist-expiration failures, correct the Stripe webhook conflict target, and remove unreachable send-email paths. Existing recent work already owns MYK9-305, MYK9-309, MYK9-314, MYK9-319, MYK9-320, MYK9-339, and the Wave 3 dead-code cluster; this change must not duplicate those branches.

## Non-goals

- No show-map or self-check-in changes (MYK9-305, MYK9-309).
- No promo-code product decision or implementation (MYK9-312).
- No mobile layout redesign (MYK9-341).
- No migration push, function deployment, PR merge, or other shared-system mutation.
- No work on cross-cutting registry helper cleanup (MYK9-321) until this batch is integrated.
