# Site admin intent walk: 2026-10-30

> Scheduled task `role-intent-walk`. Prompt version: `origin/main` @ `0c0ee971b41ac324960d8ec4a94b1a89717d4965` (`docs/qa/walks/role-intent-walk.md`).
>
> **ISO week 44, and 44 mod 3 = 2, so the role is site-admin.** Lens: INTENT.md, Site Admin = _"The platform is healthy"_ (opening the dashboard: "Everything looks normal"; investigating: "I can drill down"; managing users and clubs: "Standard operations").

source: claude · run date 2026-10-30 · author: Claude Code (scheduled, unattended)

## Executive assessment

**Role confidence: good, with one drill-down gap.** The admin console now behaves like the oversight surface INTENT describes:

- The dashboard leads with a "Needs a look" triage list and a health band.
- Support tickets carry working investigation links, and show-day tickets sort first.
- Roles and assignments read cleanly.
- The risky template maintenance controls are gone.

Most findings from the 2026-07-06 site-admin audit hold as fixed.

One new P2 (MYK9-1533): when a support ticket carries only the reporter's auth id, "Open user access" silently lands on the unfiltered user list. That id is the one an offline-filed show-day ticket would carry. Three P3s cover the INTENT size floors on the triage surfaces and the dashboard's dead-end counts.

P0 0 · P1 0 · P2 1 (new) · P3 3 (2 new, 1 unchanged since 07-06). Filed under parent **MYK9-1532**.

## Scope

| Item      | Value                                                                                                                                                                                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actor     | `testadmin@myk9t.com`, rendered "Taylor Brooks". `verify-e2e-auth-preflight.ts admin` passed. The account also holds club-admin, secretary and exhibitor grants ("Site Admin +3"), as `role-journey-ux-audit` warns. No club-scoping claim is made from it.                                                                |
| Viewports | 375x812 (Pixel 5 emulation), 1440x900 and 1024x768. All three walked the same 22-route set; interaction probes ran at 375 and 1440.                                                                                                                                                                                        |
| Build     | Worktree detached at `origin/main` `0c0ee971b`; Vite dev server on 127.0.0.1:5491 started by this run.                                                                                                                                                                                                                     |
| Data      | **A throwaway native local Supabase stack, not shared staging.** See "Why not shared staging". Seeded in the lifecycle order: platform grants, e2e users (auth only), isolated accounts, `seed-demo.sql`, accounts again. Every request was checked for the production ref: **0 requests reached `sojmvhhwsjxmfistvzbe`.** |
| Writes    | Local only: two `support_tickets` rows inserted by psql into the throwaway DB, to exercise the support drill-down. No production writes, no shared-system writes other than the Linear issues below.                                                                                                                       |

### Why not shared staging

`playwright.audit.config.ts` refused to start. The refusal comes from the MYK9-1454 guard (merged 2026-10-27), which states that **there is one Supabase project, and it is production**: every fixture sign-in runs a full sync against it. The prompt's safe-mutation boundary says "do not run anything against production". So I did not set `MYK9_ALLOW_PROD_E2E=1`. Instead I ran the walk on a per-worktree native stack, following the project's isolated-e2e recipe.

Consequences, recorded as coverage gaps rather than passes:

- The system health board has no runs locally ("No health run has ever been recorded"), so per-check drill-down and remediation links could not be exercised against a red check.
- `sentry-dashboard-metrics` failed CORS against the local functions host (it allows only `https://myk9show.com`), so the Error rate and Client p95 tiles read "—". This is an environment artifact, not filed.
- Payouts, refunds and alerts are empty on the seed.

## Regression re-verification

No earlier site-admin **intent** walk exists. Instead, I re-walked the 2026-07-06 site-admin support/health UX audit (`docs/audits/2026-07-06-site-admin-support-health-ux-audit.md`) in the browser.

| 07-06 finding                                                                                         | Result                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard lacks a health/support/sync summary band                                                    | **Resolved.** The dashboard shows Checks passing, Open alerts, Error rate and Client p95 tiles, a "Needs a look" triage list with severity ("CRITICAL · No health run has ever been recorded → Open system health") and a Services band. The "Needs a look" link lands on `/admin/health`. |
| Support diagnostics are static text with no links                                                     | **Resolved, with one gap.** The ticket detail has "Investigation actions" (Open reported page → `/at-show/:id`, Open show desk → `/shows/:id`, Open user access → `/admin/users?userId=`) and "Next checks". The `userId` link fails when only the auth id is present (SA-INT-01).         |
| Support does not sort show-day tickets first                                                          | **Resolved.** The show-day ticket is listed first with a "Show day" pill and a "Show-day priority" label, even though it was the older of two tickets.                                                                                                                                     |
| `/admin/permissions/users` rows read Unknown User / Unknown Role                                      | **Resolved.** Now `?tab=assignments`: "19 active assignments · 12 people · 7 role types", every row named.                                                                                                                                                                                 |
| Role cards show Permissions 0 / Users 0                                                               | **Resolved** for real roles (Site Admin 44, Secretary 35, Club Admin 19, Exhibitor 14, Judge 7). Steward (1 member) and Chairman ("named role for future use") still read 0 permissions. See Observations.                                                                                 |
| Template Force Initialize / Reset / Clean controls                                                    | **Resolved.** `/admin/templates` is now the read-only "Sport Rules" view.                                                                                                                                                                                                                  |
| Only some dashboard metric cards navigate                                                             | **Unchanged** for the "Today at a glance" counts (SA-INT-04).                                                                                                                                                                                                                              |
| `/admin/sync` mock data, `/admin/settings`, `/admin/analytics`, `/admin/performance`, `/admin/alerts` | **Resolved.** `/admin/sync` renders 404, and `supportDiagnosticActions.isRetiredRoute` treats it as retired on purpose. `/admin/data-lifecycle` redirects to `/admin/deleted-items`.                                                                                                       |

## Findings

| ID        | Sev | Status    | Linear                                                        | Finding                                                                                                                                                                                                                                                                  |
| --------- | --- | --------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SA-INT-01 | P2  | new       | [MYK9-1533](https://linear.app/myk9-platform/issue/MYK9-1533) | Support "Open user access" / "Review user roles" with an auth-only ticket opens the unfiltered user list with no dialog and no message. `get_admin_user_list` returns no `auth_user_id`, so the roster's `user_id` is always undefined and the fallback can never match. |
| SA-INT-02 | P3  | new       | [MYK9-1534](https://linear.app/myk9-platform/issue/MYK9-1534) | Triage text is below the 14px floor: dashboard "Needs a look" titles are 13px, and the Support "Show day" pill and client-error source are 11px.                                                                                                                         |
| SA-INT-03 | P3  | new       | [MYK9-1535](https://linear.app/myk9-platform/issue/MYK9-1535) | Admin list and console actions are below 44px: user-name drill-down 28px, Support status buttons and six investigation links 32px, Page Directory "Go to page" 32px, dashboard "Open system health →" 31px, Sport Rules "Re-read database" 32px.                         |
| SA-INT-04 | P3  | unchanged | [MYK9-1536](https://linear.app/myk9-platform/issue/MYK9-1536) | Dashboard "Today at a glance" counts (Entries, Signups, Shows created, Live shows) cannot be followed to the records behind them. Two other tiles do link, so the cards look alike and behave differently.                                                               |

### SA-INT-01 evidence

- The ticket's diagnostics have `user.authUserId` set to exhibitor@'s auth id and `databaseUserId: null`. Following "Open user access" goes to `/admin/users?userId=19c9df50…`, which shows the roster with `[role=dialog]` absent, at both 1440 and 375.
- **Positive control** on the same page: `?userId=d996921e…` (the people id) opens "Manage Roles — Set roles for Casey Morgan".
- `pg_get_function_result('public.get_admin_user_list')` has no `auth_user_id`.
- This is the last-hop-drop lesson. The client match `user.user_id === id` (`UserManagementPage.tsx:254`) is correct code reading a field the RPC never supplies.
- How it is reachable in real use: `useSupportHelp` fills `databaseUserId` from `userWithRoles`, which is unresolved on an offline cold boot.
- The ticket fixture is synthetic (inserted by psql). The failing branch is the documented fallback in `supportDiagnosticActions.ts:90`.

### Viewport matrix

| Finding   | 375         | 1024        | 1440        |
| --------- | ----------- | ----------- | ----------- |
| SA-INT-01 | reproduced  | not run     | reproduced  |
| SA-INT-02 | 13px / 11px | 13px / 11px | 13px / 11px |
| SA-INT-03 | reproduced  | reproduced  | reproduced  |
| SA-INT-04 | reproduced  | reproduced  | reproduced  |

## Consolidation observations

- `/admin/onboarding` ("Club Onboarding") lists "Clubs awaiting authorization", and each item links to the club page, where the header Actions menu authorizes. That is a link to the existing surface rather than a second authorize control. Good.
- `/admin/permissions?tab=assignments` says "Revoke here; assign from User Management", and `/admin/permissions` links "Assign roles in User Management". One assign path. Good. The assignments tab has no `<h1>`; the other tabs do. Too minor to file.
- The dashboard links to `/admin/health` twice: "Open system health" in Needs a look and "Open system health →" in Services. Acceptable as summary and detail, noted only.

## Observations (not filed)

- **Greeting:** at 01:11 CDT the dashboard read "Good evening, Taylor." `utils/greetings.ts` treats 00:00–04:59 as evening. The judge walk on 10-16 noted the same. This is a human product call.
- **Steward role, 0 permissions, 1 member:** the steward grant gives nothing through RBAC. That may be deliberate (stewards work through the secretary or passcode), but nothing on the page says so. Left for a human.
- **`/admin/rbac-test`** content is 611px wide at 375 and `/admin/load-testing` is 428px. Both are debug/dev surfaces, so not filed. `/shows` is 377px at 375, a 2px overflow, too small to file.
- **CORS on `sentry-dashboard-metrics`** from a local origin is environment-only. Noted for anyone running the dashboard on a local stack.

## Coverage matrix

| Route                                                                  | 375     | 1440    | 1024    | Notes                                                                                         |
| ---------------------------------------------------------------------- | ------- | ------- | ------- | --------------------------------------------------------------------------------------------- |
| Sign-in → `/admin` → `/admin/dashboard`                                | walked  | walked  | walked  | 4 console errors, all the local CORS artifact                                                 |
| Dashboard tiles and Needs-a-look drill-down                            | probed  | probed  | walked  |                                                                                               |
| `/admin/health`                                                        | walked  | walked  | walked  | empty board, no runs (gap)                                                                    |
| `/admin/support` list and ticket detail with diagnostics               | probed  | probed  | walked  | seeded tickets                                                                                |
| `/admin/users` search, name drill-down, actions menu, select           | probed  | probed  | walked  | menu: Edit user, Open profile page, Manage roles, Suspend account, Delete user… (not clicked) |
| `/admin/users?userId=` deep link (auth id and people id)               | probed  | probed  | not run |                                                                                               |
| `/admin/role-requests`, `/admin/onboarding`                            | walked  | walked  | walked  | empty queues                                                                                  |
| `/admin/permissions` (overview, assignments, audit, `/roles` redirect) | walked  | walked  | walked  |                                                                                               |
| `/admin/payouts`                                                       | walked  | walked  | walked  | $0 seed; fee form not submitted                                                               |
| `/admin/deleted-items` (+ `/admin/data-lifecycle` redirect)            | walked  | walked  | walked  | trash empty                                                                                   |
| `/admin/templates` (Sport Rules)                                       | walked  | walked  | walked  |                                                                                               |
| `/admin/judges/analytics`                                              | walked  | walked  | walked  |                                                                                               |
| `/admin/help` (Page Directory)                                         | walked  | walked  | walked  |                                                                                               |
| `/admin/rbac-test`, `/admin/load-testing`                              | walked  | walked  | walked  | debug                                                                                         |
| `/admin/sync`                                                          | walked  | walked  | walked  | 404, retired on purpose                                                                       |
| `/clubs`, `/clubs/:id` (Heartland)                                     | probed  | probed  | walked  | Actions menu present; Authorize not clicked                                                   |
| `/shows`                                                               | walked  | walked  | walked  |                                                                                               |
| Health drill-down from a red check, remediation links                  | skipped | skipped | skipped | no health runs on the local stack                                                             |
| Create / suspend / delete user, role save, club authorize, fee update  | skipped | skipped | skipped | not exercised; a read-mostly walk by choice                                                   |
| `/admin/permissions/roles/new`, `/:roleId`, `/clone`                   | skipped | skipped | skipped | coverage gap                                                                                  |
| Keyboard-only and focus order                                          | skipped | skipped | skipped | coverage gap                                                                                  |
| Non-owned record step                                                  | n/a     | n/a     | n/a     | a site admin holds global scope, so no "non-owned" record exists for this role                |

Skipped routes are coverage gaps, not passes.

## Lifecycle ledger

| ID                                   | Linear    | Sev | Transition              |
| ------------------------------------ | --------- | --- | ----------------------- |
| SA-INT-01                            | MYK9-1533 | P2  | new                     |
| SA-INT-02                            | MYK9-1534 | P3  | new                     |
| SA-INT-03                            | MYK9-1535 | P3  | new                     |
| SA-INT-04                            | MYK9-1536 | P3  | unchanged (07-06 audit) |
| 07-06 support-links                  | —         | —   | resolved                |
| 07-06 dashboard-band                 | —         | —   | resolved                |
| 07-06 perm-unknown-user / roles-zero | —         | —   | resolved                |
| 07-06 template-maintenance           | —         | —   | resolved                |

## Prompt corrections

**Applied (below `# Part 2`, in this commit):** I added a "Site-admin week — measured 2026-10-30" section to `docs/qa/walks/role-intent-walk.md`. It covers:

- the MYK9-1454 production guard and the native local-stack route that replaces shared staging;
- the port collision with other sessions' stacks;
- what the local seed can and cannot show;
- `/admin/sync` being retired;
- the 07-06 audit as this role's regression baseline.

**For a human (above `# Part 2`, not applied):**

1. **"shared staging" no longer exists as a separate target.** MYK9-1454's guard states that the one Supabase project is production. Part 1 tells the walk to sign fixture accounts in, and the judge week runs the replay against "shared staging", while the same Part 1 forbids running anything against production. These conflict.

   I resolved it by walking a throwaway local stack. Part 1 should say which is intended:
   - the local native stack (my recommendation; it also allows real CRUD), or
   - an explicit `MYK9_ALLOW_PROD_E2E=1` opt-in.

   The judge-week text (`PLAYWRIGHT_AUDIT_BASE_URL` attach to a run-owned server) is now refused by `playwright.audit.config.ts` unless that opt-in is set. So the next judge week will hit the same wall.

2. The "Safe mutation boundary" says to create and edit demo records freely. On a local stack that is safe. On the production project it is not. Worth restating once item 1 is decided.
