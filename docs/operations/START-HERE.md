# START HERE — when something's wrong

The single front door for operating myK9Show and handling issues. This page **routes**; it
does not repeat procedures. Each linked doc/skill owns the authoritative fix — do not copy fix
steps into this table, they will drift. If you can't tell which row you're in, run the
[`incident-triage`](../../.claude/skills/incident-triage/SKILL.md) skill and it will scope it.

> Audience: the operator (site admin). These are internal docs with secrets/service-role SQL —
> never publish to the public help site. Customer-facing how-tos live in
> [`../user-guides/`](../user-guides/).

---

## First 60 seconds — pull signals before hypothesizing

Do these in parallel; don't guess a cause until you've looked:

1. **[`/admin/health`](../operations/README.md)** — reads `system_health_snapshots`. A stale (> 26h) board means the check-runner _itself_ failed, not that everything is green.
2. **Supabase MCP** — `get_logs` (api / postgres / edge functions) and `get_advisors`.
3. **Sentry** — recent release regressions and error spikes.
4. **Vercel** — did a deploy land right before onset? Compare merge time to onset time.
5. **`supabase migration list`** — did a migration land without a matching function deploy (or vice-versa)? **Merge ≠ deploy.**
6. **Is there a live show right now?** If yes, prioritize ringside scoring / offline paths above everything else. Reach for the [`incident-triage`](../../.claude/skills/incident-triage/SKILL.md) skill.

---

## "The site is broken" — infrastructure by signature

Owned by the [`incident-triage`](../../.claude/skills/incident-triage/SKILL.md) skill (full signature table + fix discipline lives there). Quick index:

| Symptom                                                    | Likely cause                              | Start here                                                                                                                             |
| ---------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| DB CPU > 80%, floods of `40001` on `ringside_update_entry` | OCC conflict storm from stale clients     | `incident-triage` skill → kill stale sessions                                                                                          |
| Auth / confirmation emails not arriving (~2/hr cap)        | GoTrue rate limit without custom SMTP     | [`supabase-auth-email.md`](supabase-auth-email.md)                                                                                     |
| `e2e-*` sign-in returns 400                                | Drifted Supabase Auth passwords, not code | [`seed-reset`](../../.claude/skills/seed-reset/SKILL.md) skill → reset accounts                                                        |
| Brand-new table 404s from the client                       | Missing `GRANT`s                          | [`db-push`](../../.claude/skills/db-push/SKILL.md) → add GRANTs migration                                                              |
| Cron function returns 401                                  | Vault secret ≠ edge-function secret       | [`stripe-platform-setup.md`](stripe-platform-setup.md) (payout cron) / [`deploy`](../../.claude/skills/deploy/SKILL.md)                |
| Judge/steward edits silently not saving                    | RLS gap — role not in `can_manage_show`   | `incident-triage` skill                                                                                                                |
| Page crashes on a status icon / map lookup                 | Unguarded `MAP[dbStatus]`                 | `incident-triage` skill                                                                                                                |
| Edge function drift (deployed ≠ repo)                      | Deploy skipped or landed ahead            | [`edge-function-drift-audit-2026-07-12.md`](edge-function-drift-audit-2026-07-12.md), [`deploy`](../../.claude/skills/deploy/SKILL.md) |

---

## "A user is stuck" — support by symptom

Owned by [`../support/`](../support/README.md). Investigation recipes (Supabase queries, Stripe
paths, all **read-only**) live in [`investigation-cookbook.md`](../support/investigation-cookbook.md);
symptom taxonomy in [`common-issues-outline.md`](../support/common-issues-outline.md); reply
snippets in [`macros.md`](../support/macros.md).

| User says…                                      | Start here                                                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "I can't sign in"                               | [investigation-cookbook § Cannot Sign In](../support/investigation-cookbook.md) → [`admin-support-runbook.md`](admin-support-runbook.md)                        |
| "I paid but my entry is missing"                | [investigation-cookbook § Payment Processed, Entry Missing](../support/investigation-cookbook.md)                                                               |
| "I never got my confirmation email"             | [investigation-cookbook § Confirmation Email Not Received](../support/investigation-cookbook.md) → [`supabase-auth-email.md`](supabase-auth-email.md)           |
| "My payment wasn't confirmed / Stripe question" | [common-issues § Payment Not Confirmed](../support/common-issues-outline.md), [`stripe-platform-setup.md`](stripe-platform-setup.md)                            |
| "Our club hasn't received its payout"           | [investigation-cookbook § Club Payout Not Received](../support/investigation-cookbook.md), [`stripe-platform-setup.md`](stripe-platform-setup.md) (payout cron) |
| Refund owed after the club was already paid out | [`post-payout-clawback.md`](post-payout-clawback.md) — manual refund + transfer reversal                                                                        |
| Chargeback/dispute alert from Stripe            | [`post-payout-clawback.md`](post-payout-clawback.md) § Case B — evidence first, then recovery                                                                   |
| "Stripe says my account is under review"        | [investigation-cookbook § Stripe Connect Account Under Review](../support/investigation-cookbook.md)                                                            |
| "My data isn't syncing / offline problem"       | [investigation-cookbook § Offline or Sync Issue](../support/investigation-cookbook.md)                                                                          |
| "I can't find my show" / entry status confusion | [common-issues-outline.md](../support/common-issues-outline.md)                                                                                                 |
| "I can't access X" (access/permission report)   | [`admin-support-runbook.md`](admin-support-runbook.md) — diagnose without impersonation                                                                         |
| Show-day, secretary stuck right now             | [show-day-triage-outline.md](../support/show-day-triage-outline.md) + `incident-triage` skill                                                                   |

In-app operator surfaces: `/admin/support` (ticket inbox), `/admin/health` (system board),
`/admin/payouts` (payout reconciliation).

---

## Rollback — when a fix must be undone fast

Full table with exact commands + time estimates: [`go-live-runbook.md`](go-live-runbook.md)
§ Rollback. Quick index of what layer to roll back:

| Broke                                 | Roll back                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Realtime show-day feature misbehaving | Set matching `VITE_SHOW_*=false` in Vercel → redeploy → hard refresh                                            |
| Bad frontend build                    | Vercel → promote previous production deployment                                                                 |
| Bad migration                         | Never edit an applied one — write a reverting migration + `db push`                                             |
| Edge function regression              | Redeploy prior version from last-good commit ([`deploy`](../../.claude/skills/deploy/SKILL.md))                 |
| Stripe live cutover failing           | Rotate `STRIPE_SECRET_KEY`/`_WEBHOOK_SECRET` back to test, pause payments — **do not** purge live customer rows |
| Payout misfire                        | Unset Vault `payout_cron_secret` to hard-stop the cron; reconcile via `/admin/payouts`                          |
| Auth email broken                     | Restore auth-config backup + prior `send-auth-email` in one window                                              |

**Abort criteria:** any P0 (data loss, money mis-charged, cross-tenant read) on a live show day
→ roll back the offending layer, close entries via show settings if needed, communicate via show
announcements, regroup. See go-live-runbook § Abort criteria.

---

## The full doc map

| Area                  | Home                                           | Owns                                                                   |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Operator runbooks     | [`operations/README.md`](README.md)            | payments, deploys, auth email, staging reseed, incident records        |
| User support          | [`../support/README.md`](../support/README.md) | intake, error inventory, cookbook, macros, show-day triage             |
| Site-admin role       | [`../roles/admin.md`](../roles/admin.md)       | scope + what the operator owns for launch                              |
| Customer how-tos      | [`../user-guides/`](../user-guides/)           | public help-site guides (secretary/exhibitor/judge/club-admin)         |
| Executable procedures | Skills                                         | `incident-triage`, `deploy`, `db-push`, `seed-reset`, `security-audit` |
| Launch sequencing     | [`go-live-runbook.md`](go-live-runbook.md)     | the single ordered, gated go-live document                             |
