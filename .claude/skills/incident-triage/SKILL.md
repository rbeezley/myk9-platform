---
name: incident-triage
description: "Use when production or staging misbehaves — errors spiking in Sentry, /admin/health red, Supabase CPU high, users can't sign in, scores not saving at a show, payments failing, or any 'the site is down/slow/broken' report. Especially during live show weekends."
user-invocable: true
argument-hint: "[symptom description]"
---

# Incident Triage

Show weekends are the highest-stakes windows: exhibitors and secretaries are standing in a ring with spotty wifi. Triage order is **impact → signal → known signatures → fix**, and diagnosis comes before any state-changing action.

## Step 1 — Scope the impact

- Which role/surface is affected (ringside scoring, entries, payments, sign-in, public results)?
- One show or platform-wide? One role or all?
- Is there a live show right now? If yes, prioritize ringside/offline paths over everything else.

## Step 2 — Pull signals (all in parallel, before hypothesizing)

- `/admin/health` — reads `system_health_snapshots`; stale > 26h = the check-runner itself failed.
- Supabase MCP: `get_logs` (api, postgres, edge functions), `get_advisors`.
- Sentry — recent release regressions and error spikes.
- Vercel — did a deploy land right before onset? Merge time vs onset time.
- `supabase migration list` — did a migration land that wasn't matched by a function deploy (or vice versa)? Merge ≠ deploy.

## Step 3 — Match against known signatures

| Signature | Diagnosis | Fix |
| --- | --- | --- |
| Staging/prod DB CPU > 80%, floods of `40001` on `ringside_update_entry` | OCC conflict storm from stale demo/leftover clients | Identify and kill stale sessions; see memory: ringside-occ-conflict-storm |
| Sentry `QuotaExceededError` | IndexedDB replication cache unbounded on that device | Eviction shipped; verify client version, clear site data as stopgap |
| Auth emails not arriving, ~2/hr | GoTrue rate limit without custom SMTP | Custom SMTP (launch blocker); runbook in memory: auth-email-rate-limit |
| `e2e-*` sign-in returns 400 | Drifted Supabase Auth passwords, NOT code | Reset the accounts |
| New table 404s from client | Missing GRANTs | Add GRANTs migration |
| Cron function 401 | Vault secret ≠ edge secret | Re-sync secrets |
| Judge/steward edits silently not saving | RLS gap — role not in `can_manage_show` | See memory: atshow-judge-write-rls-gap |
| Page crashes on status icon/map lookup | Unguarded `MAP[dbStatus]` | Guard with `?? MAP['no-status']` |

## Step 4 — Fix discipline

- Follow `superpowers:systematic-debugging` for anything not in the table; CLAUDE.md allows collapsing to evidence-gathering when the data path is obvious.
- Before restarts/deletes/config edits, confirm the evidence supports that exact action — a familiar-looking signal can have a different cause.
- Shared-system mutations (db push, function deploy) still require user confirmation mid-incident.
- Prefer the smallest reversible mitigation first (feature flag off, revert deploy) over hot-fixing forward during a live show.

## Step 5 — Close out

- Write what happened + root cause + fix into `docs/qa/findings.md` (or an incident note in `docs/`).
- If a new signature emerged, add it to the table above and to memory.
- Open follow-up work via `todo-add` or `opsx:propose` — don't leave prevention as a chat remark.
