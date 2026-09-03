# Design

Follow existing feature patterns and preserve offline-first behavior. Keep each issue in its own bounded file/test area so the batch can be reviewed independently.

- MYK9-305: reuse the existing numeric armband sort helper/rule used by the sibling Show Map branch and add a digit-boundary regression test.
- MYK9-309: represent query failure as unknown; do not advertise self check-in as enabled when settings cannot be read. Add hook tests for loading, disabled, enabled, and error states.
- MYK9-334: make each edge-function failure observable and non-successful using the existing cron alert/check-in conventions. Correct the webhook upsert conflict target only if the current schema supports it, and restore reachable send-email cases without broad refactoring. Add focused tests for each failure path.

UX-facing changes must preserve the intent document: calm, plain-English behavior and no false certainty.

