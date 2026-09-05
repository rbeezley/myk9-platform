---
name: audit-pages
description: Use when auditing myK9Show pages for console errors, network errors, or broken UI after a refactor, before a release, or when the "Audit all pages" todo is active. Covers all roles: secretary, exhibitor, admin, judge, club-admin, public.
---

# Audit Pages for Console and Network Errors

Systematically visit every route in myK9Show, capture errors, fix what's addressable inline, and log the rest as Linear issues (team **MyK9-platform**).

This file is shared by Claude Code and Codex (`.agents/skills/audit-pages` is a symlink to it).

Before starting, read:

- `docs/INTENT.md` for role intent.
- `docs/qa/assets.md` for current QA assets and recommended commands.
- `docs/qa/e2e-suite-map.md` to connect route failures to existing Playwright coverage.
- `docs/qa/findings.md` for the reusable finding template.

## Scoping the Audit

**Full audit** — run all role groups in order. Use before a release or after a broad refactor.

**Partial audit** — if only specific areas changed, audit only the affected role group(s). Example: secretary routes changed → only run the Secretary group. State the scope in the output report.

## Setup

1. Start the dev server if not running: `pnpm dev:show` (localhost:5173)
2. Tools: `preview_start` / `preview_navigate` / `preview_console_logs` / `preview_network` / `preview_snapshot` / `preview_resize`
3. Log in as the role you're auditing before walking that role's routes (see credentials below)

**Credentials — canonical accounts only:**

Use these `@myk9t.com` accounts. They replaced the old `e2e-*@test.myk9.com` set on
2026-08-23: `test.myk9.com` has no MX record, so mail to it hard-bounced off a third
party's server. Every account below has a real, deliverable mailbox. Confirmed in
`apps/myk9show/src/test/e2e/helpers/testUsers.ts` (role wrappers use the env-backed
canonical accounts).

| Role       | Email                 | `TEST_USERS` key                                       |
| ---------- | --------------------- | ------------------------------------------------------ |
| Exhibitor  | `exhibitor@myk9t.com` | `DEMO_EXHIBITOR` (protected demo account, seeded dogs) |
| Secretary  | `secretary@myk9t.com` | `SECRETARY`                                            |
| Judge      | `judge@myk9t.com`     | `JUDGE`                                                |
| Club admin | `clubadmin@myk9t.com` | `CLUB_ADMIN`                                           |
| Admin      | `testadmin@myk9t.com` | `SITE_ADMIN`                                           |

Passwords live in `.env.local` (all e2e accounts share one secret), not `.env`; CI reads them from secrets.

**Two-step sign-in flow (SmartSignInPage).** The password field does not exist in the DOM until you advance past the email step, so log in with `preview_*` in this order:

1. `preview_fill` the `credential-input` field with the email
2. `preview_click` the Continue button (`continue-button`) — this reveals the password step in place
3. `preview_fill` the `password-input` field (now visible) with the password
4. `preview_click` the `sign-in-button` and wait for navigation off `/sign-in`

## Known Noise (do not re-log)

These pre-existing issues fire on every page load and should be **ignored** during audits:

| Error                                                       | Status                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Maximum update depth exceeded` (~258 occurrences per load) | Open bug — tracked in Linear (team **MyK9-platform**) "App-Wide Render Loop" |

Add new confirmed-pre-existing errors here as discovered.

## Per-Page Checklist

For each route:

1. `preview_navigate` to the URL
2. `preview_console_logs` — flag `error` entries (excluding known noise above); note `warning` entries as lower priority
3. `preview_network` — flag any 4xx or 5xx responses
4. `preview_snapshot` — confirm the page renders (not blank, not error boundary, **and data actually loaded** — a skeleton that never resolves is a bug)
5. `preview_resize` to 375px width — confirm layout doesn't break at mobile
6. Check `docs/qa/e2e-suite-map.md` for the nearest existing spec and note whether this route is covered by `pr-smoke`, `nightly`, `feature-audit`, `manual-debug`, or no spec.

**Fix inline** if the cause is obvious and isolated (wrong column name, missing null check, stale import).

**Log as TODO** if the fix requires investigation, touches multiple files, or is non-trivial:

```
- **Fix [page] [symptom]** — **Problem:** [what's wrong]. **Files:** [paths]. **Solution:** [hints].
```

Also log confirmed durable issues in `docs/qa/findings.md` using the shared template. Use Linear (team **MyK9-platform**) for sprint/task tracking and `docs/qa/findings.md` for reusable QA evidence and proof requirements.

## Route Inventory Support

If a generated route inventory exists at `docs/qa/generated/route-inventory.md`, use it to choose parameterized IDs and nearest tests. If it does not exist yet, continue manually with the route groups below and record missing route/test coverage as findings when it affects confidence.

## Route Groups

### Public (no login required)

```
/               /sign-in        /registration
/browse-shows   /shows          /shows/:id
/clubs          /clubs/:id
/terms          /privacy
```

> Notes:
>
> - `/login` exists only as a backwards-compat redirect to `/sign-in`. Audit `/sign-in` directly.
> - `/calendar`, `/dogs`, `/dogs/:id` are authenticated routes (wrapped in `<ProtectedRoute>`). They redirect guests to `/sign-in`. Audit them under the relevant logged-in role group, not Public.

### Exhibitor (login as exhibitor)

```
/exhibitor/dashboard    /exhibitor/entries      /exhibitor/entries/history
/exhibitor/profile      /exhibitor/account      /exhibitor/show-day
/exhibitor/check-in/:entryId    /my-entries     /cart
/checkout/success       /checkout/cancel        /subscription
/preferences            /profile                /messages/:showId
/shows/:showId/register /shows/:showId/trials/:trialId
/shows/:showId/trials/:trialId/classes/:classId
/shows/:showId/trials/:trialId/classes/:classId/results
```

### Secretary (login as secretary)

```
/secretary/dashboard        /secretary/pipeline/:trialId
/secretary/create-show      /secretary/create-show/wizard
/secretary/entries/:showId  /secretary/register/:showId
/secretary/waitlist         /secretary/day-of
/secretary/check-in         /secretary/run-order
/secretary/results-control  /secretary/results-submission
/secretary/reports          /secretary/settings
/secretary/volunteers
/trials/:trialId/classes    /trials/:trialId/classes/create
/shows/:showId/trials/:trialId/classes/:classId/secretary
/scoring/classes/:classId/entries
/people                     /users/:id
```

### Judge (login as judge)

```
/judge/dashboard    /judge/check-in    /judge/stats    /results/dashboard
```

### Club Admin (login as club admin)

```
/club-admin/members
```

### Admin (login as site admin)

```
/admin/dashboard    /admin/analytics    /admin/users
/admin/permissions  /admin/permissions/audit
/admin/permissions/roles    /admin/settings
/admin/templates    /admin/sync         /admin/alerts
/admin/onboarding   /admin/performance  /admin/judges/analytics
```

### Parameterised routes

For routes with `:id` / `:showId` / `:trialId` / `:classId` — use real IDs from the dev database. Skip if no data exists; note it as "no data to test".

## Output Format

After completing each role group, report:

```
Secretary audit — 23 routes (full) | or: (partial — secretary group only)
  Errors:   3 pages with console errors (logged as TODOs)
  Network:  2 pages with 4xx responses (1 fixed inline, 1 logged)
  Skeleton: 1 page with data never loading (logged)
  Mobile:   1 layout break at 375px (logged)
  Clean:    16
```

Log all new TODOs as Linear issues (team **MyK9-platform**), tagged so they group under the audit run — e.g. include `Page Audit Findings — YYYY-MM-DD` in the issue title or a shared label.

For each confirmed issue, append a finding to `docs/qa/findings.md` with:

- `Detected by: audit-pages`
- `Suite category:` from `docs/qa/e2e-suite-map.md`, or `none`
- `Proof required:` exact route replay, Playwright spec, or manual browser step needed before closing

## Rules

- Work one role group at a time; commit TODO additions before switching roles
- Do NOT fix bugs on hidden/parked features — log them and move on
- Do NOT wander into unrelated refactors; this is observation only
- A page showing "permission denied" for the wrong role is not a bug — skip it
- Console warnings are lower priority than errors; note but don't block on them
- If known noise (render loop etc.) is the _only_ error on a page, mark it clean
