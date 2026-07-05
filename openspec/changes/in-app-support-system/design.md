## Context

myK9Show has no in-app support path. The goal is a thin, deeply-integrated support surface that (a) deflects common questions with AI grounded on the verified user guides, and (b) when a human is needed, captures diagnostic context automatically and gives the operator a simple inbox — all built on infrastructure the app already has, not a third-party helpdesk.

Confirmed reuse targets (exact shapes verified in the codebase):

- **AI:** `supabase/functions/ask-myk9show/index.ts` — SSE streaming, request `{ message: string (≤2000), showId?: string }`, JWT auth, per-user daily rate limit (free 10 / premium 50) logged in `chatbot_query_log`. It already exposes a `search_user_guide` tool over the guides.
- **Messaging (NOT directly reusable as the store):** `show_message_threads` / `show_messages` (migration `106_show_messages.sql`) are hard show-scoped — `show_id` NOT NULL, unique `(show_id, participant_id)` (one thread per participant per show). Support tickets are often show-independent and one user can have many, so they cannot live in these tables.
- **Push:** `send-push-notification` (`{ user_id, payload }`, dual service-role/JWT auth) reads `push_subscriptions (user_id, endpoint, p256dh, auth)`. The established pattern is a `SECURITY DEFINER notify_*()` trigger that POSTs via `pg_net` to a `push-trigger-*` edge function guarded by `PUSH_WEBHOOK_SECRET` (see `notify_chat_message()` → `push-trigger-chat-message`).
- **Email:** `supabase/functions/send-email/index.ts` sends via Resend (`from: myK9Show <notifications@myk9show.com>`) and logs to `email_log`; it switches on a typed `email_type`.
- **Admin surface:** routes in `apps/myk9show/src/routes/adminRoutes.tsx` gated by `<ProtectedRoute requiredRole={UserRole.SITE_ADMIN}>`; clone `pages/admin/AdminDashboard.tsx` as the inbox template.
- **Authz:** `is_site_admin()` (migration 124) — SECURITY DEFINER, checks an active non-expired `site_admin` role via `people.auth_user_id = auth.uid()`.

## Goals / Non-Goals

**Goals:**
- One in-app "Get Help" front door for all authenticated roles.
- AI deflection over verified guides with deep-linking; payments/refunds never auto-answered.
- Human tickets persisted with an auto-captured diagnostic bundle (zero technical input from the user).
- In-app threaded reply reusing the existing push + Resend notification infrastructure.
- A site-admin inbox to triage, read diagnostics, reply, and change status; show-day priority ordering.
- RLS: ticket owner + site admin only; explicit GRANTs; no anon.

**Non-Goals:**
- Inbound email parsing / IMAP (replies go out via Resend and link back in-app).
- Macros, SLA timers, CSAT, reporting dashboards, multi-agent collaboration.
- Touching or relaxing the show-scoped `show_messages` schema.
- Migrating any Fluent Support data (Fluent stays for the legacy Access apps only).
- Public/anonymous support.

## Decisions

**1. Dedicated tables, not `show_messages`.** Add `support_tickets` and `support_ticket_messages` rather than forcing support into the show-scoped messaging tables. This keeps show-day messaging untouched and lets tickets exist without a show.

- `support_tickets`: `id uuid pk`, `owner_id uuid` (→ `people.id` or `auth.users`, match the app's user-identity convention — verify against how tickets will be queried client-side), `subject text`, `status text check in ('open','waiting','resolved') default 'open'`, `is_show_day_priority boolean default false`, `diagnostics jsonb not null`, `show_id uuid null` (soft context, nullable, no uniqueness), `created_at`, `updated_at`.
- `support_ticket_messages`: `id uuid pk`, `ticket_id uuid → support_tickets on delete cascade`, `sender_id uuid`, `body text check (length(trim(body)) between 1 and 5000)`, `is_from_operator boolean`, `read_at timestamptz null`, `created_at`.
- Both tables get explicit GRANTs (`SELECT, INSERT, UPDATE` to `authenticated`; no anon) and RLS: owner (`sender/owner = auth user`) OR `is_site_admin()`. Follow the migration-auditor checklist.

**2. Notifications reuse the trigger pattern, new channel.** Add `notify_support_message()` (SECURITY DEFINER) on `support_ticket_messages` insert → POST via `pg_net` to a new `push-trigger-support-message` edge function (mirrors `push-trigger-chat-message`, guarded by `PUSH_WEBHOOK_SECRET`) which calls `send-push-notification`. Recipient logic: message from owner → notify site admins; message from operator → notify the ticket owner. Email: extend `send-email` with a `support_notification` type (or a thin support path) reusing the Resend + `email_log` pattern; the email body links to the in-app ticket, never a reply-to address.

**3. AI deflection = `ask-myk9show` in a support mode.** The Get-Help panel calls `ask-myk9show` and steers it toward the `search_user_guide` tool. The **payments/refunds escalation gate is enforced server-side**: pass a support-mode flag (or a distinct entrypoint) that injects a system instruction refusing to auto-answer payment/refund questions and returning an escalate signal — more robust than client-side keyword matching, though the panel also offers escalation on any low-confidence/refused answer. Note the shared rate-limit quota (free 10/day): support deflection draws from the same `chatbot_query_log` budget; accept for MVP, revisit if it starves the assistant.

**4. Diagnostic bundle built client-side at escalation.** A pure `buildDiagnosticBundle(appState)` helper assembles: `userId`, `role`, `route` (router location), in-context `showId/trialId/entryId`, `appVersion` (build env), `online` + replication watermark/queue state (from the replication layer), and the last N client errors (from an in-memory error ring buffer). Pure and unit-tested; missing fields recorded as absent, never throwing.

**5. Front door placement.** Mount the launcher app-wide for authenticated users (e.g. in the app shell), not per-page, so there is one entry point. Deep links in AI answers use existing routes.

## Risks / Trade-offs

- **Rate-limit contention** between support deflection and the AskQ assistant (shared daily quota). Mitigation: accept for MVP; if it bites, give support its own small budget or cache guide answers.
- **AI answering a payment question anyway.** Mitigation: server-side refusal instruction is the primary gate; the panel's escalation path is the backstop; add a unit test asserting payment-intent inputs never yield an auto-answer.
- **Diagnostic bundle PII.** The bundle may contain ids and error strings; it is readable only by owner + site admin via RLS, and no free-text PII is solicited. Keep client error capture from logging tokens/payment data.
- **Scope creep** toward a full helpdesk. Mitigation: the Non-Goals are load-bearing; reviewers should reject macros/SLA/CSAT additions in this change.
- **Notification duplication** (push + email both firing). Mitigation: mirror the existing chat pattern's single-fire trigger; respect a per-message `push_alert`-style flag if needed.
- **User-identity column choice** (`people.id` vs `auth.users.id`) must match how the client queries tickets under RLS; the wrong choice silently returns zero rows. Verify against `is_site_admin()`'s `people.auth_user_id` join before finalizing the migration.
