# myK9 Platform — Feature Inventory & Audit

**Date:** 2026-04-04

## Priority Key

- **Must Have** — Core functionality; without it the product doesn't work for that role
- **Nice to Have** — Real value, not blocking, can be deferred
- **Consider Hiding/Deleting** — Dev artifacts, duplicates, placeholder pages, or low ROI

---

## myK9Show

### Public / Unauthenticated

| Feature                                      | Route                             | Priority            | Notes                                           |
| -------------------------------------------- | --------------------------------- | ------------------- | ----------------------------------------------- |
| Landing / Sign In / Sign Up / Password Reset | `/`, `/sign-in`, `/sign-up`, etc. | **Must Have**       | Auth flow                                       |
| Browse Shows                                 | `/shows`                          | **Must Have**       | Primary discovery entry point                   |
| Show Details                                 | `/shows/:id`                      | **Must Have**       | Core public info                                |
| Trial Details                                | `/shows/:showId/trials/:trialId`  | **Must Have**       |                                                 |
| Class Details                                | `/classes/:classId`               | **Must Have**       | Results + run order                             |
| TV Run Order Display                         | `/tv/:showId`                     | **Must Have**       | PR #41 complete                                 |
| Pricing Page                                 | `/pricing-page`                   | **Must Have**       | Business-critical                               |
| Browse Clubs                                 | `/clubs`                          | Nice to Have        | Low traffic until user base grows               |
| Club Detail                                  | `/clubs/:id`                      | Nice to Have        |                                                 |
| Browse People                                | `/people`, `/users/:id`           | **Consider Hiding** | Privacy risk; no clear user value at this stage |

---

### Exhibitor

| Feature                             | Route                          | Priority      | Notes                       |
| ----------------------------------- | ------------------------------ | ------------- | --------------------------- |
| Exhibitor Dashboard                 | `/exhibitor/dashboard`         | **Must Have** | Home hub                    |
| Dog Registry (list + detail)        | `/dogs`, `/dogs/:id`           | **Must Have** |                             |
| My Entries                          | `/my-entries`                  | **Must Have** |                             |
| My Entries History                  | `/exhibitor/entries/history`   | Nice to Have  |                             |
| Show Day Companion                  | `/exhibitor/show-day`          | **Must Have** | Live run order, ring status |
| Class Check-In                      | `/exhibitor/check-in/:entryId` | **Must Have** |                             |
| Registration Wizard                 | `/shows/:showId/register`      | **Must Have** | Core revenue flow           |
| Cart                                | `/cart`                        | **Must Have** |                             |
| Checkout Success / Cancel           | `/checkout/*`                  | **Must Have** |                             |
| Profile                             | `/profile`                     | **Must Have** |                             |
| Preferences (notifications + voice) | `/preferences`                 | **Must Have** | Voice settings done         |
| Calendar                            | `/calendar`                    | Nice to Have  |                             |
| Subscription Management             | `/subscription`                | **Must Have** |                             |
| Messages (exhibitor ↔ secretary)    | `/messages/:showId`            | Nice to Have  |                             |

---

### Judge (in myK9Show)

| Feature                                | Route                | Priority              | Notes                                                             |
| -------------------------------------- | -------------------- | --------------------- | ----------------------------------------------------------------- |
| Judge Dashboard                        | `/judge/dashboard`   | Nice to Have          | Duplicate of myK9Q; consider redirecting there                    |
| Judge Check-In                         | `/judge/check-in`    | Nice to Have          |                                                                   |
| Scoring pages (entry list, scoresheet) | `/scoring/*`         | **Consider Hiding**   | myK9Q owns scoring. Two surfaces = confusion + split maintenance. |
| Judge Stats                            | `/judge/stats`       | Nice to Have          | Could fold into exhibitor analytics section                       |
| Results Dashboard                      | `/results/dashboard` | Nice to Have          |                                                                   |
| Scoring Demo                           | `/scoring-demo`      | **Consider Deleting** | Dev artifact                                                      |

---

### Secretary

| Feature                     | Route                           | Priority            | Notes                                                                  |
| --------------------------- | ------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| Secretary Dashboard         | `/secretary/dashboard`          | **Must Have**       |                                                                        |
| Trial Pipeline              | `/secretary/pipeline/:trialId`  | **Must Have**       |                                                                        |
| Create Show (wizard)        | `/secretary/create-show/wizard` | **Must Have**       |                                                                        |
| Create Show (flat form)     | `/secretary/create-show`        | **Consider Hiding** | Duplicate of wizard — keep one                                         |
| Class Management + Creation | `/trials/:trialId/classes`      | **Must Have**       |                                                                        |
| Secretary Class Dashboard   | `/classes/:classId/secretary`   | **Must Have**       |                                                                        |
| Run Order Management        | `/secretary/run-order`          | **Must Have**       |                                                                        |
| Entry Management            | `/secretary/entries/:showId`    | **Must Have**       |                                                                        |
| Waitlist Management         | `/secretary/waitlist`           | **Must Have**       |                                                                        |
| Day of Operations           | `/secretary/day-of`             | **Must Have**       |                                                                        |
| Check-In Report             | `/secretary/check-in`           | **Must Have**       |                                                                        |
| Results Control             | `/secretary/results-control`    | **Must Have**       | PR #37 complete                                                        |
| Show Settings               | `/secretary/settings`           | **Must Have**       |                                                                        |
| Secretary Messages          | `/secretary/messages/:showId`   | Nice to Have        |                                                                        |
| Volunteer Scheduling        | `/secretary/volunteers`         | Nice to Have        |                                                                        |
| Secretary Tasks (checklist) | `/secretary/tasks`              | Nice to Have        |                                                                        |
| Sync Dashboard              | `/sync/dashboard`               | **Consider Hiding** | Technical; secretary shouldn't need to see replication queue internals |

---

### Admin (Site Admin)

| Feature                      | Route                      | Priority              | Notes                                      |
| ---------------------------- | -------------------------- | --------------------- | ------------------------------------------ |
| Admin Dashboard              | `/admin/dashboard`         | **Must Have**         |                                            |
| User Management              | `/admin/users`             | **Must Have**         |                                            |
| Template Management + Editor | `/admin/templates`         | **Must Have**         | Scoresheet templates                       |
| Permission / Role Management | `/admin/permissions/*`     | **Must Have**         | RBAC system                                |
| Permission Audit Log         | `/admin/permissions/audit` | Nice to Have          |                                            |
| Onboarding Requests          | `/admin/onboarding`        | Nice to Have          |                                            |
| Sync Monitoring              | `/admin/sync`              | Nice to Have          |                                            |
| Analytics                    | `/admin/analytics`         | Nice to Have          |                                            |
| Judge Analytics              | `/admin/judges/analytics`  | Nice to Have          |                                            |
| Alerts                       | `/admin/alerts`            | Nice to Have          |                                            |
| System Settings              | `/admin/settings`          | Nice to Have          | Placeholder                                |
| Performance Dashboard        | `/admin/performance`       | Nice to Have          | Heavy component                            |
| Data Lifecycle Management    | `/admin/data-lifecycle`    | Nice to Have          | GDPR/archive                               |
| Performance Mode Toggle      | `/admin/performance-mode`  | **Consider Deleting** | Dev tooling leaked into prod routes        |
| Load Testing                 | `/admin/load-testing`      | **Consider Deleting** | Dev only — should not be reachable in prod |
| Permission Test              | `/admin/permission-test`   | **Consider Deleting** | Dev only                                   |
| RBAC Test                    | `/admin/rbac-test`         | **Consider Deleting** | Dev only                                   |

---

### Club Admin

| Feature      | Route                 | Priority      | Notes                      |
| ------------ | --------------------- | ------------- | -------------------------- |
| Club Members | `/club-admin/members` | **Must Have** | Only feature for this role |

---

### Dev / Test / Demo Pages (myK9Show)

| Feature                   | Route                  | Priority   |
| ------------------------- | ---------------------- | ---------- |
| Test Panel                | `/test-panels`         | **Delete** |
| Class Templates test page | `/class-templates`     | **Delete** |
| Offline Test              | `/offline-test`        | **Delete** |
| Sync Dashboard Demo       | `/sync-dashboard-demo` | **Delete** |

---

## myK9Q

### Core Ringside (Judges, Stewards, Timers)

| Feature                                                                                      | Route                           | Priority            | Notes                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------- | ------------------- | ------------------------------------------------------------ |
| Login (passcode)                                                                             | `/login`                        | **Must Have**       |                                                              |
| Home / Show selector                                                                         | `/home`                         | **Must Have**       |                                                              |
| Show Details                                                                                 | `/show/:licenseKey`             | **Must Have**       |                                                              |
| Trial Classes                                                                                | `/trial/:trialId/classes`       | **Must Have**       |                                                              |
| Entry List                                                                                   | `/class/:classId/entries`       | **Must Have**       |                                                              |
| Combined Entry List                                                                          | `/class/:a/:b/entries/combined` | **Must Have**       |                                                              |
| All Scoresheets (UKC Obedience, UKC Rally, UKC Nosework, AKC Scent Work, AKC Fast CAT, ASCA) | `/scoresheet/*`                 | **Must Have**       | Core product                                                 |
| Results                                                                                      | `/results`                      | **Must Have**       |                                                              |
| Announcements                                                                                | `/announcements`                | **Must Have**       |                                                              |
| Settings (haptic, voice, ring mode)                                                          | `/settings`                     | **Must Have**       |                                                              |
| Dog Details                                                                                  | `/dog/:armband`                 | Nice to Have        |                                                              |
| Statistics                                                                                   | `/stats/*`                      | Nice to Have        |                                                              |
| Admin Metrics                                                                                | `/admin/metrics`                | Nice to Have        |                                                              |
| Audit Log                                                                                    | `/admin/:licenseKey/audit-log`  | Nice to Have        |                                                              |
| Trial Secretary                                                                              | `/secretary`                    | Nice to Have        | Planned integration                                          |
| TV Run Order                                                                                 | `/tv/:licenseKey`               | **Consider Hiding** | Duplicate of myK9Show `/tv/:showId` — pick one canonical URL |

### Dev / Test Pages (myK9Q)

| Feature               | Route                  | Priority   |
| --------------------- | ---------------------- | ---------- |
| Wireframe: Nationals  | `/wireframe/nationals` | **Delete** |
| Status Popup Demo     | `/demo/status-popup`   | **Delete** |
| Test Connections      | `/test-connections`    | **Delete** |
| Database Test / Debug | `/debug`               | **Delete** |
| Migration Test        | `/migration-test`      | **Delete** |
| Test Scoresheet       | `/test/scoresheet`     | **Delete** |

---

## Cross-Cutting Issues

1. **Judge scoring in myK9Show is a problem.** Scoring pages exist in both apps. The architecture decision is that myK9Q owns ringside operations. The myK9Show scoring routes should either be removed or redirect to myK9Q. Having two surfaces means two codepaths to maintain and potential user confusion.

2. **Dev/test routes reachable in prod.** Both apps have 6–10 dev-only routes (`/debug`, `/load-testing`, `/test-panels`, etc.) reachable in staging/prod. These should be removed or gated behind `import.meta.env.DEV`.

3. **Browse People is a privacy concern.** A searchable directory of all platform users with roles has no identified use case and creates unnecessary data exposure. Remove unless there is a specific justified need.

4. **Create Show has two routes.** The flat form and the wizard exist as separate routes. Keep the wizard; remove or redirect the flat form.

5. **TV Run Order duplication.** Both apps have a `/tv/:id` route. The myK9Show version (PR #41) is more complete and should be the canonical URL. Ensure QR codes point there; consider removing the myK9Q version or making it a redirect.

6. **Sync Dashboard exposed to secretary.** `/sync/dashboard` is a technical operations page about replication queue internals. Move to admin-only or remove from secretary navigation entirely.
