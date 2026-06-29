# Workflow Source Map

Maps user workflows to their canonical routes in myK9Show. The per-route inventory lives in `apps/myk9show/src/features/admin-help/data/pageDirectory.ts` (test-synced to the route registry via `pageDirectory.test.ts`) — this file adds only the layer `pageDirectory.ts` does not have: the mapping from _user outcomes_ to route(s).

**Do not restate per-route data.** Reference routes by path only so staleness is greppable.

---

## Sidebar vs pageDirectory Gap Audit

Routes visible in the sidebar (`unifiedSidebarConfig.ts`) that are **not yet in `pageDirectory.ts`**. These are gaps — add them to `pageDirectory.ts` before they can be documented.

No open gaps. The admin user-management, role-requests, payout-ledger, and people surfaces — and the payment surfaces (Exhibitor **My Payments**, Club Admin **Members** / **Payments**) — are all cataloged in `pageDirectory.ts` and reconciled with their customer guide sections (Exhibitor Guide § Payments; Club Admin Guide § Members / § Payments / § Payouts).

---

## Routes Excluded from Customer Docs

These routes exist in `pageDirectory.ts` but should not appear in customer-facing documentation.

| Route                   | Reason                                         |
| ----------------------- | ---------------------------------------------- |
| `/admin/load-testing`   | `classification: hidden`, dev-only             |
| `/admin/sync`           | Internal telemetry                             |
| `/admin/performance`    | Internal telemetry                             |
| `/admin/data-lifecycle` | Internal admin only                            |
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
**Canonical routes:** `/sign-up` → `/dogs` → `/dogs/:id`
**Docs target:** Exhibitor Guide § Account Setup, KB: `create-account.md`

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
**Canonical route:** `/at-show` (permanent "Ringside" sidebar entry, all roles) **or** `/at-show/:showId` (via ShowTodayBanner on `/exhibitor/entries`) → `/exhibitor/check-in/:entryId`
**Note:** Two entry points as of #948 — a permanent "Ringside" sidebar link to bare `/at-show` (resolves the live show at the destination via `RingsideEntryPage`), plus the context-aware ShowTodayBanner on My Shows that appears only on show day. As of #949/#950, exhibitor self-check-in is gated on a secretary toggle and routed through the `self_checkin_entry` RPC — guides must not promise self-check-in unconditionally.
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
**Canonical route:** `/exhibitor/analytics`
**Docs target:** Exhibitor Guide § Stats (lower priority for initial guides)

---

## Secretary Workflows

### 12. Create a show

**Outcome:** Secretary creates a show with trials, classes, judges, and entry dates, and publishes it.
**Canonical route:** `/secretary/create-show/wizard`
**Entry point:** Secretary Dashboard → Create Show
**Docs target:** Secretary Guide § Setup, KB: `create-a-show.md`

### 13. Monitor all shows (cross-show triage)

**Outcome:** Secretary sees all active shows and which needs attention.
**Canonical route:** `/secretary/dashboard`
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
| System alerts                | `/admin/alerts`                                   |

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
