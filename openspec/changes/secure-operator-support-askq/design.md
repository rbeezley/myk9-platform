## Context

AskQ already supplies the shared panel, answer presentation, SSE parsing, and model integration. Its normal endpoint is designed for guide, rulebook, and show-data questions and currently gives its tool executor a service-role client plus manually verified show context. Operator Support has a different trust boundary: it can expose private cross-platform operational data and therefore must not be enabled by adding another client-selected mode or tool to that endpoint.

The existing `/admin/health` surface and `useOperatorAlerts` hook already establish the alert fields and site-admin RLS policy. Operator Support will reuse that data contract while keeping `/admin/health` as the owner surface. This is an online-only site-admin utility; it does not alter core show-day data, `@myk9/replication`, or offline behavior. The UX preserves the site-admin intent, “The platform is healthy,” by giving a concise investigation entry point without adding another page.

## Goals / Non-Goals

**Goals:**

- Reuse the existing AskQ panel and answer components while keeping operator conversation state separate.
- Enforce `site_admin` authorization in a dedicated server endpoint regardless of client input.
- Expose only a fixed, read-only unresolved-alert summary tool in the first slice.
- Execute operator reads with the authenticated caller client so database RLS remains authoritative.
- Return bounded, redacted tool data and record audit metadata without storing the operator's private prompt.
- Require an explicit server enable switch and fail-closed daily rate limit before model access.
- Provide focused security and UI tests for both allowed and denied paths.

**Non-Goals:**

- A standalone chatbot app or a duplicate admin-health workflow.
- Adding operator tools to the normal AskQ endpoint.
- User lookup, entry/payment tracing, service-health reads, write/resolve tools, or a read-only MCP endpoint.
- Reworking normal AskQ's existing service-role architecture in this slice.
- Offline operator support or replication changes.

## Decisions

### Use a dedicated Operator Support endpoint

The existing panel will call `ask-operator-support` only when a locally authenticated site admin chooses Operator Support. The endpoint will authenticate the bearer token and call `is_site_admin()` through the caller-scoped Supabase client before parsing or executing a question.

Alternative considered: add `questionMode: "operator"` to `ask-myk9show`. Rejected because a client-controlled mode inside the existing endpoint would share its service-role tool path and create an avoidable privilege-confusion risk.

### Reuse presentation, not request state

The panel will instantiate a second AskQ request state using the same hook mechanics with an operator-specific sender. Switching modes resets the inactive state, so private operator answers do not remain visible in or flow into normal AskQ.

Alternative considered: a separate page or chatbot. Rejected because it duplicates navigation and AskQ presentation without improving the security boundary; the boundary belongs at the endpoint and data-access layers.

### Keep a fixed operator tool registry

`OPERATOR_TOOLS` will contain only `summarize_operator_alerts`, with no dynamic registration and no write-capable executor. The operator prompt will state that tools are read-only and that the model must not invent unavailable data.

Alternative considered: reuse the normal `TOOLS` registry and filter it per request. Rejected because separate registries make accidental exposure easier to test and harder to introduce.

### Preserve RLS by dependency separation

The endpoint will construct a caller client from the supplied bearer token and pass only that client to the operator executor. A service-role client may be constructed only for redacted audit and rate-limit access to `chatbot_query_log`, which is service-role managed; it will never be supplied to an operator read or tool.

The alert query selects only `id`, `created_at`, `source`, `severity`, and `title`, filters unresolved rows, orders newest first, and applies a hard limit. The model receives aggregate severity/source counts and a small recent-alert list. It never receives `detail`, `dedupe_key`, `resolved_by`, or other arbitrary JSON.

Alternative considered: service-role reads plus manual authorization filters. Rejected because RLS provides a second, database-enforced authorization boundary and avoids relying on application filtering.

### Audit metadata without private prompt retention

The endpoint will create a `chatbot_query_log` row with `app_source: "operator-support"` and a constant redacted query marker, then update tools and response time. This records who invoked the mode and which tool ran without persisting the operator's potentially sensitive natural-language question.

The endpoint will update the provisional audit row from a guaranteed cleanup path, so tools that read private alert data remain recorded even if a later model call fails.

Alternative considered: store the full prompt like normal AskQ. Rejected because operator prompts may contain user-identifying or payment-investigation details.

### Fail closed on availability and cost controls

`OPERATOR_SUPPORT_ENABLED` must be exactly `"true"` before the endpoint accepts requests. Authorized requests are limited to 20 per UTC day using redacted `operator-support` audit rows; a rate-limit query failure returns an unavailable response before audit creation, model access, or tool execution.

Alternative considered: rely on the client role gate or provider limits. Rejected because neither prevents direct endpoint calls from a compromised site-admin session.

### Link back to the owner surface

The response prompt will direct the model to recommend `/admin/health` when an admin needs alert details or resolution. The chat will not reproduce the alert table or resolution controls.

## Risks / Trade-offs

- **[Model provider receives bounded operational summaries]** → Exclude alert detail JSON and identifiers beyond opaque alert IDs, limit the number of recent rows, and instruct the model not to infer missing facts.
- **[A UI role check could be stale or forged]** → Treat it only as discoverability; the endpoint independently authenticates and authorizes every request.
- **[A future tool could accidentally use service role or write data]** → Keep separate tool types/registry, pass only the caller client to executors, and retain negative contract tests.
- **[Audit logging failure could hide usage]** → Fail closed before model/tool execution if the provisional audit row cannot be created.
- **[A compromised site-admin session could create unbounded model cost]** → Keep the endpoint disabled by default and enforce a dedicated fail-closed daily request limit.
- **[The first tool is intentionally narrow]** → Keep later user/payment/entry/health tools as separate reviewed slices with their own redaction and RLS contracts.

## Migration Plan

1. Add and test the shared operator tool, authorization handler, and edge-function entry point.
2. Add the admin-only panel mode and operator-specific client sender.
3. Run focused unit, security-contract, TypeScript, and OpenSpec verification.
4. Deploy the new edge function separately after review and explicitly set `OPERATOR_SUPPORT_ENABLED=true` only after runtime validation; the UI can be rolled back independently because normal AskQ is unchanged.

No database migration is required. Rollback removes the UI mode and edge function; existing AskQ and `/admin/health` behavior remain intact.

## Open Questions

None for this first slice. Each later tool requires a separate field-level privacy and RLS review before being added.
