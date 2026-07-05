## Why

Secretaries and exhibitors need help without friction, and today myK9Show has no in-app path to get it — support would mean leaving the app for a separate Fluent Support website and describing technical state they can't see. Because myK9Show is a cloud app with server-side context (role, current show/entry, online/offline + replication state, client errors) plus an existing AI layer (`ask-myk9show`) and a growing verified user-guide library, we can instead answer most questions instantly and, when a human is needed, capture the diagnostic context automatically. This is a fall-2026 launch-readiness item: the launch-readiness scorecard's Operational-readiness dimension requires a documented, working support path, and real-user testing (the final launch gate) will generate the first support load. Building support in our own stack — rather than adopting a third-party helpdesk — keeps the AI proprietary and lets support see live app state.

## What Changes

- Add an in-app **"Get Help"** launcher available to all authenticated roles that opens a support panel.
- Route the user's question first to **AI deflection**: reuse `ask-myk9show` grounded on the verified user guides to return an instant answer plus a deep-link to the relevant screen. Payments/refunds questions are **never auto-answered** — they escalate to a human ticket.
- When AI does not resolve it, create a **support ticket** persisted in Supabase with an auto-captured **diagnostic bundle** (user id, role, current route, in-context show/trial/entry ids, app version, online/offline + replication watermark state, last N client errors). The user writes one sentence; the app attaches the technical facts.
- Provide a **threaded reply** experience by reusing the existing in-app messaging + web-push infrastructure. A support request is a new thread type; the operator is notified on new tickets and the customer is notified on replies (web push + Resend email).
- Add a **site-admin operator inbox** page (cloning the existing admin-page pattern) that lists tickets by status (open / waiting / resolved), shows the diagnostic bundle and thread, and lets the operator reply and change status.
- Segment experience: exhibitor tickets (high-volume, AI-first) vs a secretary **show-day priority** flag that surfaces connectivity/replication state prominently.
- Establish that **Fluent Support is retired for myK9Show** (it remains only for the legacy Microsoft Access applications).

## Capabilities

### New Capabilities
- `support-help-front-door`: The in-app "Get Help" launcher, the AI-deflection routing over verified guides, deep-linking to the answer's screen, and the escalation gate — including the hard rule that payments/refunds are never auto-answered and always escalate.
- `support-tickets`: The support-ticket data model, the auto-captured diagnostic bundle, the threaded reply built on the existing messaging tables, operator/customer notifications via the existing push + Resend, and RLS scoping (ticket owner + site admin only).
- `support-operator-inbox`: The site-admin inbox surface for triaging, reading the diagnostic bundle and thread, replying, and changing ticket status, including the show-day priority ordering.

### Modified Capabilities
<!-- None. No existing spec's requirements change; this is additive. -->

## Impact

- **New DB objects:** a `support_tickets` table (+ any minimal join/state columns) with explicit GRANTs and RLS; a new thread type or link into the existing messaging tables. Migration in `supabase/migrations/`.
- **Reused, not rebuilt:** `ask-myk9show` (AI), `docs/user-guides` (knowledge base), the `show_messages`/message-thread tables (reply thread), `send-push-notification` + `push-trigger-*` (notifications), Resend (email out), `is_site_admin()` + the admin route/guard pattern (operator inbox).
- **New UI:** a Get-Help launcher/panel component mounted app-wide, and one site-admin inbox page + route.
- **Possibly one new/extended edge function:** a support-scoped deflection call and a notify-on-ticket hook; reuse existing functions where the contract already fits.
- **Out of scope (explicit non-goals):** inbound-email parsing/IMAP (replies go out via Resend with a link back into the app; the thread lives in-app); macros/canned responses; SLA timers; CSAT surveys; reporting dashboards; multi-agent collaboration; migrating any Fluent Support data.
- **Duplication check:** this does not duplicate an existing surface — the three admin monitoring pages (`/admin/sync`, `/admin/performance`, `/admin/alerts`) are client-side telemetry with no DB persistence and no ticket concept; there is no existing in-app help or ticket surface to link to instead.
