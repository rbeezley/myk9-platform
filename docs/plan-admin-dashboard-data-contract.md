# Admin Dashboard & Health — Resolved Data Contract

> **Status:** Active

Resolves every `❓` in the `DATA_CONTRACT.md` shipped with the 2026-07-31 admin redesign
handoff, against the actual codebase and the live project (`sojmvhhwsjxmfistvzbe`). It also
corrects several rows the handoff marked `✅` that do not hold.

Read this before building either page. The handoff's own framing is right: the UI is a day or
two once the sources are settled, and the sources are where the surprises are.

Verdicts: **EXISTS** · **PARTIAL** (real source, narrower than the design assumes) ·
**ABSENT** (nothing to read) · **CUT** (no source and building one is not worth it now).

---

## Corrections to rows the handoff marked ✅

These matter more than the `❓` rows, because a wrong `✅` gets built without anyone checking.

| Row                             | Handoff | Reality                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue / sync backlog            | ✅      | **ABSENT.** The mutation outbox is client-side IndexedDB (`packages/replication/src/MutationQueueStore.ts`). There is no server-side queue table, so backlog depth is not observable from the server at all. A tile for it needs clients to _report_ depth first — a new write path, not a query. |
| Live shows (`status = running`) | ✅      | **PARTIAL.** `shows.status` has no `running` value; the only value present in the database is `published`. Whatever "live" means here has to be derived from dates or trial state, and that rule needs defining.                                                                                  |
| Event log — app event stream    | ❓      | Confirmed **ABSENT**, and worse than "no single stream": `frontend_logs` exists with 13 well-designed columns, **zero writers in application code and zero rows**. It looks like a source until you grep for who inserts.                                                                         |
| Sync monitoring (health check)  | ✅      | **ABSENT.** Listed as an existing check; no such check exists in `systemHealthChecks.ts`.                                                                                                                                                                                                         |
| Deleted items (health check)    | ✅      | **ABSENT.** Same — listed, never built.                                                                                                                                                                                                                                                           |
| Payout ledger (health check)    | ✅      | **EXISTS as of 2026-07-31** — built today under TICKET-2. It did not exist when the handoff was written.                                                                                                                                                                                          |

**Dead code to delete before it gets mistaken for a source.**
`apps/myk9show/src/services/SystemHealthService.ts` and
`apps/myk9show/src/components/analytics/MonitoringDashboard.tsx` compute uptime, latency and
connection counts with `Math.random()` (`SystemHealthService.ts:163,190,201,230,234,288,292`;
`MonitoringDashboard.tsx:620`). Both have **zero importers** and are on no route, so nothing is
currently lying to anyone — but they answer exactly the questions the new stat tiles ask, and
they are the first thing a future implementer will find. Delete them in the same PR that builds
the tiles.

---

## `/admin/health`

### Checks

Six exist today, all from one nightly snapshot row (`public.system_health_snapshots`, written by
the `cron-health-check` edge function, read by `useSystemHealthSnapshots.ts`):

`payout_cron` · `payout_ledger` · `background_jobs` · `migrations` · `ringside_conflicts` ·
`anon_grants`

The board's parser has no hardcoded key list, so a new check appears on the page as soon as a
snapshot carries it. Adding a check is a runner change, never a UI change.

Two design fields have no source yet:

| Field                                | Verdict            | Notes                                                                                                                                                                       |
| ------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `history` (last 12 runs)             | **EXISTS, unused** | Every snapshot is retained; the last 12 rows _are_ the history. The board currently reads only the newest. Deriving the strip is a query change (`limit 12`), not new data. |
| `durationMs` per check               | **PARTIAL**        | `run_duration_ms` is per **run**, not per check. Either show it once on the freshness band, or add per-check timing to the runner. Do not divide it by six.                 |
| `owner`, `blastRadius`, `runbookUrl` | **ABSENT**         | Static per check key. Colocate with the check definitions in `systemHealthChecks.ts`; do not add a table.                                                                   |
| `lastPassedAt`                       | derived            | From the 12-run history, per the handoff. Correct as specified.                                                                                                             |

### Freshness — stale threshold ❓ → **EXISTS, already decided**

`STALE_AFTER_MS = 26 * 60 * 60 * 1000` in
`apps/myk9show/supabase/functions/_shared/systemHealthChecks.ts`, deliberately shared with the
board's `systemHealthSelectors.ts` so the runner and the page agree on what "stale" means. That
is ~2× the nightly interval — exactly what the handoff suggests.

**Decision:** keep 26h while checks are nightly. If TICKET-3 option 2 lands (cheap checks
continuous), freshness becomes per-check — 2× that check's own interval — which the design's
per-row age column already supports. Do not introduce a second threshold constant.

### Unresolved alerts — **EXISTS**, and the audit question is **YES**

`public.operator_alerts`: `id, created_at, source, severity, title, detail, dedupe_key,
resolved_at, resolved_by`. Real and in use — 5 rows, 1 currently unresolved ("Password reset
email bounced", `resend-webhook`, 2026-07-29). Selectors already exist at
`features/admin-system-health/operatorAlertsSelectors.ts`.

Resolving is an `UPDATE` setting `resolved_at` + `resolved_by`. It does not delete, so the
handoff's requirement is already met. `dedupe_key` means a flapping source raises one alert, not
fifty — the design's "Resolve removes it from the list" is safe.

Two small gaps, both cheap: no resolution _reason_, and no history if an alert is re-raised
after resolution (the dedupe key is reused). Add a `resolution_note` column if you want the
former; the latter only matters once there is more than one operator.

### Coverage — **ABSENT**, and should stay small

No registry of monitored surfaces exists. Do not build a table for this.

**Recommendation:** a static `SURFACES` array beside the check definitions, each entry
`{ surface, verificationLevel: 'full' | 'dispatch-only' | 'none', checkKey? }`. The card's prose
and the "N of M surfaces unmonitored" footer both derive from it, and it lives in the file that
changes when a check changes — which is the only thing that keeps coverage copy from going
stale. Roughly 30 lines.

With today's checks the honest reading is: **full** — migrations, anon grants, payout ledger,
background jobs, ringside conflicts; **dispatch-only** — nightly payout cron (now labelled
Unverified rather than OK, per TICKET-2); **none** — email delivery, sync backlog, uptime.

### Environment — **PARTIAL**

`latest_migration` and `migration_count` come from the probe. Build SHA, region and deploy time
are Vercel environment variables (`VERCEL_GIT_COMMIT_SHA`, `VERCEL_REGION`), not database facts —
they need plumbing into the client bundle at build time. Small, but not free.

---

## `/admin/dashboard`

### Stat tiles

| Tile       | Verdict              | Source / what it would take                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uptime     | **PARTIAL — Sentry** | Sentry is live (owner-confirmed 2026-07-31). No dedicated uptime monitor exists, but Sentry **Cron** check-ins already run for the nightly jobs (`sentryCronCheckIn.ts`, `DAILY_HEALTH_MONITOR_SLUG`) — that is job reliability, not site reachability. A real uptime % needs a Sentry Uptime monitor pointed at the app URL: configuration, not code. Until one exists, label the tile for what it actually measures. |
| API p95    | **PARTIAL — Sentry** | Browser tracing is wired (`tracesSampleRate`, `VITE_SENTRY_TRACES_SAMPLE_RATE`). That gives **client-observed** transaction duration — the honest number to show, and not the same as server API latency, since it includes the user's network. Check the deployed sample rate before trusting it: a low rate makes the tail unreliable, and the tail is the percentile being displayed.                               |
| Error rate | **EXISTS — Sentry**  | Both halves are instrumented — browser (`services/observability/sentry.ts`, `main.tsx`) and edge functions (`npm:@sentry/deno`, e.g. `cron-health-check`). Errors over sessions is a standard Sentry query.                                                                                                                                                                                                            |
| Live shows | **PARTIAL**          | Queryable, but "live" needs defining — see the correction above.                                                                                                                                                                                                                                                                                                                                                       |
| Queue      | **ABSENT**           | Client-side only. See the correction above.                                                                                                                                                                                                                                                                                                                                                                            |
| Online now | **ABSENT**           | No source. `ringside_sessions` is 0 rows and passcode-scoped, not a general presence signal; `auth.sessions` is not exposed through PostgREST.                                                                                                                                                                                                                                                                         |

**Recommendation: four tiles now, six after one piece of plumbing.**

Four are honest today and cost nothing new: checks passing (`6/6` from the snapshot), unresolved
alerts, live shows, entries today. All four are a single Supabase read.

Error rate and API p95 are real, but they live in **Sentry, behind an API token** — and that is
the entire cost of those two tiles. The DSN is public and safe in the browser; a Sentry API token
is not, so the dashboard cannot query Sentry directly. It needs:

- an edge function proxying the two Sentry queries, holding the token as an edge secret;
- caching, because Sentry's API is rate-limited and these tiles want a ~1-minute refresh;
- a per-tile stale/error state, since an external dependency fails differently from a query.

Call it half a day, and it is the same proxy for both tiles and any later Sentry panel. Worth
doing — but it is a different shape of work from the rest of this page, so schedule it rather
than discovering it mid-build.

Uptime is the odd one out. Nothing currently measures site reachability; a Sentry Uptime monitor
takes minutes to configure, but until someone adds it an "uptime" tile would be reporting
cron-job reliability under a label that means something else.

### Traffic chart — **CUT**

Requests per minute, as two series: web and myK9Q.

**The second series measures a deleted application.** `apps/myk9q` was removed from the monorepo
once ringside moved into myK9Show `/at-show` (see CLAUDE.md, "Current development phase"). Half
this chart cannot ever have data, and a two-series chart with one flat line at zero is worse than
no chart.

The first series has no source either. Sentry being live does not rescue it: Sentry reports
transaction volume for sampled sessions, not requests per minute, and reading it per-range would
mean three more proxied queries behind the same token. Vercel Web Analytics is the closer fit and
is reachable through the Vercel MCP connector, but it is an external per-request call, not
something a chart can poll at 30s.

The handoff's own instruction applies — _"If this doesn't exist, ship the page without it rather
than faking it."_ **Cut it.** It is the single largest block on the page, so cutting it changes
the layout, not just the data; decide before building, not after. If a traffic visual is wanted
later, one series from Vercel analytics on a slow refresh is a defensible page of its own.

### Services — **derive, do not re-query**

Six rows of name / p95 / uptime / status. The p95 and uptime columns have no source (above). The
status column overlaps the health checks exactly, and the handoff is emphatic that querying it
twice will make the two pages disagree.

**Recommendation:** render this block from the same snapshot the health page reads, showing
name + status + age. Drop the latency and uptime columns until there is a source.

### Event log — **v1 from alerts only**

No unified stream exists, and the three tables that look like one are all empty:

| Table              | Writers                                                                         | Rows |
| ------------------ | ------------------------------------------------------------------------------- | ---- |
| `frontend_logs`    | none                                                                            | 0    |
| `activity_log`     | `features/pipeline/services/activityLogService.ts` — trial-scoped domain events | 0    |
| `analytics_events` | `hooks/useTrackSectionView.ts` — section views only                             | 0    |

`activity_log` is the right long-term backbone: it already has `action_type`, `actor_name`,
`record_type`, `record_id`, and real writers. It is trial-scoped, so a platform-wide log needs
its scope widened. That is a genuine piece of work, not a query.

**Recommendation:** ship v1 of the log from `operator_alerts` alone, exactly as the handoff
suggests. It has level, source, message and time — every column the design draws — and it is the
only one of the four with data in it.

### Today at a glance — **PARTIAL**

Entries, signups and shows published are straightforward `created_at` counts. **Fees processed
has no clean source**: there is no payments table, only `entry_payment_links`; money lives in
Stripe. Either read the Stripe balance transactions (external call, not a 30s tile) or drop the
fourth number to a 3-up.

Day boundary is Eastern, matching show schedules, and the design is right that the UI must say so.

### Triage queue — **derive read-only, build nothing**

| Field      | Verdict                                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Items      | **EXISTS** — failing checks + unresolved alerts. Both already parsed.                                                                                                             |
| `severity` | **PARTIAL** — `operator_alerts.severity` is real (`error` / `info` observed). Checks have `ok/warn/fail`. Map both onto the design's four levels; do not invent a severity model. |
| `category` | **ABSENT** — but derivable from the check key / alert source with a static map (`payout_*` → money, `ringside_*` → service, and so on).                                           |
| `owner`    | **ABSENT** — no assignment concept anywhere.                                                                                                                                      |
| `action`   | **ABSENT** — static `{label, href}` per key, same map as `category`.                                                                                                              |

**Recommendation — and this one is a scope decision, not a technical one:** build the triage view
read-only, with no owner column. The handoff says it and it is right: _don't build a ticketing
system for a team of one_. Assignment and a severity model are the two most expensive items in
this whole document and they serve a second admin who does not exist yet.

---

## Sentry — answered 2026-07-31

**Sentry is live in production** (owner-confirmed). That settles error rate outright and makes
API p95 available with a caveat about sampling. It does not settle uptime, which nothing
currently measures, and it does not rescue the traffic chart.

What follows from it, in the order worth doing:

1. **Add a Sentry Uptime monitor** against the production URL. Minutes of configuration, and it
   is the only way the uptime tile can mean what it says.
2. **Build the Sentry proxy edge function** (token as an edge secret, cached, per-tile stale
   state). Unblocks error rate and p95 together.
3. **Check the deployed `VITE_SENTRY_TRACES_SAMPLE_RATE`** before shipping p95. A low sample rate
   does not weaken a p95 gracefully — it makes the tail noise, and the tail is the whole number.

None of the three blocks `/admin/health`, which is why that page still goes first.

---

## Suggested order

Unchanged from the handoff, with the sources now attached:

1. Theme tokens onto the existing theme context.
2. Shared primitives — status chip, stat tile, data row, verdict band, freshness band, history
   strip, filter tabs, loading/empty/error shells.
3. `/admin/health`. Every block has a source today except coverage (30 lines of static config)
   and per-check duration. This is the right first page.
4. `/admin/dashboard`, four tiles, services derived from the health snapshot, event log from
   alerts, no traffic chart.
5. Triage, read-only.
6. Sentry proxy edge function, then the fifth and sixth tiles (error rate, API p95) — additive,
   and deliberately last because it is the only step with an external dependency.

Delete `SystemHealthService.ts` and `analytics/MonitoringDashboard.tsx` as part of step 4.
