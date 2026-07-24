## Why

Site admins need a fast, natural-language way to investigate platform problems on behalf of users without exposing private operator data to ordinary AskQ sessions. This supports fall 2026 launch readiness by shortening operator response time while preserving the authorization boundaries required for trustworthy support.

## What Changes

- Add an admin-only **Operator Support** mode inside the existing AskQ panel.
- Route Operator Support requests to a separate endpoint that verifies `site_admin` authorization on the server.
- Introduce a separate, fixed read-only operator tool allowlist; the first tool summarizes unresolved operator alerts through the caller's RLS-scoped client.
- Bound and redact tool output, keep the operator conversation separate from normal AskQ state, and record redacted audit metadata.
- Add negative security coverage proving that non-admins, forged client input, normal AskQ sessions, service-role reads, and write tools cannot cross the boundary.
- Do not create a standalone chatbot, replace AskQ, expose a read-only MCP endpoint, add write tools, or implement user/payment/entry/service-health tools in this first slice.

This does not duplicate an existing page. `/admin/health` remains the canonical alert-management surface; Operator Support is a read-only question interface in the existing AskQ panel and should link an admin to that owner surface rather than reproduce its table or resolve workflow. A link alone is insufficient because the requested capability is to synthesize a bounded operational summary conversationally.

## Capabilities

### New Capabilities

- `askq-operator-support`: Server-authorized, read-only operator assistance inside the existing AskQ panel, initially limited to unresolved operator-alert summaries.

### Modified Capabilities

None.

## Impact

- Adds a dedicated Supabase edge-function endpoint and shared TypeScript operator-tool modules.
- Extends the existing AskQ panel and client service with a site-admin-only mode.
- Reads the existing `operator_alerts` table under caller-scoped RLS and reuses the existing AskQ presentation patterns.
- Adds focused unit and authorization-boundary tests; no schema migration, new application surface, or write path is introduced.
