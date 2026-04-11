# Feature Audit — Fall 2026

> Classification of every page and feature in myK9Show against the fall 2026 golden paths.
> Reference journeys: [`docs/journeys/secretary.md`](journeys/secretary.md) · [`docs/journeys/exhibitor.md`](journeys/exhibitor.md)

## Classification Labels

| Label             | Meaning                                                                       |
| ----------------- | ----------------------------------------------------------------------------- |
| **critical-path** | On the secretary or exhibitor golden path; must work perfectly for fall 2026  |
| **park**          | Real feature, not on the fall golden path; hide from nav, revisit post-launch |
| **delete/hide**   | Demo page, dev artifact, duplicate, or privacy risk; remove from router       |

## Classification Rules

- If a page is a named step in `docs/journeys/secretary.md` or `docs/journeys/exhibitor.md` → **critical-path**
- If a page is real but not in either journey → **park** (unless auth/legal infrastructure)
- If a page has "Demo", "Test", or "Sync" in the name and is not user-facing → **delete/hide**
- Judge/steward pages → **park** (myK9Q is the primary judge surface for fall)
- Admin: Dashboard, Users, Roles & Permissions → **critical-path**; Performance Mode, Load Testing, Sync, Data Lifecycle → **park**

---

## Section 1: Secretary (Manage nav group)

| Page / Feature              | Route                         | Classification | Rationale                                                                     |
| --------------------------- | ----------------------------- | -------------- | ----------------------------------------------------------------------------- |
| Pipeline (Mission Control)  | /secretary/dashboard          | critical-path  | Secretary journey Phase 1 Step 1 — secretary home screen                      |
| Create Show                 | /secretary/create-show        | critical-path  | Phase 1 Steps 2–7 — 4-step wizard                                             |
| Entries                     | /secretary/entries            | critical-path  | Phase 2 (accept/waitlist/reject, add mail-in); Phase 4 payment reconciliation |
| Day-of Ops                  | /secretary/day-of             | critical-path  | Phase 3 hub — check-in, day-of entry, scratch, move-up                        |
| Check-In                    | /secretary/check-in           | critical-path  | Phase 3 Step 2 — search by armband, mark checked in                           |
| Volunteers                  | /secretary/volunteers         | park           | Real feature; day-of reassignment deferred post-fall                          |
| Tasks                       | /secretary/tasks              | critical-path  | Phase 3 Step 7 — Kanban task board for show-day ops                           |
| Run Orders                  | /secretary/run-order          | critical-path  | Phase 3 Step 6 — review sequence, ring assignments, export                    |
| Settings                    | /secretary/settings           | critical-path  | Show configuration; secretaries need this to manage their show                |
| Wait List                   | /secretary/waitlist           | critical-path  | Phase 2 Steps 3–4 — waitlist, offer spot, promote to accepted                 |
| Messages                    | /secretary/messages           | critical-path  | Phase 2 Step 6 — send entry confirmations and waitlist notices                |
| Reports                     | /secretary/reports            | critical-path  | Phase 4 Steps 3–4 — results catalog, judge report, AKC forms, result labels   |
| Submit Results              | /secretary/results-submission | critical-path  | Phase 4 Step 5 — AKC XML preview and download                                 |
| Results Control             | /secretary/results-control    | critical-path  | Phase 4 Steps 1–2 — verify all results, release to exhibitors                 |
| Show Management (Close Out) | (not yet routed)              | critical-path  | Phase 4 Step 7 — Close Out Show cascade; fall deliverable, not yet built      |
| SecretaryDashboard (legacy) | (legacy route)                | delete/hide    | Superseded by PipelineDashboard; dev artifact                                 |

---

## Section 2: Exhibitor (exhibitor-only sidebar)

| Page / Feature             | Route                   | Classification | Rationale                                                                             |
| -------------------------- | ----------------------- | -------------- | ------------------------------------------------------------------------------------- |
| Home (Exhibitor Dashboard) | /exhibitor/dashboard    | critical-path  | Exhibitor home screen after login — must show upcoming entries and pending actions    |
| Show Day                   | /exhibitor/show-day     | critical-path  | Phase 4 Step 1 — show hero, self check-in, live results                               |
| My Dogs                    | /dogs                   | critical-path  | Required for first-time exhibitors — must add at least one dog before entering a show |
| My Entries                 | /exhibitor/entries      | critical-path  | Phase 3 Step 1 — Pending/Accepted/Waitlisted tabs                                     |
| Find Shows                 | /shows                  | critical-path  | Phase 1 Step 1 — unauthenticated browse; canonical entry point                        |
| Clubs                      | /clubs                  | park           | Real discovery feature; not in either journey                                         |
| Calendar                   | /calendar               | park           | Real feature; not in either journey                                                   |
| Settings (Preferences)     | /preferences            | critical-path  | Exhibitor account and notification preferences; needed for a complete experience      |
| Messages                   | /messages/:showId       | park           | Exhibitor ↔ secretary chat; not in exhibitor journey steps                            |
| Registration Wizard        | /shows/:showId/register | critical-path  | Phase 2 Steps 1–3 — class selection, entry agreement, payment                         |
| Cart                       | /cart                   | critical-path  | Phase 2 Step 3 — Stripe checkout                                                      |
| Checkout Success           | /checkout/success       | critical-path  | Phase 2 Step 4 — confirmation + "What happens next?"                                  |
| Checkout Cancel            | /checkout/cancel        | park           | Edge-case cancel path; not a named journey step                                       |
| Profile                    | /profile                | critical-path  | Exhibitor identity; needed for a complete account experience                          |
| Subscription               | /subscription           | park           | Real feature; not in journey                                                          |

---

## Section 3: Admin (Admin nav group)

| Page / Feature      | Route                    | Classification | Rationale                                                             |
| ------------------- | ------------------------ | -------------- | --------------------------------------------------------------------- |
| Dashboard           | /admin/dashboard         | critical-path  | Admin home; per classification rules                                  |
| Alerts              | /admin/alerts            | park           | Real operational tool; not in critical-path list                      |
| Performance         | /admin/performance       | park           | Real tool; not in critical-path list                                  |
| Analytics           | /admin/analytics         | park           | Real tool; not in critical-path list                                  |
| Data Lifecycle      | /admin/data-lifecycle    | park           | Per rules                                                             |
| Performance Mode    | /admin/performance-mode  | park           | Per rules; no active route in adminRoutes.tsx — nav item may be stale |
| Load Testing        | /admin/load-testing      | park           | Per rules; already DEV-gated in adminRoutes.tsx                       |
| Sync                | /admin/sync              | park           | Per rules                                                             |
| Users               | /admin/users             | critical-path  | Per classification rules                                              |
| Roles & Permissions | /admin/permissions       | critical-path  | Per classification rules                                              |
| Permission Audit    | /admin/permissions/audit | park           | Useful ops tool; not in critical-path list                            |
| Templates           | /admin/templates         | park           | Real feature (scoresheet templates); not in critical-path list        |
| Onboarding          | /admin/onboarding        | park           | Real feature; not in critical-path list                               |

---

## Section 4: Judge / Steward (Judging nav group)

| Page / Feature         | Route              | Classification | Rationale                                                                          |
| ---------------------- | ------------------ | -------------- | ---------------------------------------------------------------------------------- |
| Dashboard              | /judge/dashboard   | park           | Judge pages → park per rules; myK9Q is primary for fall                            |
| My Stats               | /judge/stats       | park           | Judge pages → park per rules                                                       |
| Check-In               | /judge/check-in    | park           | Judge pages → park per rules                                                       |
| JudgeScoringPage       | /scoring/\*        | delete/hide    | myK9Q owns scoring; duplicate surface splits maintenance and causes user confusion |
| Result Entry Dashboard | /results/dashboard | park           | Judge-accessible; myK9Q is canonical scoring surface for fall                      |

---

## Section 5: Browse / Public (shared browse and discovery pages)

| Page / Feature | Route             | Classification | Rationale                                                                    |
| -------------- | ----------------- | -------------- | ---------------------------------------------------------------------------- |
| Browse Shows   | /shows            | critical-path  | Exhibitor journey Phase 1 Step 1 — unauthenticated discovery                 |
| Show Details   | /shows/:id        | critical-path  | Phase 1 Step 3 — hero, class list, entry status, "Enter This Show" CTA       |
| Browse Clubs   | /clubs            | park           | Real discovery feature; not in either journey                                |
| Club Detail    | /clubs/:id        | park           | Real feature; not in journey                                                 |
| Browse Dogs    | /dogs             | park           | My Dogs feature; not a named journey step                                    |
| Dog Detail     | /dogs/:id         | park           | Real feature; not in journey                                                 |
| Browse People  | /people           | delete/hide    | Privacy risk (searchable user directory); not in any journey                 |
| Person Detail  | /users/:id        | delete/hide    | Privacy risk; not in any journey                                             |
| Class Details  | /classes/:classId | park           | Real feature; exhibitors access run order through ShowDetailsPage in journey |
| TV Display     | /tv/:showId       | park           | Real ring-TV feature; not on either golden path                              |

---

## Section 6: Utility / Infrastructure

| Page / Feature          | Route                | Classification | Rationale                                                    |
| ----------------------- | -------------------- | -------------- | ------------------------------------------------------------ |
| Home / Landing          | /                    | critical-path  | Auth entry point; redirects authenticated users to role home |
| Sign In                 | /sign-in             | critical-path  | Auth infrastructure                                          |
| Sign Up                 | /sign-up             | critical-path  | Auth infrastructure                                          |
| Forgot Password         | /forgot-password     | critical-path  | Auth infrastructure                                          |
| Reset Password          | /reset-password      | critical-path  | Auth infrastructure                                          |
| Auth Callback           | /auth/callback       | critical-path  | OAuth callback — required for auth flow                      |
| Legal (Terms / Privacy) | /terms, /privacy     | critical-path  | Required legal pages                                         |
| Pricing                 | /pricing-page        | park           | Business info; not in either journey                         |
| Offline Test            | /offline-test        | delete/hide    | "Test" in name per rules; dev artifact                       |
| Sync Dashboard Demo     | /sync-dashboard-demo | delete/hide    | "Demo" in name per rules; dev artifact                       |
| Scoring Demo            | /scoring-demo        | delete/hide    | "Demo" in name per rules; dev artifact                       |
