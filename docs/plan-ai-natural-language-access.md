# AI Natural-Language Access Plan

> **Status:** Planned
> **Created:** 2026-06-16

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

Exit criteria:

- A short inventory of current LLM call sites and cost drivers exists.
- The top 5-10 high-volume question types have proposed structured data sources.
- No new user-facing surface is introduced yet.

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

Exit criteria:

- Admin can retrieve support facts without direct database spelunking.
- Each diagnostic has tests for auth, show scoping, and expected evidence fields.
- Answers identify data freshness and source tables/services.

### Phase 3 — In-App AI Context Reuse

Purpose: make Ask Queue cheaper and more accurate using the same deterministic context layer.

- Rewire eligible Ask Queue categories to gather structured facts before invoking an LLM.
- For simple factual answers, consider deterministic responses that do not call an LLM.
- For natural-language responses, pass compact structured context to the LLM instead of broad/raw data.
- Add answer templates for common exhibitor and secretary questions where a full LLM is unnecessary.
- Preserve credit accounting transparency: users should understand when a question used AI credits versus a deterministic lookup.

Exit criteria:

- Common factual questions can be answered with fewer tokens or no LLM call.
- Existing Ask Queue behavior remains intact for questions that truly need model reasoning.
- Credit/token usage can be measured before and after the change.

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

Exit criteria:

- One myK9 MCP endpoint works from at least Claude and ChatGPT test configurations.
- Tool responses are role-scoped and auditable.
- No write-capable secretary/show-day mutations are exposed.

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

Exit criteria:

- Secretary tools answer common operational questions without duplicating Entries Management or the workbench.
- Deep links route users back into existing pages for action.
- Permission tests prove one secretary cannot access another show's data.

### Phase 6 — BYOK Evaluation

Purpose: decide whether in-app bring-your-own-key is worth the product and security cost.

- Compare MCP power-user usage against Ask Queue credit pain.
- Evaluate BYOK options for OpenAI, Anthropic, and Gemini API keys.
- Define the security model for storing, encrypting, rotating, and deleting user keys.
- Decide whether BYOK belongs in the product, or whether MCP plus optimized Ask Queue is enough.

Exit criteria:

- A written go/no-go decision exists.
- If approved, BYOK has a separate implementation plan with security review before coding.

## Testing Phase

Every implementation phase must include tests before it is considered complete.

- Unit tests for tool input validation, role scoping, and response shaping.
- Integration tests for diagnostic services against representative seeded data.
- Auth/RBAC tests for admin, secretary, exhibitor, and unauthorized users.
- Audit-log tests proving every AI/MCP diagnostic request is recorded.
- Regression tests proving MCP/deep-link flows do not bypass canonical app workflows.
- Token/cost tests or measurements for Ask Queue changes where feasible.
- Manual verification with at least one Claude configuration and one ChatGPT configuration before calling MCP cross-client support complete.

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

## Suggested First Slice

Start with Phase 1 plus one Phase 2 diagnostic: confirmation email troubleshooting. That is high-value for support, low-risk because it is read-only, and it creates the reusable answer-context pattern needed by both Ask Queue optimization and MCP.
