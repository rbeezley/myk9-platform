# Tasks — In-App Support System

## 1. Data model & RLS (support-tickets)

- [x] 1.1 Confirm the user-identity convention (`people.id` vs `auth.users.id`) that RLS + client queries will key on; verify against `is_site_admin()`'s `people.auth_user_id` join before writing DDL
- [x] 1.2 Write migration creating `support_tickets` (id, owner_id, subject, status check `open|waiting|resolved`, is_show_day_priority, diagnostics jsonb, show_id nullable, created_at, updated_at) with indexes on (owner_id, created_at) and (status, is_show_day_priority)
- [x] 1.3 Write migration creating `support_ticket_messages` (id, ticket_id FK cascade, sender_id, body length-checked 1–5000, is_from_operator, read_at, created_at) with index on (ticket_id, created_at)
- [x] 1.4 Add explicit GRANTs (SELECT/INSERT/UPDATE to authenticated; no anon) and RLS policies on both tables: owner OR `is_site_admin()` for select/insert; status/read updates scoped correctly; anon denied
- [x] 1.5 Run the migration-auditor checklist over the migration (GRANTs, RLS, O(N) policies, enum/CHECK) and fix findings

## 2. Diagnostic bundle

- [x] 2.1 Implement a pure `buildDiagnosticBundle(appState)` helper (userId, role, route, in-context show/trial/entry ids, appVersion, online + replication watermark/queue state, last N client errors); missing fields recorded absent, never throws
- [x] 2.2 Add a lightweight in-memory client error ring buffer feeding the bundle; ensure it does not capture tokens/payment payloads

## 3. AI deflection & escalation gate (support-help-front-door)

- [x] 3.1 Add a support-mode path to (or wrapper around) `ask-myk9show` that steers toward `search_user_guide` and injects the server-side instruction to refuse payment/refund auto-answers and emit an escalate signal
- [x] 3.2 Implement the panel routing: question → deflection → grounded answer + deep-link, or escalate offer on refusal/low-confidence
- [x] 3.3 Enforce the payments/refunds hard rule end-to-end (server refusal is primary; panel escalation is backstop)

## 4. Get Help front door UI (support-help-front-door)

- [x] 4.1 Build the Get-Help launcher + panel component (shadcn/ui), mounted app-wide for authenticated users only
- [x] 4.2 Wire the panel to deflection (Section 3) and to the escalation form that carries over the typed question
- [x] 4.3 Render AI answers with deep links to the resolving screen

## 5. Ticket create + threaded reply (support-tickets)

- [x] 5.1 Ticket creation flow: submit sentence → insert `support_tickets` with the diagnostic bundle → set show-day priority when in a show-day context
- [x] 5.2 In-app thread UI: read/post `support_ticket_messages` for owner and admin; mark read
- [x] 5.3 Client data hooks (React Query) for tickets + messages honoring RLS

## 6. Notifications (reuse push + email)

- [x] 6.1 Add `notify_support_message()` SECURITY DEFINER trigger on `support_ticket_messages` insert POSTing via pg_net to a new `push-trigger-support-message` edge function (mirror `push-trigger-chat-message`, guard with `PUSH_WEBHOOK_SECRET`)
- [x] 6.2 Implement `push-trigger-support-message` recipient logic (from owner → notify site admins; from operator → notify owner) calling `send-push-notification`
- [x] 6.3 Extend `send-email` with a `support_notification` type (Resend + `email_log`); email links into the in-app ticket, never a reply-to address
- [x] 6.4 Confirm no inbound-email ingestion path exists or is added

## 7. Operator inbox (support-operator-inbox)

- [x] 7.1 Add `/admin/support` route in `adminRoutes.tsx` gated by `<ProtectedRoute requiredRole={UserRole.SITE_ADMIN}>`
- [x] 7.2 Build the inbox page (clone `AdminDashboard.tsx` pattern): ticket list by status, show-day-priority ordered first, with connectivity/replication state highlighted
- [x] 7.3 Ticket detail: diagnostic bundle view + thread + reply + status change (open/waiting/resolved)

## 8. Testing

- [x] 8.1 Unit tests for `buildDiagnosticBundle` (populated, missing-context, never-throws cases)
- [x] 8.2 Unit tests for the escalation gate — assert payment/refund intents never yield an auto-answer (assertion-first)
- [x] 8.3 RLS contract tests: owner sees only own tickets/messages; site admin sees all; anon denied
- [x] 8.4 Notification tests: trigger fires once per message; correct recipient set; email links in-app (no reply-to)
- [x] 8.5 Component tests for the Get-Help panel routing (answer vs escalate) using the custom render from `src/test/utils/testUtils.tsx`
- [x] 8.6 Run `pnpm typecheck`, `pnpm lint`, and the app vitest suite green

## 9. Docs & tracking

- [x] 9.1 Add a short operator note (how to work the `/admin/support` inbox) — extend `docs/operations/admin-support-runbook.md`
- [x] 9.2 Update OPEN-TODOS.md / the go-live runbook support posture to point at the in-app system (Fluent retired for myK9Show)
- [x] 9.3 Record the AskQ rate-limit-sharing decision and revisit trigger
