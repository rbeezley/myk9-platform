# UX Audit: Site Admin Support And Health

**Date:** 2026-07-06
**Auditor:** Codex
**Scope:** Site admin role walkthrough in myK9Show, focused on platform health and troubleshooting.
**Login used:** `e2e-admin@test.myk9.com`; password read from `apps/myk9show/.env.local`.
**Sources:** Browser walkthrough on `http://localhost:5173`, route source in `apps/myk9show/src/routes/adminRoutes.tsx`, sidebar source in `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`, `docs/INTENT.md`.
**Follow-up status:** Updated after the admin page-pruning pass on branch `codex/admin-prune-unused-pages`.

## Routes Walked

Routes walked during the original browser audit:

- `/admin/dashboard`
- `/admin/health`
- `/admin/support`
- `/admin/users`
- `/admin/role-requests`
- `/admin/permissions`
- `/admin/permissions/roles`
- `/admin/permissions/users`
- `/admin/permissions?tab=audit`
- `/admin/payouts`
- `/admin/templates`
- `/admin/sync`
- `/admin/settings`
- `/admin/performance`
- `/admin/data-lifecycle`
- `/admin/alerts`
- `/admin/onboarding`
- `/admin/judges/analytics`
- `/admin/help`
- `/admin/analytics`
- `/admin/load-testing`

Current consolidation outcome:

- Keep as primary admin operations: `/admin/dashboard`, `/admin/health`, `/admin/support`, `/admin/users`, `/admin/role-requests`, `/admin/permissions`, `/admin/payouts`, `/admin/deleted-items`, `/admin/help`.
- Keep as secondary/specialized: `/admin/templates`, `/admin/sync`, `/admin/judges/analytics`, `/admin/load-testing` (dev-only).
- Redirect for compatibility: `/admin/data-lifecycle` -> `/admin/deleted-items`.
- Deleted as confusing or non-useful admin surfaces: `/admin/settings`, `/admin/analytics`, `/admin/onboarding`, `/admin/performance`, `/admin/alerts`.

Browser health notes:

- No console errors observed on the walked admin routes.
- No owned 4xx/5xx network responses observed in the sweep.
- Repeated warnings appeared on most routes: `PerformanceObserver does not support buffered flag with the entryTypes argument` and `[entries] Skipping remote sync without show scope`.
- `/admin/analytics` redirected to `/exhibitor/analytics`, which rendered a personal analytics placeholder. This was confusing for a site admin and has been removed from the admin route set.

## Pass 1: Mental Model Alignment

**What UI suggests:** Site admin is a platform operator who can see whether the platform is healthy, triage reported issues, inspect diagnostics, and move from summary to the place that resolves the issue.

**What it actually did before pruning:** The app had useful pieces - Support Inbox, System Health, Alerts, Sync Monitoring, Performance, Data Lifecycle, Users, Permissions, and Help - but they were mostly parallel pages. The admin often had to infer which page explained or resolved a problem.

**What changed:** Alerts and Performance were removed because they were browser-local signals, not real shared platform health. Data Lifecycle was narrowed to the real soft-delete restore concern and exposed as Deleted Items. Settings, Analytics, and Onboarding were removed as dead-end or duplicate admin routes.

**Misalignment gaps:**

| UI Element | User Expects | Actually Does | Severity |
| --- | --- | --- | --- |
| `/admin/dashboard` | "Everything looks normal" plus direct escalation paths | Shows admin cards and database counts, but not System Health, Support queue, Alerts, Sync status, or newest incidents together | High |
| `/admin/support` diagnostics | Diagnostics explain what to check next | Shows route/show/sync fields, but no links to the affected route, show, user, health, sync, or logs | High |
| `/admin/health` | Health checks prove operational readiness | Shows daily parity checks, but one check says the Edge Function response is not checked here | Medium |
| `/admin/permissions/users` | Role assignment data is trustworthy | Many rows show `Unknown User` and `Unknown Role` | High |
| `/admin/permissions/roles` | Built-in roles show their real permissions and users | Role cards show `Permissions: 0` and `Users: 0`, while overview says hundreds of effective permissions exist | High |
| `/admin/performance` | Real platform/RUM health | Showed current browser/session metrics only | Resolved: deleted |
| `/admin/alerts` | Shared actionable platform alerts | Used browser-local/localStorage alert state | Resolved: deleted |
| `/admin/data-lifecycle` | Restore/cleanup surface | Mixed real deleted-entity restore with fake/local archive scheduler and cleanup controls | Resolved: narrowed to `/admin/deleted-items` |
| `/admin/settings` | Platform-level settings are available or intentionally unavailable | Showed only "System Settings Coming Soon" | Resolved: deleted |
| `/admin/analytics` | Platform analytics | Redirected to exhibitor analytics placeholder | Resolved: deleted |

**Jargon found:** `go-live parity checks`, `cron-health-check`, `Edge Function`, `RBAC`, `effective permissions`, `compression efficiency`, `scheduler`, `collection`, raw UUIDs.

## Pass 2: Information Architecture

**Current structure:**

- Health: `/admin/health`, `/admin/sync`, `/admin/load-testing` (dev-only)
- Support: `/admin/support`, global message center, AskQ assistant
- Access: `/admin/users`, `/admin/role-requests`, `/admin/permissions`, `/admin/permissions/users`, `/admin/permissions/roles`, `/admin/rbac-test`
- Operations: `/admin/payouts`, `/admin/deleted-items`, `/admin/templates`, `/admin/judges/analytics`, `/admin/help`

**IA issues:**

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| Troubleshooting surfaces are split | Dashboard, Health, Support, Sync | Admin must know which diagnostic page to open | Add a "Platform Health" summary band to `/admin/dashboard` with deep links to existing pages, not a new page |
| Support ticket detail lacks investigation path | `/admin/support` | Ticket route/show/user IDs are static text | Convert route/show/user/trial/entry diagnostics into links where IDs are present |
| Health page lacks remediation links | `/admin/health` | Failed or ambiguous checks cannot be followed to the relevant surface | Add per-check actions: "View sync", "View payouts", "View job history", "View migrations/docs" as applicable |
| Admin nav hides several major admin routes | Sidebar | `/admin/sync`, `/admin/templates`, `/admin/judges/analytics`, and `/admin/deleted-items` are accessible but not first-class sidebar entries | Surface these through `/admin/help` and dashboard quick links; avoid bloating the sidebar |
| Role tooling is fragmented | Permissions pages | Overview, roles, user assignments, audit, and RBAC debug do not clearly explain which is for production work | Label `/admin/rbac-test` as debug-only and keep production actions in Permissions/User Roles |

**Visibility problems:**

- Hidden but should be visible: open support count, latest health status, latest sync failure, stale job state, soft-delete recovery link.
- Prominent but should be secondary: cross-role sidebar sections for secretary, exhibitor, club admin, browse while the user is in urgent site-admin mode.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element | Looks Like | Actually Is | Clear? |
| --- | --- | --- | --- |
| Support ticket diagnostics | Read-only facts | Useful investigation anchors | No |
| Support ticket status buttons | Equal choices | Workflow state changes | Partly |
| Health recent run dots | Status indicators | Hover/title history only | Partly |
| Dashboard statistic cards | Some are buttons, some are static | Only "Total Users" was clickable in the observed stats row | No |
| `/admin/templates` "Force Initialize", "Reset Templates", "Clean Duplicates" | Primary admin actions | Potentially risky maintenance actions | No |
| User table row action menus | Repeated "Open menu" buttons | Per-user actions | Partly |

**False affordances:** Admin dashboard metric cards look similarly interactive, but only some navigate.

**Hidden affordances:** Health run dots have titles, but no visible text trail or click target. Support diagnostics imply drill-down but do not link.

**Recommended fixes:**

- Make diagnostics fields actionable when possible: route link, show link, user link, sync page link, support ticket copy-link.
- Add explicit destructive/risky styling and confirmation copy for template maintenance actions.
- Make dashboard metric cards consistently clickable or consistently static.
- Give health history a compact table or expandable list in addition to dots.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step | Decisions Required | Can Be Reduced? |
| --- | --- | --- |
| Admin dashboard | Which of many admin/support/monitoring pages is the right place? | Add health/support/sync/deleted-items summary with one-click destinations |
| Support Inbox | Choose filter, ticket, status, reply, then manually interpret diagnostics | Add "next check" actions based on diagnostics |
| System Health | Interpret status, source, run age, run dots, individual checks | Add owner, last successful run, and remediation link per check |
| Sync Monitoring | Understand overall health, success rate, conflicts, compression, events, refresh interval | Make recent failures a first-class list with target/detail links |
| Permissions | Choose between overview, permissions tab, roles, users, audit, RBAC test | Separate "Manage access" from "Debug RBAC" |

**Missing defaults:**

- Support does not default to "show-day priority first" beyond a badge; it should sort urgent tickets first.
- Health does not default to an expanded failed/warning check; warnings are only visible through run dots when current status is OK.
- Sync does not focus failed/partial sync events first despite being a troubleshooting page.

**Unnecessary complexity:**

| Complexity | Who Needs It | Recommendation |
| --- | --- | --- |
| Raw UUIDs in support diagnostics and role assignment tables | Developers/support operators | Pair with human labels and keep copyable IDs secondary |
| `RBAC System Test Page` in production admin flows | Developers/admin debugging | Keep linked from Help or Permissions as debug-only, not a normal admin task |
| Template initialization/reset/cleanup controls | Maintainers | Move behind an "Advanced maintenance" section |

**Cognitive load score:** Medium-high. The individual screens are mostly understandable, but the admin has to mentally stitch them into an incident response workflow.

## Pass 5: State Coverage

### System Health

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Good | Empty is treated as failure, matching intent |
| Loading | Yes | Good | Skeleton is clear |
| Success | Yes | Good | Healthy state is glanceable |
| Partial | Partly | Fair | Recent warning dots are not explainable without hover/details |
| Error | Yes | Fair | Error says retry but offers no support/debug link |

### Support Inbox

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Good | Clear "No tickets" message |
| Loading | Yes | Good | Skeleton list appears |
| Success | Yes | Fair | Ticket and diagnostics render, but no investigation links |
| Partial | Partly | Fair | No visible empty-message state when a ticket has no thread messages |
| Error | Yes | Fair | Query errors surface, but no retry action |

### Admin Dashboard

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Partly | Fair | Zero active shows is shown, but no interpretation |
| Loading | Yes | Fair | Page eventually resolves |
| Success | Yes | Fair | Shows admin cards and stats, but not the platform-health picture |
| Partial | Partly | Poor | Individual failed widgets do not appear to degrade independently |
| Error | Unknown | Unknown | Not exercised |

### Permissions/User Roles

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Fair | Audit empty state is clear |
| Loading | Yes | Fair | Tables load |
| Success | Yes | Poor | Contradictory permission counts and "Unknown User/Role" rows erode trust |
| Partial | Yes | Poor | Missing joined labels are not explained |
| Error | Unknown | Unknown | Not exercised |

**Dead ends found:**

- `/admin/settings` was a placeholder with no next step. Resolved by removal.
- `/admin/analytics` redirected to a personal analytics placeholder. Resolved by removal.
- `/admin/performance` and `/admin/alerts` looked operational but were browser-local. Resolved by removal.
- `/admin/data-lifecycle` mixed real restore with fake/local archive and cleanup controls. Resolved by narrowing to `/admin/deleted-items`.
- Support ticket diagnostics do not provide a next step after identifying route/show/sync fields.

**Missing error handling:**

- Health check details that say a dependency was not checked should be treated as "coverage incomplete" with a clear owner/action, not buried in detail text.

## Pass 6: Flow Integrity

**Primary flow tested:** Site admin investigates reported issue and checks platform health.

**Step-by-step findings:**

| Step | Action | Friction | Severity |
| --- | --- | --- | --- |
| 1 | Sign in as site admin | Two-step sign-in worked; brief "Preparing workspace" state resolved | Low |
| 2 | Land on `/admin/dashboard` | Dashboard does not answer "is the platform healthy?" in one place | High |
| 3 | Open `/admin/support` | Ticket list and diagnostics are clear, but diagnostics are not actionable | High |
| 4 | Try to understand affected context | Route and show ID are raw/copy-only, no direct jump to the reported page/show | High |
| 5 | Open `/admin/health` | Overall state is clear | Low |
| 6 | Interpret health check details | "Edge Function response not checked here" creates uncertainty with no link to logs/payouts | Medium |
| 7 | Open related admin pages | Sync, Payouts, Deleted Items, and Help have useful data but are not cross-linked from Support/Health | Medium |
| 8 | Check access/permissions | Role pages expose contradictory or missing labels | High |

**Abandonment risks:**

- Admin sees a support ticket but cannot jump to the user/show/route involved.
- Admin sees "healthy" while a health detail admits a dependency was not actually verified.
- Admin tries to use permissions pages for access troubleshooting and sees unknown users/roles.

**Recovery gaps:**

- Missing back/undo: not observed as a major issue.
- No cancel option: not assessed because no mutations were performed.
- Destructive with no confirm: template maintenance controls look risky; confirmation behavior was not tested.

**Flow verdict:** Completable with friction. The pages load and expose useful information, but they do not yet behave like a coherent incident-response console.

## Summary

**Overall UX health:** Needs Work.

### Critical

None observed in the browser walkthrough.

### High Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Dashboard does not summarize health/support/sync together | 1, 2, 6 | Admin cannot quickly answer "is the platform healthy?" | Medium |
| Support diagnostics are not actionable | 1, 2, 3, 6 | Admin must manually copy IDs and guess the next page | Medium |
| Permission role/user pages show unknown or contradictory data | 1, 5, 6 | Access troubleshooting becomes untrustworthy | Medium |

### Medium Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Health checks lack remediation links and ownership | 2, 4, 6 | Admin sees status but not what to do next | Low-medium |
| Deleted pages need stale-link cleanup in docs/help/search | 1, 5 | Old links or discovery flows could cause confusion | Low |
| Advanced maintenance actions are too prominent in Templates | 3, 4 | Admin may hesitate or misuse risky actions | Low-medium |
| Mobile Health truncates check names/details | 3, 5 | On-call mobile review loses key diagnostic context | Low |

### Low Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Repeated console warnings add QA noise | 5 | Makes route audits harder to interpret | Low |
| Sidebar exposes many non-admin role sections during admin work | 2, 4 | Adds scanning cost | Medium |

### Quick Wins

- Add Support and Health counts to `/admin/dashboard`: open tickets, show-day priority tickets, latest health state, latest sync failure, and Deleted Items count.
- Convert Support diagnostics into links where data exists: route, show, trial, entry, user, sync monitoring.
- Add a "Copy diagnostics" button to Support Inbox for escalating tickets.
- Add "View related page" actions to each health check.
- Keep `/admin/data-lifecycle` as a redirect to `/admin/deleted-items` until stale external references age out.
- Fix role joins/counts before relying on Permissions for admin troubleshooting.

### Recommendations

1. Tighten rather than duplicate: keep Support, Health, Sync, Deleted Items, and Permissions as the admin troubleshooting surfaces, connected with deep links and dashboard summary cards.
2. Make Support the incident hub: every ticket should show "who, where, what changed, current health, current sync state" with direct jumps.
3. Make Health actionable: a failed, stale, warning, or incomplete check should always name the owner surface and next step.
4. Repair permissions data presentation before launch readiness work depends on it.
5. Move debug/maintenance tools behind clearer advanced/debug labels so the normal site-admin path stays calm.
