# Workflow Source Map

Maps user workflows to their canonical routes in myK9Show. The per-route inventory lives in `apps/myk9show/src/features/admin-help/data/pageDirectory.ts` (test-synced to the route registry via `pageDirectory.test.ts`) — this file adds only the layer `pageDirectory.ts` does not have: the mapping from _user outcomes_ to route(s).

**Do not restate per-route data.** Reference routes by path only so staleness is greppable.

---

## Sidebar vs pageDirectory Gap Audit

Routes visible in the sidebar (`unifiedSidebarConfig.ts`) that are **not yet in `pageDirectory.ts`**. These are gaps — add them to `pageDirectory.ts` before they can be documented.

All sidebar-visible routes are now cataloged in `pageDirectory.ts` — there are no remaining gaps. The admin user-management, role-requests, payout-ledger, and people surfaces were cataloged in #1002; the exhibitor and club-admin payment surfaces in #1014 (after re-verifying Exhibitor Guide § Payments and Club Admin Guide § Members / § Payments).

---

## Routes Excluded from Customer Docs

These routes exist in `pageDirectory.ts` but should not appear in customer-facing documentation.

| Route                   | Reason                                         |
| ----------------------- | ---------------------------------------------- |
| `/admin/load-testing`   | `classification: hidden`, dev-only             |
| `/admin/sync`           | Internal telemetry                             |
| `/admin/deleted-items`  | Internal admin recovery tool                   |
| `/browse-shows`         | Backwards-compat redirect                      |
| `/my-entries`           | Backwards-compat redirect                      |
| `/registration`         | Legacy alias / stub                            |
| `/trials/:trialId`      | Legacy path — document the nested path instead |
| `/classes/:classId`     | Legacy path                                    |
| `/judge/dashboard`      | `classification: park`, parked for fall        |
| `/judge/assignments`    | `classification: park`, parked for fall        |
| `/tv/:showId`           | Staff/venue internal tool                      |

---

## Exhibitor Workflows

### 1. Discover and browse shows

**Outcome:** Exhibitor finds an upcoming show with an open entry window.
**Canonical routes:** `/shows` → `/shows/:id` → `/shows/:showId/trials/:trialId`
**Docs target:** Exhibitor Guide § Discovery

### 2. Create an account and add a dog

**Outcome:** First-time exhibitor creates an account and registers their dog before entering.
**Canonical routes:** `/sign-up` → `/dogs` → `/dogs/:id` _(source-map re-verified 2026-08-04)_
**Note:** Source-map entry re-verified 2026-08-04 after route definitions moved into the centralized router; the guide-facing account flow is unchanged.
**Docs target:** Exhibitor Guide § Account Setup, KB: `create-account.md`

### 2a. Manage profile, preferences, and account settings

**Outcome:** Signed-in users update their personal profile, notification preferences, and advanced account settings from one consolidated surface.
**Canonical route:** `/account`
**Docs target:** Exhibitor Guide § Account Setup, KB: Account access

### 3. Enter a show online

**Outcome:** Exhibitor submits an entry and pays via Stripe.
**Canonical routes:** `/shows/:showId/register` → `/cart` → `/checkout/success`
**Docs target:** Exhibitor Guide § Entry & Payment, KB: `enter-a-show.md`

### 4. Track entry status before the show

**Outcome:** Exhibitor sees whether their entry is Pending, Accepted, or Waitlisted.
**Canonical route:** `/exhibitor/entries`
**Docs target:** Exhibitor Guide § Pre-Show, KB: `entry-status.md`

### 5. View the run order before show day

**Outcome:** Exhibitor knows when their class runs, their ring, and their armband number.
**Canonical routes:** `/shows/:id` (Classes tab) → `/shows/:showId/trials/:trialId`
**Docs target:** Exhibitor Guide § Pre-Show

### 6. Check in on show day

**Outcome:** Exhibitor marks themselves present for a class.
**Canonical route:** `/at-show` (permanent **Show day** sidebar entry for exhibitor-only users; **Ringside** for staff roles) **or** `/at-show/:showId` (via ShowTodayBanner on `/exhibitor/entries`) → `/exhibitor/check-in/:entryId` _(source-map re-verified 2026-08-04)_
**Note:** Re-verified 2026-07-02 for #1088. The bare `/at-show` link resolves the live show at the destination via `RingsideEntryPage`; exhibitor-only navigation labels it **Show day** so the guide should not instruct exhibitors to look for **Ringside** in the sidebar. Staff roles still see **Ringside**. The context-aware ShowTodayBanner on My Shows appears only on show day. As of #949/#950, exhibitor self-check-in is gated on a secretary toggle and routed through the `self_checkin_entry` RPC — guides must not promise self-check-in unconditionally.
**Source-map note:** Re-verified 2026-08-04 after route definitions moved into the centralized router; the guide-facing show-day flow is unchanged.
**Docs target:** Exhibitor Guide § Show Day, KB: `check-in.md`

### 7. View results

**Outcome:** Exhibitor sees their dog's placement, Q/NQ, and time after the class is complete.
**Canonical routes:** `/exhibitor/entries` (result badge) → `/shows/:showId/trials/:trialId/classes/:classId/results`
**Docs target:** Exhibitor Guide § Results, KB: `view-results.md`

### 8. Message the show team

**Outcome:** Exhibitor sends a message to the trial secretary for a specific show.
**Canonical route:** `/messages/:showId` (reached via My Shows entry card)
**Docs target:** Exhibitor Guide § Communications

### 9. Manage dog profiles

**Outcome:** Exhibitor adds a dog, updates registration numbers, or views history.
**Canonical routes:** `/dogs` → `/dogs/:id`
**Docs target:** Exhibitor Guide § Dogs

### 10. View payments and receipts

**Outcome:** Exhibitor reviews what they paid; the Receipt column links to My Shows where the per-entry receipt lives.
**Canonical route:** `/exhibitor/payments`
**Note:** Cataloged in `pageDirectory.ts`; reachable from the sidebar as **My Payments**.
**Docs target:** Exhibitor Guide § Payments, KB: `my-payments.md`

### 11. View personal analytics

**Outcome:** Exhibitor sees their career stats, Qs, and title progress.
**Canonical route:** `/exhibitor/analytics` (dedicated analytics page; no sidebar shortcut as of #1088)
**Note:** Re-verified 2026-07-02 for #1088. The sidebar **My Stats** shortcut and in-show `my-stats` tab path were removed; the analytics page itself remains reachable from dog activity/show-action links.
**Docs target:** Exhibitor Guide § Stats (lower priority for initial guides)

---

## Secretary Workflows

### 12. Create a show

**Outcome:** Secretary creates a show with trials, classes, judges, and entry dates, and publishes it.
**Canonical route:** `/secretary/create-show/wizard` _(source-map re-verified 2026-09-01)_
**Entry point:** Secretary Dashboard → Create Show
**Alternate route:** `/shows/new` redirects here for callers using the conventional creation URL.
**Note:** Source-map entry re-verified 2026-09-01 after adding the `/shows/new` redirect; the guide-facing show-creation flow is unchanged.
**Docs target:** Secretary Guide § Setup, KB: `create-a-show.md`

### 13. Monitor all shows (cross-show triage)

**Outcome:** Secretary sees all active shows and which needs attention.
**Canonical route:** `/secretary/dashboard` (re-verified 2026-07-04 for #1114 route/catalog changes)
**Note:** This remains the cross-show home, while single-show operations stay under `/shows/:showId/*`.
**Docs target:** Secretary Guide § Dashboard

### 14. Manage a specific show (setup and configuration)

**Outcome:** Secretary configures trials, classes, officials, and rings after initial creation.
**Canonical route:** `/shows/:showId/setup`
**Docs target:** Secretary Guide § Setup

### 15. Review and approve entries

**Outcome:** Secretary approves, rejects, or waitlists pending entries; records mail-in payment.
**Canonical route:** `/shows/:showId/entry-management`
**Docs target:** Secretary Guide § Entry Management, KB: `approve-entries.md`

### 16. Communicate with exhibitors

**Outcome:** Secretary sends announcements, entry confirmations, or targeted messages.
**Canonical route:** `/secretary/messages`
**Entry point:** Message Center (bell icon, top bar)
**Docs target:** Secretary Guide § Communications

### 17. Run the show desk on show day

**Outcome:** Secretary handles check-in, scratches, move-ups, and late entries from one page.
**Canonical route:** `/shows/:showId/show-desk`
**Entry point:** Show workbench Today tab, or Secretary Dashboard when show is live today
**Docs target:** Secretary Guide § Show Day, KB: `handle-a-scratch.md`, `handle-move-up.md`

### 18. Generate reports

**Outcome:** Secretary prints scoresheets, check-in sheets, result labels, and run orders.
**Canonical route:** `/shows/:showId/reports`
**Docs target:** Secretary Guide § Reports

### 19. Verify and release results

**Outcome:** Secretary confirms all class results are complete and releases them to exhibitors.
**Canonical route:** `/shows/:showId/results-control`
**Docs target:** Secretary Guide § Closeout

### 20. Submit results to AKC/UKC

**Outcome:** Secretary downloads the electronic submission file and emails it to the registry.
**Canonical route:** `/shows/:showId/submit-results`
**Docs target:** Secretary Guide § Closeout, KB: `submit-akc-results.md`

---

## Secretary Canonical Surface Decisions

### Tasks

**Decision:** Personal task work belongs on the secretary dashboard; per-show task work belongs in each show's Tools sheet, not a standalone `/secretary/tasks` page.
**Canonical routes:** `/secretary/dashboard`, `/shows/:showId/show-desk`
**Why this does not duplicate another page:** The dashboard and Show Desk already own the two distinct task scopes, so the legacy route is only a compatibility redirect.

### Waitlist

**Decision:** Waitlist work belongs in Entry Management, not a standalone `/secretary/waitlist/:showId` page.
**Canonical route:** `/shows/:showId/entry-management`
**Why this does not duplicate another page:** Entry Management already owns entry review states and exception queues.

### Volunteers

**Decision:** Keep `/secretary/volunteers` as the canonical volunteer scheduling page through launch unless Setup grows a dedicated personnel panel.
**Canonical route:** `/secretary/volunteers`
**Why this does not duplicate another page:** Show Setup may link to this page, but does not reimplement volunteer assignment.

---

## Club Admin / Treasurer Workflows

### 21. Set up club payment account (Stripe Express onboarding)

**Outcome:** Club treasurer connects the club to receive show payouts via Stripe.
**Canonical route:** `/club-admin/payments`
**Note:** Cataloged in `pageDirectory.ts`; reachable from the sidebar as **Payments**.
**Docs target:** Club Admin Guide § Payments, KB: `stripe-onboarding.md`
**Related:** `docs/operations/stripe-treasurer-guide.md` (already written)

### 22. View show payouts

**Outcome:** Treasurer sees payout schedule, net amounts, and transfer status per show.
**Canonical route:** `/club-admin/payments`
**Note:** Same surface as § 21, cataloged in `pageDirectory.ts` (Payouts tab of **Payments**).
**Docs target:** Club Admin Guide § Payouts

### 23. Manage club members

**Outcome:** Club admin views or updates club membership and access.
**Canonical route:** `/club-admin/members`
**Note:** Cataloged in `pageDirectory.ts`; reachable from the sidebar as **Members**.
**Docs target:** Club Admin Guide § Members

### 24. Review and update the club profile

**Outcome:** Club admin reviews and updates club name, AKC/UKC numbers, address, and contacts.
**Canonical route:** `/clubs/:id`
**Note:** Cataloged in `pageDirectory.ts` as Club Detail; reachable from the sidebar as **Club Profile**.
**Docs target:** Club Admin Guide § Club Profile Setup

---

## Admin Workflows (internal; not customer-facing)

These exist in `pageDirectory.ts` for the Help page and are documented here for completeness, but they do not feed customer-facing guides.

| Workflow                     | Route(s)                                          |
| ---------------------------- | ------------------------------------------------- |
| System overview              | `/admin/dashboard`                                |
| User management              | `/admin/users`                                    |
| Role assignment              | `/admin/permissions` → `/admin/permissions/users` |
| Role requests                | `/admin/role-requests`                            |
| Payout ledger + platform fee | `/admin/payouts`                                  |
| Templates                    | `/admin/templates`                                |
| App health                   | `/admin/health` → `/admin/sync`                   |
| Support troubleshooting      | `/admin/support`                                  |
| Deleted item recovery        | `/admin/deleted-items`                            |

---

## Duplicate / Overlap Audit

Workflows where the same user outcome appears at more than one route. Document only the **canonical** route; note the alternative.

| Outcome                | Canonical route                                   | Alternative                             | Note                                                                          |
| ---------------------- | ------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| Browse shows           | `/shows`                                          | `/browse-shows`, `/calendar`            | `/browse-shows` is a redirect; `/calendar` is parked — document `/shows` only |
| Show detail            | `/shows/:id`                                      | `/trials/:trialId`, `/classes/:classId` | Legacy paths are redirects — document `/shows/:id` nested paths only          |
| Trial details          | `/shows/:showId/trials/:trialId`                  | `/trials/:trialId`                      | Document the nested path only                                                 |
| Class details          | `/shows/:showId/trials/:trialId/classes/:classId` | `/classes/:classId`                     | Document the nested path only                                                 |
| Entry list (exhibitor) | `/exhibitor/entries`                              | `/my-entries`                           | `/my-entries` is a redirect — document `/exhibitor/entries` only              |
| Show day entry point   | ShowTodayBanner on `/exhibitor/entries`           | `/exhibitor/show-day`                   | `/exhibitor/show-day` is a legacy redirect — document the banner CTA only     |
| Profile/settings       | `/account`                                        | `/profile`, `/settings`, `/preferences` | `/account` is the consolidated surface — document the single destination only |
