# AI Natural-Language Access Plan

> **Status:** Active — metadata reconciled 2026-09-05.
> Richard owns reconciliation: existing historical implementation/status is preserved below; closure evidence is not independently established in this pass. Keep active pending that evidence.


> **Status:** Planned
> **Created:** 2026-06-16

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This work touches auth/RBAC, cross-client external integrations, audit logging, possible BYOK secret handling, and support/admin access to sensitive show data.

## Goal

Add natural-language access to myK9 information without replacing the existing UI or making myK9 pay for every LLM token. The feature should enhance support, admin troubleshooting, and secretary/exhibitor answers by exposing approved myK9 facts and workflows to AI systems in a controlled way.

## Product Frame

This is not a new app surface and not a parallel Entries Management, Show Desk, or workbench. The AI layer should retrieve facts, explain state, and point users to the existing app surface when action is needed.

Duplication question: **Does this duplicate an existing page?**

Yes, it may overlap with information already visible in admin, secretary, exhibitor, or support pages. Duplication is only justified when the AI returns a summarized answer, diagnosis, or deep link. It is not justified for rebuilding lists, filters, approvals, check-in operations, or show-day workflows outside the canonical pages.

## Principles

- Keep myK9Show as the source of truth and primary workflow.
- Prefer read-only diagnostics before write-capable tools.
- Use the same auth, RBAC, audit logs, and offline-first data boundaries as the app.
- Avoid requiring normal exhibitors to configure developer tools or external AI clients.
- Treat MCP as a power-user/admin integration, not the default Ask Queue replacement.
- Route risky actions through existing mutation/workflow paths with confirmation.
- Preserve the role intent from `docs/INTENT.md`: secretary tools must feel calm and easy; admin tools must make platform health visible.
- [ADDED] Return the minimum data needed to answer each question, redact unnecessary PII, and never expose raw database rows directly to an AI client.
- [ADDED] Prefer "I cannot determine that from available myK9 data" over speculative answers when evidence is missing, stale, unauthorized, or ambiguous.

## Phased Plan

### Phase 1 — Ask Queue Cost and Data Shape Audit

Purpose: reduce unnecessary LLM spend before adding new integration surfaces.

- Inventory the existing Ask Queue flow, prompts, model calls, credit accounting, and retrieval paths.
- Split questions into categories:
  - factual show/entry/result lookup
  - rules/reference questions
  - support/troubleshooting questions
  - free-form writing/summarization
- Identify questions that can be answered with deterministic structured data before involving an LLM.
- Define a shared "answer context" shape that can be reused by Ask Queue, MCP, and future admin tooling.
- Document which answers need citations, timestamps, show IDs, entry IDs, or deep links.
- [ADDED] Establish baseline measurements for Ask Queue token usage, common question categories, failure rates, and average answer cost before changing behavior.
- [ADDED] Classify which retrievals must use replication-backed/offline-safe data paths and which are explicitly online-only support/admin diagnostics.
- [ADDED] Define a redaction policy for answer contexts before any context is passed to an external model or MCP client.

Exit criteria:

- A short inventory of current LLM call sites and cost drivers exists.
- The top 5-10 high-volume question types have proposed structured data sources.
- No new user-facing surface is introduced yet.
- [ADDED] A baseline token/cost report exists so Phase 3 can prove whether the optimization helped.
- [ADDED] Each proposed answer context lists allowed fields, redacted fields, and whether the data is offline-safe or online-only.

### Phase 2 — Admin-Only Read Diagnostics

Purpose: give the site admin natural-language troubleshooting leverage with low operational risk.

- Build a read-only diagnostic service around existing app/query seams.
- Start with admin-support questions such as:
  - "Why did this confirmation email fail?"
  - "What changed on this entry today?"
  - "Which entries are paid but not confirmed?"
  - "Which users have secretary access to this show?"
  - "What is the replication/sync health picture for this show?"
- Return structured evidence, not prose-only answers.
- Include deep links to the canonical app pages for follow-up.
- Add audit logging for every diagnostic request.
- [EXPANDED] Each diagnostic must return a typed result with one of these states: `found`, `not_found`, `unauthorized`, `insufficient_data`, or `source_unavailable`.
- [ADDED] For partial failures, return available evidence plus a plain-English limitation instead of failing the whole diagnostic silently.
- [ADDED] Add rate limiting and query-size limits before admin diagnostics can hit production data.

Exit criteria:

- Admin can retrieve support facts without direct database spelunking.
- Each diagnostic has tests for auth, show scoping, and expected evidence fields.
- Answers identify data freshness and source tables/services.
- [ADDED] Diagnostics have negative tests for missing IDs, unauthorized show access, unavailable source data, and partial evidence.
- [ADDED] Audit logs capture who asked, which diagnostic ran, show scope, result state, and whether PII was returned.

### Phase 3 — In-App AI Context Reuse

Purpose: make Ask Queue cheaper and more accurate using the same deterministic context layer.

- Rewire eligible Ask Queue categories to gather structured facts before invoking an LLM.
- For simple factual answers, consider deterministic responses that do not call an LLM.
- For natural-language responses, pass compact structured context to the LLM instead of broad/raw data.
- Add answer templates for common exhibitor and secretary questions where a full LLM is unnecessary.
- Preserve credit accounting transparency: users should understand when a question used AI credits versus a deterministic lookup.
- [ADDED] Gate behavior changes behind a feature flag so Ask Queue can fall back to the current LLM path if deterministic retrieval produces bad answers.
- [ADDED] Add user-facing fallback copy for cases where structured context cannot answer the question.

Exit criteria:

- Common factual questions can be answered with fewer tokens or no LLM call.
- Existing Ask Queue behavior remains intact for questions that truly need model reasoning.
- Credit/token usage can be measured before and after the change.
- [ADDED] A rollback path exists that disables deterministic answer routing without a database migration.
- [ADDED] Before/after measurements show token usage, answer failure rate, and user-visible fallback rate.

### Phase 4 — Remote MCP Server MVP

Purpose: let power users connect Claude, ChatGPT, or similar MCP-capable clients to myK9 using their own AI account.

- Expose a remote HTTPS MCP server backed by the same read-only diagnostic/context tools.
- Use OAuth or an equivalent user-scoped auth flow; do not rely on shared static tokens for production.
- Start with read-only tools only:
  - show lookup
  - entry/result lookup
  - email/confirmation diagnostics
  - role/access diagnostics
  - rules/reference retrieval if source licensing allows it
- Maintain per-client configuration manifests for Claude and ChatGPT while keeping one shared MCP server contract.
- Log tool calls with user, role, show scope, tool name, and evidence returned.
- [EXPANDED] Publish a versioned MCP tool contract and compatibility matrix for Claude and ChatGPT, including auth flow, supported transport, required scopes, and known client-specific limitations.
- [ADDED] Add server health checks, structured logs, and alerting for auth failures, tool errors, latency spikes, and rate-limit events.
- [ADDED] Handle OAuth/auth failure explicitly: deny the tool call, log the failure without secrets, and return no myK9 data.
- [ADDED] Keep MCP read-only until the admin diagnostic and Ask Queue context layers are already tested in production-like conditions.

Exit criteria:

- One myK9 MCP endpoint works from at least Claude and ChatGPT test configurations.
- Tool responses are role-scoped and auditable.
- No write-capable secretary/show-day mutations are exposed.
- [ADDED] Each supported MCP client has a documented setup path, smoke test, and known limitations.
- [ADDED] Disabling the MCP server or a single tool does not affect normal myK9Show usage or Ask Queue.

### Phase 5 — Secretary-Safe Assisted Lookup

Purpose: allow trusted secretaries to ask operational questions in natural language without replacing their workflow.

- Add secretary-scoped MCP/read tools for operational lookup:
  - conflicts
  - missing armbands
  - incomplete check-in
  - class readiness
  - show-day schedule/status summaries
- Return deep links into the relevant canonical myK9Show page with filters pre-applied when possible.
- Keep action-taking out of MCP unless there is a clear, tested confirmation path through existing mutations.
- Add secretary-facing help text that frames MCP as optional power-user support, not required show-day tooling.
- [ADDED] Treat external AI/MCP availability as non-critical on show day; all secretary workflows must remain fully usable in myK9Show if MCP is down or the AI client is unavailable.
- [ADDED] Require a product review before exposing any write-capable secretary operation through MCP.

Exit criteria:

- Secretary tools answer common operational questions without duplicating Entries Management or the workbench.
- Deep links route users back into existing pages for action.
- Permission tests prove one secretary cannot access another show's data.
- [ADDED] MCP downtime, client auth failure, or tool errors do not block the canonical secretary workflow.
- [ADDED] Any proposed write-capable tool has a separate approved design and implementation plan before coding.

### Phase 6 — BYOK Evaluation

Purpose: decide whether in-app bring-your-own-key is worth the product and security cost.

- Compare MCP power-user usage against Ask Queue credit pain.
- Evaluate BYOK options for OpenAI, Anthropic, and Gemini API keys.
- Define the security model for storing, encrypting, rotating, and deleting user keys.
- Decide whether BYOK belongs in the product, or whether MCP plus optimized Ask Queue is enough.
- [EXPANDED] The default decision is no BYOK storage until encryption, rotation, deletion, provider-specific abuse handling, and support burden are explicitly accepted.
- [ADDED] Evaluate a no-storage BYOK alternative, such as users connecting their own AI client through MCP, before storing API keys in myK9.

Exit criteria:

- A written go/no-go decision exists.
- If approved, BYOK has a separate implementation plan with security review before coding.
- [ADDED] The go/no-go decision includes data retention, secret storage, support, billing, and abuse-risk implications.

## Testing Phase

Every implementation phase must include tests before it is considered complete.

- Unit tests for tool input validation, role scoping, and response shaping.
- Integration tests for diagnostic services against representative seeded data.
- Auth/RBAC tests for admin, secretary, exhibitor, and unauthorized users.
- Audit-log tests proving every AI/MCP diagnostic request is recorded.
- Regression tests proving MCP/deep-link flows do not bypass canonical app workflows.
- Token/cost tests or measurements for Ask Queue changes where feasible.
- Manual verification with at least one Claude configuration and one ChatGPT configuration before calling MCP cross-client support complete.
- [ADDED] Failure-mode tests for invalid input, missing records, unauthorized records, expired auth, MCP client auth failure, upstream timeout, and partial diagnostic evidence.
- [ADDED] Feature-flag tests proving Ask Queue can fall back to the current behavior and MCP tools can be disabled independently.
- [ADDED] Rate-limit and payload-size tests for diagnostics and MCP tools that may touch production-scale show data.
- [ADDED] Secret-handling tests if BYOK is ever approved, including no secret values in logs, audit rows, errors, or client responses.
- [ADDED] Focused load checks for high-cardinality show queries before exposing them to MCP clients.

## Operational Rollout and Recovery

- [ADDED] Roll out in this order: internal admin diagnostics, limited admin Ask Queue context reuse, staging MCP smoke tests, production MCP for the owner/admin only, trusted secretary pilot, then broader availability.
- [ADDED] Every new diagnostic/tool must have an owner, feature flag or disable switch, audit-log coverage, and a short runbook entry before production use.
- [ADDED] Alert on repeated authorization failures, elevated tool error rate, unusually large payloads, and latency that could signal inefficient queries.
- [ADDED] Keep normal myK9Show workflows independent of the AI/MCP layer; recovery from MCP failure is to disable the tool/server and continue using the app.
- [ADDED] If a tool returns incorrect or overbroad data, disable that specific tool first, preserve audit logs, and review the query/RBAC path before re-enabling it.

## Risks and Guardrails

- **Risk:** MCP becomes a second UI.
  - **Guardrail:** read-only first; use deep links for action.
- **Risk:** user confusion from too many AI entry points.
  - **Guardrail:** keep Ask Queue as the normal in-app experience; MCP is advanced/admin.
- **Risk:** data leakage across shows or roles.
  - **Guardrail:** every tool requires scoped auth and explicit permission tests.
- **Risk:** show-day reliability depends on external AI clients.
  - **Guardrail:** never make MCP required for core show-day operations.
- **Risk:** rules answers hallucinate.
  - **Guardrail:** rules responses require retrieved source context/citations or a clear "I don't know."
- [ADDED] **Risk:** external MCP client behavior or support changes.
  - **Guardrail:** maintain a compatibility matrix and smoke-test each supported client before advertising support.
- [ADDED] **Risk:** AI access creates unexpected database load.
  - **Guardrail:** add rate limits, payload limits, query reviews, and focused load checks before production MCP exposure.
- [ADDED] **Risk:** BYOK creates a secret-management support burden.
  - **Guardrail:** prefer no-storage MCP first; require a separate security-reviewed plan before storing provider keys.

## Suggested First Slice

Start with Phase 1 plus one Phase 2 diagnostic: confirmation email troubleshooting. That is high-value for support, low-risk because it is read-only, and it creates the reusable answer-context pattern needed by both Ask Queue optimization and MCP.

[EXPANDED] The first slice should include:

- Ask Queue token/cost baseline measurement.
- Confirmation email diagnostic typed result states.
- Field-level redaction policy for the diagnostic response.
- Admin-only auth/RBAC tests.
- Audit-log tests.
- Negative tests for missing entry/show IDs, unauthorized access, and unavailable email source data.
- A feature flag or server-side disable switch for the diagnostic.
