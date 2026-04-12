# Navigation & IA Sketch — Fall 2026

> Phase 1 execution reference. Answers three questions: where each role lands, what gets merged or removed, and what still needs to be built.
> Source documents: [`docs/feature-audit-2026.md`](feature-audit-2026.md) · [`docs/journeys/secretary.md`](journeys/secretary.md) · [`docs/journeys/exhibitor.md`](journeys/exhibitor.md)

---

## 1. Role Home Screens

**Secretary** → `/secretary/dashboard` (Mission Control / PipelineDashboard)

At a glance: upcoming shows list with pipeline phase badge (Setup / Accepting Entries / Day-of / Closeout) per show. Fall 2026 Manage nav: Pipeline, Create Show, Entries, Wait List, Day-of Ops, Check-In, Tasks, Run Orders, Messages, Reports, **Results Control** _(add to sidebar — critical-path, currently missing)_, Submit Results. Hide from nav: Volunteers, Settings (both parked).

**Exhibitor** → `/exhibitor/dashboard`

Dedicated exhibitor home screen. At a glance: upcoming entries with status (Pending / Accepted / Waitlisted), next show date and class, quick links to Find Shows and My Dogs. Fall 2026 nav: Home (`/exhibitor/dashboard`), Find Shows (`/shows`), My Dogs (`/dogs`), My Entries (`/exhibitor/entries`), Show Day (`/exhibitor/show-day`), Profile (`/profile`), Settings (`/preferences`). Hide from nav: Clubs, Calendar, Messages (all parked).

**Admin** → `/admin/dashboard`

At a glance: system health overview. Fall 2026 nav: Dashboard, Users, Roles & Permissions only. All other admin items hidden.

**Judge / Steward** → deferred. All judge routes parked; myK9Q is the primary judge surface for fall. Remove Judging section from nav entirely.

---

## 2. Consolidation Decisions

| Current page(s)                                                                                                    | Disposition                 | Destination                                     | Notes                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Class Details `/classes/:classId`                                                                                  | park → tab                  | Tab of Show Details `/shows/:id`                | Exhibitors reach run order through ShowDetailsPage in the journey; standalone route unnecessary                                                                                                 |
| Wait List `/secretary/waitlist`                                                                                    | keep, consolidate nav       | Tab of Entries `/secretary/entries`             | Phase 2 interleaves accepting and waitlisting; single entry-management hub is cleaner                                                                                                           |
| Check-In `/secretary/check-in`                                                                                     | keep, consolidate nav       | Tab of Day-of Ops `/secretary/day-of`           | Phase 3 Step 2; check-in is a Day-of Ops operation                                                                                                                                              |
| Permission Audit `/admin/permissions/audit`                                                                        | park → tab                  | Tab of Roles & Permissions `/admin/permissions` | Keeps admin nav to 3 items; audit is a subview of permissions                                                                                                                                   |
| Exhibitor Dashboard `/exhibitor/dashboard`                                                                         | keep                        | Exhibitor home screen                           | Critical-path; must show upcoming entries, status, and quick nav                                                                                                                                |
| SecretaryDashboard (legacy)                                                                                        | delete/hide after migration | Remove from router after porting features       | Before deleting: port Clone Show and quick-action shortcuts (result entry, export reports, pending issues) into PipelineDashboard. Completed Trials tab → verify coverage in existing pipeline. |
| JudgeScoringPage `/scoring/*`                                                                                      | delete/hide                 | Remove from router                              | myK9Q owns scoring; duplicate surface splits maintenance                                                                                                                                        |
| Browse People `/people`, Person Detail `/users/:id`                                                                | keep, restrict              | Secretary + admin only; hide from exhibitor nav | Privacy risk if open to all; secretary needs it for mail-in entry lookup, admin for user mgmt                                                                                                   |
| Offline Test, Sync Dashboard Demo, Scoring Demo                                                                    | delete/hide                 | Remove from router                              | Dev/demo artifacts per classification rules                                                                                                                                                     |
| Entry History `/exhibitor/entries/history`                                                                         | remove from sidebar         | Remove from nav                                 | Not in feature audit or any journey step; spurious nav item                                                                                                                                     |
| Browse Clubs `/clubs`, Calendar `/calendar`                                                                        | park                        | Hide from nav                                   | Real features, not on fall golden path; no consolidation needed                                                                                                                                 |
| Result Entry Dashboard `/results/dashboard`, TV Display `/tv/:showId`                                              | park                        | Hide from nav                                   | Not on golden path; myK9Q is canonical for scoring                                                                                                                                              |
| Admin: Alerts, Performance, Analytics, Data Lifecycle, Performance Mode, Load Testing, Sync, Templates, Onboarding | park                        | Hide from nav                                   | All per classification rules                                                                                                                                                                    |
| Judging section: `/judge/dashboard`, `/judge/stats`, `/judge/check-in`                                             | park                        | Hide from nav (remove section)                  | Deferred to post-fall                                                                                                                                                                           |

---

## 3. New Routes Needed

Only one route is required by the approved journeys and does not currently exist:

- **`/secretary/show-management`** (or similar)
  - Purpose: Close Out Show — cascade-close all open trials and classes, archive the show
  - Journey: Secretary Phase 4 Step 7
  - Requires login: yes (secretary role)
  - Note: Feature audit marks this "(not yet routed), fall 2026 deliverable." Verify the action name and cascade behavior before Phase 2 implementation.

**Sidebar gap** (route exists, not a new route, but must be fixed in Phase 1):

- **`/secretary/results-control`** — Phase 4 Steps 1–2 (verify all results, release to exhibitors). Route and page exist; missing from Manage group in `unifiedSidebarConfig.ts`. Add it between Reports and Submit Results.
