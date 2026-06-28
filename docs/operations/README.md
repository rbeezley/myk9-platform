# Operations runbooks — index

The single front door for running myK9Show in production. Each runbook below owns one
domain; this page is just the map. (Convention mirrors [`docs/README.md`](../README.md) — a
thin index over focused docs, not one merged wall.)

> **These are internal operator docs.** They contain secrets handling, service-role SQL, and
> DB connection details — they live in the repo on purpose and must **not** be published to
> the public help site (help.myk9show.com). Customer- and admin-*user*-facing how-tos belong
> in `docs/user-guides/` instead.

## Operator runbooks (site admin)

| Runbook | Reach for it when… |
| --- | --- |
| [`stripe-platform-setup.md`](stripe-platform-setup.md) | Anything payments/payouts: Connect setup, the four secrets, the money-flow model, go-live steps, **the nightly payout cron** (diagnose/fix/trigger), refund reconciliation, granting founding members, why the payout schedule must stay Manual. |
| [`admin-support-runbook.md`](admin-support-runbook.md) | A user reports "I can't access X": diagnosing access without impersonation, reproducing a user's view, manual SQL data repair, the escalation boundary. |
| [`supabase-auth-email.md`](supabase-auth-email.md) | A signup/confirmation email didn't arrive: how auth email is sent via Resend, the ~2/hour rate-limit gotcha, raising the limit, manual confirmation. |
| [`staging-reseed.md`](staging-reseed.md) | Resetting the staging demo to clean seed data + the required post-reseed verification. |
| [`ci-vercel-deploys.md`](ci-vercel-deploys.md) | Turning on (or troubleshooting) CI-gated production deploys. |

The site-admin *role* (scope, what you must accomplish for fall, what you should never have
to think about) is defined in [`../roles/admin.md`](../roles/admin.md).

## Club-facing reference (not an operator runbook)

| Doc | Audience |
| --- | --- |
| [`stripe-treasurer-guide.md`](stripe-treasurer-guide.md) | **Club treasurers** — the printable Stripe Express onboarding walkthrough. You hand this to clubs; it is not your operator reference. |

## Incident records (historical, not living runbooks)

| Record | What happened |
| --- | --- |
| [`edge-function-deploy-drift-2026-06-23.md`](edge-function-deploy-drift-2026-06-23.md) | 2026-06-23 edge-function deploy-drift incident write-up. A dated record, kept for reference — not a procedure to follow. |
