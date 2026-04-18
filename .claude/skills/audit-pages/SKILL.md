---
name: audit-pages
description: Use when auditing myK9Show pages for console errors, network errors, or broken UI after a refactor, before a release, or when the "Audit all pages" todo is active. Covers all roles: secretary, exhibitor, admin, judge, club-admin, public.
---

# Audit Pages for Console and Network Errors

Systematically visit every route in myK9Show, capture errors, fix what's addressable inline, and log the rest as TO-DOS entries.

## Scoping the Audit

**Full audit** — run all role groups in order. Use before a release or after a broad refactor.

**Partial audit** — if only specific areas changed, audit only the affected role group(s). Example: secretary routes changed → only run the Secretary group. State the scope in the output report.

## Setup

1. Start the dev server if not running: `pnpm dev:show` (localhost:5173)
2. Tools: `preview_start` / `preview_navigate` / `preview_console_logs` / `preview_network` / `preview_snapshot` / `preview_resize`
3. Log in as the role you're auditing before walking that role's routes (see credentials below)

**Credentials (from `.env`):**

- Secretary: `secretary@myk9t.com`
- Site admin: any account with `SITE_ADMIN` role
- Exhibitor: any exhibitor account
- Judge / Club admin: accounts with those roles (check Supabase `user_roles` table if unsure)

## Known Noise (do not re-log)

These pre-existing issues fire on every page load and should be **ignored** during audits:

| Error                                                       | Status                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| `Maximum update depth exceeded` (~258 occurrences per load) | Open bug — tracked in TO-DOS.md "App-Wide Render Loop" |

Add new confirmed-pre-existing errors here as discovered.

## Per-Page Checklist

For each route:

1. `preview_navigate` to the URL
2. `preview_console_logs` — flag `error` entries (excluding known noise above); note `warning` entries as lower priority
3. `preview_network` — flag any 4xx or 5xx responses
4. `preview_snapshot` — confirm the page renders (not blank, not error boundary, **and data actually loaded** — a skeleton that never resolves is a bug)
5. `preview_resize` to 375px width — confirm layout doesn't break at mobile

**Fix inline** if the cause is obvious and isolated (wrong column name, missing null check, stale import).

**Log as TODO** if the fix requires investigation, touches multiple files, or is non-trivial:

```
- **Fix [page] [symptom]** — **Problem:** [what's wrong]. **Files:** [paths]. **Solution:** [hints].
```

## Route Groups

### Public (no login required)

```
/browse-shows   /shows          /shows/:id        /calendar
/clubs          /clubs/:id      /dogs             /dogs/:id
/terms          /privacy        /registration
```

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
/secretary/volunteers       /secretary/messages/:showId
/secretary/shows/:showId/edit
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

Append all new TODOs to TO-DOS.md under a dated heading:

```markdown
## Page Audit Findings — YYYY-MM-DD HH:MM
```

## Rules

- Work one role group at a time; commit TODO additions before switching roles
- Do NOT fix bugs on hidden/parked features — log them and move on
- Do NOT wander into unrelated refactors; this is observation only
- A page showing "permission denied" for the wrong role is not a bug — skip it
- Console warnings are lower priority than errors; note but don't block on them
- If known noise (render loop etc.) is the _only_ error on a page, mark it clean
