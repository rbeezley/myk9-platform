# Site Admin MCP V1 Implementation Plan

> **Status:** Active — metadata reconciled 2026-09-05.
> Richard owns reconciliation: existing historical implementation/status is preserved below; closure evidence is not independently established in this pass. Keep active pending that evidence.


> **Status:** V1.0 validated 2026-08-29; optional V1.1 deferred until usage proves the lookup friction

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, site-admin-only myK9 MCP server that lets Codex/Claude ask myK9-aware read-only admin questions without turning Supabase into a raw SQL chat surface.

**Architecture:** Add a new TypeScript workspace package, `@myk9/admin-mcp`, that runs as a local MCP stdio server. Tools call Supabase with an admin/service-role client, but return typed, redacted, myK9-specific results with stable result states and app deep links.

**Tech Stack:** TypeScript, Node 22+, pnpm workspaces, `@supabase/supabase-js`, MCP TypeScript SDK, Vitest, Zod or SDK-compatible JSON schema validation.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This uses a Supabase service-role key and exposes admin diagnostics over MCP; even though V1 is local and read-only, auth scope, secret handling, redaction, and query bounds must be verified carefully.

## Global Constraints

- V1 is for the site owner/admin only; do not expose this to exhibitors, secretaries, or hosted public clients.
- V1 is read-only for myK9 data. No create, update, delete, refund, publish, email-send, role-grant, or Stripe mutation tools.
- [ADDED] V1 must use stdio/local process transport only. Do not add HTTP/SSE transport, network listeners, tunnels, or hosted deployment in this plan.
- Do not build a new myK9Show page and do not duplicate Entries Management, Show Desk, or the secretary workbench.
- The tools must answer in business terms: shows, entries, confirmation email state, payments, access, and configuration readiness.
- Use typed tool inputs and typed tool outputs; do not expose raw database rows as the final MCP response.
- Redact unnecessary PII by default. Return names, email addresses, and payment references only when they are needed to answer the admin question.
- Include canonical app deep links for follow-up actions instead of adding write tools.
- The server must fail closed when env vars are missing, query inputs are ambiguous, or Supabase returns an error.
- [ADDED] Every list-style tool must have a default limit, a hard max limit, and deterministic ordering.
- [ADDED] Treat whoever can run the local server with `MYK9_MCP_SUPABASE_SERVICE_ROLE_KEY` as the site admin. Do not add user impersonation or role-scoped access in V1.
- [ADDED] Do not commit service-role keys, `.env` files, logs containing query results, or generated MCP client config with secrets.
- Keep implementation files under 500 lines.
- Every implementation phase includes tests before it is considered complete.

---

## Scope Decision

This plan is the V1 slice of [`docs/plan-ai-natural-language-access.md`](docs/plan-ai-natural-language-access.md). It intentionally narrows the larger AI-access idea to local admin MCP diagnostics.

V1 is not AskQ. AskQ remains the in-app exhibitor question feature.

V1 is not generic Supabase MCP. Generic Supabase MCP can inspect tables and run SQL. This server exposes myK9-aware tools like `diagnose_confirmation_email`, `list_unpaid_entries`, and `summarize_show_configuration`.

V1 is not write-capable. Write tools should be planned later as draft-and-confirm workflows after read-only tools prove useful.

## File Structure

- Create `packages/admin-mcp/package.json`  
  Package scripts and dependencies for the local MCP server.

- Create `packages/admin-mcp/tsconfig.json`  
  TypeScript config for Node ESM.

- Create `packages/admin-mcp/src/index.ts`  
  Process entry point. Loads config, creates Supabase client, registers MCP tools, and starts stdio transport.

- Create `packages/admin-mcp/src/config.ts`  
  Reads and validates `MYK9_MCP_SUPABASE_URL`, `MYK9_MCP_SUPABASE_SERVICE_ROLE_KEY`, `MYK9_MCP_APP_BASE_URL`, and `MYK9_MCP_ENV_LABEL`.

- Create `packages/admin-mcp/src/db/supabaseAdmin.ts`  
  Creates the typed Supabase admin client with `persistSession: false`.

- Create `packages/admin-mcp/src/mcp/server.ts`  
  Registers tools with MCP, maps validation failures to safe MCP responses, and centralizes logging.

- Create `packages/admin-mcp/src/tools/schemas.ts`  
  Defines tool input schemas and shared validation helpers for UUIDs, search strings, limits, and optional show scope.

- Create `packages/admin-mcp/src/tools/index.ts`  
  Registers all V1 tools.

- Create `packages/admin-mcp/src/diagnostics/types.ts`  
  Shared result types: `found`, `not_found`, `ambiguous`, `insufficient_data`, `source_unavailable`, and `error`.

- Create `packages/admin-mcp/src/diagnostics/links.ts`  
  Builds myK9Show deep links from configured `MYK9_MCP_APP_BASE_URL`.

- Create `packages/admin-mcp/src/diagnostics/redaction.ts`  
  Redacts or trims PII and raw provider IDs before returning evidence.

- Create `packages/admin-mcp/src/diagnostics/showDiagnostics.ts`  
  Implements `lookup_show`, `list_recent_shows`, and `summarize_show_configuration`.

- Create `packages/admin-mcp/src/diagnostics/entryDiagnostics.ts`  
  Implements `lookup_entry`, `diagnose_entry`, `list_unpaid_entries`, and `list_unconfirmed_entries`.

- Create `packages/admin-mcp/src/diagnostics/emailDiagnostics.ts`  
  Implements `diagnose_confirmation_email`.

- Create `packages/admin-mcp/src/diagnostics/paymentDiagnostics.ts`  
  Implements `diagnose_payment`.

- Create `packages/admin-mcp/src/diagnostics/accessDiagnostics.ts`  
  Implements `list_show_access`.

- Create `packages/admin-mcp/src/__tests__/*.test.ts`  
  Unit tests for config, schemas, redaction, links, and diagnostic query shaping.

- Create `docs/admin-mcp-local-setup.md`  
  Local setup guide for Codex/Claude MCP configuration and required env vars.

- Modify `package.json`  
  Add root scripts for building, testing, and running the admin MCP package.

- Modify `.mcp.json`  
  Add an example local `myk9-admin` server entry only if the implementation can reference env vars without committing secrets.

## Tool Contract

All tools return this envelope:

```ts
type DiagnosticState =
  'found' | 'not_found' | 'ambiguous' | 'insufficient_data' | 'source_unavailable' | 'error';

interface DiagnosticEvidence {
  label: string;
  value: string | number | boolean | null;
  source: string;
}

interface DiagnosticLink {
  label: string;
  url: string;
}

interface DiagnosticResult<TSummary extends Record<string, unknown> = Record<string, unknown>> {
  state: DiagnosticState;
  envLabel: 'local' | 'staging' | 'production';
  summary: TSummary;
  evidence: DiagnosticEvidence[];
  links: DiagnosticLink[];
  limitations: string[];
}
```

V1 tools:

- `list_recent_shows({ query?: string, limit?: number })`
- `lookup_show({ showId?: string, query?: string })`
- `summarize_show_configuration({ showId: string })`
- `lookup_entry({ entryId?: string, showId?: string, armbandNumber?: string, dogName?: string, handlerName?: string })`
- `diagnose_entry({ entryId: string })`
- `list_unpaid_entries({ showId: string, limit?: number })`
- `list_unconfirmed_entries({ showId: string, limit?: number })`
- `diagnose_confirmation_email({ entryId: string })`
- `diagnose_payment({ entryId?: string, paymentIntentId?: string, checkoutSessionId?: string })`
- `list_show_access({ showId: string })`

## Verified Schema Anchors

[ADDED] Implementation must use these verified names instead of rediscovering or guessing them in each task:

- Generated database types already exist at `packages/supabase/src/types/database.types.ts`.
- Entry confirmation fields are `entries.confirmation_email_sent_at`, `entries.confirmation_email_message_id`, and `entries.confirmation_email_status`.
- `email_log` exists and links related records through generic `email_log.related_id`; Resend delivery updates use `email_log.resend_message_id` and `email_log.status`.
- `stripe_orders.amount_cents` stores cents, not dollars.
- `stripe_orders.entry_ids` is a `uuid[]`; entry-to-order lookup must use an array-contains query, not equality on a scalar entry id.
- `stripe_orders.stripe_payment_intent_id` and `stripe_orders.stripe_checkout_session_id` are the provider lookup fields.
- Role assignments live in `user_roles`; role names live in `roles`.
- Show access must consider both show-scoped roles (`user_roles.show_id = show.id`) and club-scoped roles for the show club (`user_roles.show_id IS NULL AND user_roles.club_id = shows.club_id`), while labeling inactive or expired grants using `user_roles.is_active` and `user_roles.expires_at`.
- [VERIFIED 2026-08-29] Current role names are `chairman`, `club_admin`, `exhibitor`, `judge`, `secretary`, `site_admin`, and `steward`. The access diagnostic tests the five policy-relevant roles and mirrors the current `is_show_secretary` / `is_show_official` scope rules, including active-club-membership enforcement for club-scoped secretaries.

## Milestone Cut

[REVISED] Ship the cross-table diagnostics first, lookups second. Rationale: the value of a curated myK9 tool concentrates where the _plausible_ query and the _correct_ query diverge and the wrong answer looks authoritative — confirmation email (must cross-check `email_log`, not just `entries.confirmation_email_status`), payment (`entry_ids[]` array-contains and `amount_cents` conversion), and show access (show-scoped + club-scoped role union). Simple lookups (`lookup_show`, `lookup_entry`, `list_recent_shows`) add little over the already-connected generic Supabase MCP, which writes those queries correctly on the first try. Building the lookups first would front-load the low-value tools and defer the whole reason the package exists.

- **V1.0 — the answers ad-hoc SQL gets wrong:** Tasks 0-3 (scaffold, envelope, redaction, links, server) + **Task 6** (`diagnose_confirmation_email`) + **Task 7** (`diagnose_payment`) + **Task 8** (`list_show_access`) + Task 9 docs + Task 10 smoke scoped to those three tools. This proves the local MCP server, the typed envelope, and the three diagnostics whose cross-checks the AI will not reliably reconstruct.
  - [ADDED] In V1.0 the admin sources entry/show IDs via the generic Supabase MCP or the app UI, then feeds them to the diagnostics. No myK9-aware lookup tool is required to reach a diagnostic.
- **V1.1 — ergonomic lookups, only if reached for:** Task 4 (`lookup_show`, `list_recent_shows`, `summarize_show_configuration`) + Task 5 (`lookup_entry`, `diagnose_entry`, `list_unpaid_entries`, `list_unconfirmed_entries`) + expanded Task 10 smoke. Add these only after V1.0 use confirms the ID-sourcing workflow is annoying enough to warrant curated lookups; otherwise the generic Supabase MCP covers them.
  - [ADDED] Optional even-lighter probe before committing to V1.1: document the three V1.0 diagnostic queries in `docs/admin-diagnostics.md` for the AI to read, and only promote a lookup to a curated tool once you have actually reached for it repeatedly.

## V1.0 Closure Evidence — 2026-08-29

### Requirements audit

| Requirement                              | Status          | Evidence                                                                                                                                                                   |
| ---------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local, owner-only stdio server           | Covered         | Tasks 1 and 3; live MCP client connected over stdio with no app server running.                                                                                            |
| Read-only, typed, bounded diagnostics    | Covered         | Tasks 3 and 6–8; source review found no mutation calls, queries are ordered/capped, and only three V1.0 tools register.                                                    |
| Fail-closed validation and source errors | Covered         | Task 3 tests plus live invalid-UUID result (`error`, `isError: true`) and no-env startup refusal.                                                                          |
| Redacted output and secret handling      | Covered         | Task 2 boundary tests recursively scrub summaries, evidence, and limitations; live response scan contained no service-role key.                                            |
| Current RBAC/schema fidelity             | Covered         | Task 0 live role inventory; Task 8 mirrors global site-admin, show/club scope, active membership, expiry, and linked-auth requirements.                                    |
| Real-schema tool proof                   | Covered         | Staging stdio smoke: confirmation `insufficient_data`, payment `found`, access `found`, missing entry `not_found`; every registered tool returned a typed non-error state. |
| Production smoke                         | Waived for V1.0 | No separate myK9Show production environment exists yet. Repeat the same read-only smoke after production is provisioned; this does not block the local staging-only V1.0.  |

### Coverage: 100/100 for the available V1.0 environment

The implementation, failure modes, security boundary, and current staging schema are verified. The only unavailable check is the explicitly documented production rerun. V1.1 remains optional and is not part of V1.0 closure.

## Task 0: Pin Schema and SDK Assumptions

**Files:**

- Modify: `docs/admin-mcp-local-setup.md` if implementation discovers setup-specific SDK constraints
- Read: `packages/supabase/src/types/database.types.ts`
- Read: `supabase/migrations/005_myk9show_specific.sql`
- Read: `supabase/migrations/061_email_log_and_confirmation_message.sql`
- Read: `supabase/migrations/192_heritage_trial_pages.sql`
- Read: `supabase/migrations/20260619140000_fix_waitlist_entries_rls_role_name.sql`

**Interfaces:**

- Produces: exact import path for generated database types
- Produces: exact MCP SDK import names for stdio server startup

- [x] Confirm the current official MCP TypeScript SDK package name and stdio API before coding.
- [x] Confirm `packages/supabase/src/types/database.types.ts` exports a `Database` type suitable for `createClient<Database>()`.
- [x] Confirm the verified schema anchors above still match the current branch.
- [x] [ADDED] Query or inspect seeded migrations for the exact `roles.name` values used for show officials and admins; update Task 8 tests to match real role strings, not display labels.
- [x] Add a package-local schema anchor comment near diagnostic query code that points back to this plan section.
- [x] Verify with a quick TypeScript compile after Task 1 creates the package.

## Task 1: Scaffold the Local MCP Package

**Files:**

- Create: `packages/admin-mcp/package.json`
- Create: `packages/admin-mcp/tsconfig.json`
- Create: `packages/admin-mcp/src/index.ts`
- Create: `packages/admin-mcp/src/config.ts`
- Create: `packages/admin-mcp/src/__tests__/config.test.ts`
- Modify: `package.json`

**Interfaces:**

- Produces: `loadAdminMcpConfig(env: NodeJS.ProcessEnv): AdminMcpConfig`
- Produces: `AdminMcpConfig`

- [x] Create a feature worktree before implementation because this task writes TypeScript code.
- [x] [ADDED] Before choosing MCP SDK imports, verify the current official MCP TypeScript SDK package name and stdio server API. Pin the package version in `packages/admin-mcp/package.json`.
- [x] Add the package with TypeScript ESM, Vitest, `tsx`, `@supabase/supabase-js`, the MCP TypeScript SDK, and validation dependency choices pinned in `package.json`.
- [x] Add root scripts:
  - `mcp:admin` runs the local server.
  - `mcp:admin:test` runs package tests.
  - `mcp:admin:build` typechecks and builds the package.
- [x] Write a failing config test that rejects missing Supabase URL, service-role key, and app base URL.
- [x] [ADDED] Write a failing config test that rejects `MYK9_MCP_ENV_LABEL` values outside `local`, `staging`, and `production`.
- [x] [ADDED] Write a failing config test that rejects non-positive limits and caps `MYK9_MCP_MAX_LIMIT` at 100.
- [x] Implement `loadAdminMcpConfig`.
- [x] Verify with `pnpm --dir packages/admin-mcp test`.

Expected config behavior:

```ts
interface AdminMcpConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  appBaseUrl: string;
  envLabel: 'local' | 'staging' | 'production';
  defaultLimit: number;
  maxLimit: number;
}
```

## Task 2: Add Shared Diagnostic Types, Redaction, and Links

**Files:**

- Create: `packages/admin-mcp/src/diagnostics/types.ts`
- Create: `packages/admin-mcp/src/diagnostics/redaction.ts`
- Create: `packages/admin-mcp/src/diagnostics/links.ts`
- Create: `packages/admin-mcp/src/__tests__/diagnosticEnvelope.test.ts`
- Create: `packages/admin-mcp/src/__tests__/redaction.test.ts`
- Create: `packages/admin-mcp/src/__tests__/links.test.ts`

**Interfaces:**

- Consumes: `AdminMcpConfig`
- Produces: `DiagnosticResult`
- Produces: `redactEmail(email: string | null | undefined): string | null`
- Produces: `buildShowLink(config: AdminMcpConfig, showId: string): DiagnosticLink`
- Produces: `buildEntryManagementLink(config: AdminMcpConfig, showId: string, entryId?: string): DiagnosticLink`

- [x] [ADDED] Write failing tests proving each diagnostic envelope includes the configured `envLabel`.
- [x] Write failing tests for each `DiagnosticState`.
- [x] Write failing tests proving `redactEmail('handler@example.com')` returns `h***@example.com`.
- [x] Write failing tests proving Stripe IDs are shortened to a prefix and last 4 characters in summary evidence.
- [x] [ADDED] Write failing tests proving service-role-looking tokens, JWT-looking strings, and full checkout URLs are redacted from evidence values.
- [x] Write failing tests for show and entry-management links.
- [x] Implement the shared envelope, redaction helpers, and link helpers.
- [x] Verify with `pnpm --dir packages/admin-mcp test`.

## Task 3: Register MCP Server and Tool Validation

**Files:**

- Create: `packages/admin-mcp/src/db/supabaseAdmin.ts`
- Create: `packages/admin-mcp/src/mcp/server.ts`
- Create: `packages/admin-mcp/src/tools/schemas.ts`
- Create: `packages/admin-mcp/src/tools/index.ts`
- Create: `packages/admin-mcp/src/__tests__/schemas.test.ts`
- Modify: `packages/admin-mcp/src/index.ts`

**Interfaces:**

- Consumes: `AdminMcpConfig`
- Consumes: `DiagnosticResult`
- Produces: `createSupabaseAdminClient(config: AdminMcpConfig)`
- Produces: `createAdminMcpServer(deps: AdminMcpServerDeps)`
- Produces: validated input schemas for all V1 tools

- [x] Write failing schema tests for UUID validation, trimmed search strings, default limits, and max limits.
- [x] Implement schemas for all V1 tools.
- [x] Implement the Supabase admin client with `persistSession: false`.
- [x] Register MCP tools with typed schemas and a shared response formatter.
- [x] Log each tool call to stderr with tool name, env label, result state, elapsed milliseconds, and no secrets.
- [x] [ADDED] Stamp `envLabel` into every tool response so the admin can see whether an answer came from local, staging, or production.
- [x] [ADDED] Catch Supabase query errors and unexpected exceptions at the MCP boundary and return `state: 'source_unavailable'` or `state: 'error'` with a short limitation. Do not throw stack traces to the MCP client.
- [x] [ADDED] Add a server-level tool allowlist so only the V1 tools in this plan can be registered.
- [x] Start the server over stdio in `src/index.ts`.
- [x] Verify with `pnpm --dir packages/admin-mcp test` and `pnpm --dir packages/admin-mcp typecheck`.

## Task 4: Show Lookup and Show Configuration Tools

**Files:**

- Create: `packages/admin-mcp/src/diagnostics/showDiagnostics.ts`
- Create: `packages/admin-mcp/src/__tests__/showDiagnostics.test.ts`
- Modify: `packages/admin-mcp/src/tools/index.ts`

**Interfaces:**

- Produces: `listRecentShows(input, deps): Promise<DiagnosticResult>`
- Produces: `lookupShow(input, deps): Promise<DiagnosticResult>`
- Produces: `summarizeShowConfiguration(input, deps): Promise<DiagnosticResult>`

- [ ] Write failing tests for `list_recent_shows` returning a compact list of show IDs, names, dates, status, and club names.
- [ ] [ADDED] Write failing tests for no matching shows returning `state: 'not_found'`.
- [ ] Write failing tests for `lookup_show` returning `ambiguous` when a text query matches multiple shows.
- [ ] Write failing tests for `summarize_show_configuration` returning evidence for trials, classes, officials, entry counts, payment setup, and publication status.
- [ ] Implement the minimal Supabase queries using the actual table and column names verified from generated database types or migrations.
- [ ] [ADDED] Keep `summarize_show_configuration` bounded: query counts and compact facts, not full entry/class row dumps.
- [ ] Add myK9Show links to public show detail and secretary/admin management surfaces where IDs exist.
- [ ] Verify with `pnpm --dir packages/admin-mcp test`.

## Task 5: Entry Lookup and Entry State Diagnostics

**Files:**

- Create: `packages/admin-mcp/src/diagnostics/entryDiagnostics.ts`
- Create: `packages/admin-mcp/src/__tests__/entryDiagnostics.test.ts`
- Modify: `packages/admin-mcp/src/tools/index.ts`

**Interfaces:**

- Produces: `lookupEntry(input, deps): Promise<DiagnosticResult>`
- Produces: `diagnoseEntry(input, deps): Promise<DiagnosticResult>`
- Produces: `listUnpaidEntries(input, deps): Promise<DiagnosticResult>`
- Produces: `listUnconfirmedEntries(input, deps): Promise<DiagnosticResult>`

- [ ] Write failing tests for lookup by `entryId`.
- [ ] Write failing tests for lookup by `showId + armbandNumber`.
- [ ] Write failing tests for ambiguous `dogName` or `handlerName` matches.
- [ ] [ADDED] Write failing tests for no matching entry returning `state: 'not_found'`.
- [ ] Write failing tests for unpaid entries using `payment_status` and status fields from the actual `entries` schema.
- [ ] Write failing tests for unconfirmed entries using `confirmation_email_sent_at` and `confirmation_email_status`.
- [ ] [ADDED] Write failing tests that list tools return no more than `maxLimit` rows and include a limitation when results are truncated.
- [ ] Implement entry diagnostics with compact evidence: entry status, payment status, dog, handler, armband, show, class/trial, confirmation state, and relevant IDs.
- [ ] Return no full address, phone, or unnecessary profile fields.
- [ ] Verify with `pnpm --dir packages/admin-mcp test`.

## Task 6: Confirmation Email Diagnostic

**Files:**

- Create: `packages/admin-mcp/src/diagnostics/emailDiagnostics.ts`
- Create: `packages/admin-mcp/src/__tests__/emailDiagnostics.test.ts`
- Modify: `packages/admin-mcp/src/tools/index.ts`

**Interfaces:**

- Produces: `diagnoseConfirmationEmail(input, deps): Promise<DiagnosticResult>`

- [x] Write failing tests for an entry with `confirmation_email_status = 'sent'`.
- [x] Write failing tests for an entry with `confirmation_email_status = 'failed'`.
- [x] Write failing tests for an entry with no sent timestamp and no message ID.
- [x] [ADDED] Write failing tests for Supabase/email-log lookup failure returning `state: 'source_unavailable'` without claiming the email failed.
- [x] Include evidence from `entries.confirmation_email_sent_at`, `entries.confirmation_email_message_id`, and `entries.confirmation_email_status`.
- [x] [EXPANDED] Look up `email_log` by `related_id = entry.id` and, when `entries.confirmation_email_message_id` is present, also by `resend_message_id = entries.confirmation_email_message_id`.
- [x] [EXPANDED] Include `email_log.status`, `email_log.error_message`, `email_log.created_at`, and shortened `email_log.resend_message_id` when available.
- [x] If no matching `email_log` row exists, add a limitation saying no email-log row was found for the entry ID or confirmation message ID.
- [x] Return a plain admin summary like “confirmation email was marked sent, but no email-log row was found.”
- [x] Verify with `pnpm --dir packages/admin-mcp test`.

## Task 7: Payment Diagnostic

**Files:**

- Create: `packages/admin-mcp/src/diagnostics/paymentDiagnostics.ts`
- Create: `packages/admin-mcp/src/__tests__/paymentDiagnostics.test.ts`
- Modify: `packages/admin-mcp/src/tools/index.ts`

**Interfaces:**

- Produces: `diagnosePayment(input, deps): Promise<DiagnosticResult>`

- [x] Write failing tests for payment diagnosis by `entryId`.
- [x] Write failing tests for payment diagnosis by Stripe payment intent ID.
- [x] Write failing tests for payment diagnosis by checkout session ID.
- [x] [ADDED] Write failing tests for multiple matching `stripe_orders` rows returning `state: 'ambiguous'`.
- [x] [ADDED] Write failing tests proving display amounts are derived from `stripe_orders.amount_cents / 100`.
- [x] [ADDED] Write failing tests proving entry-to-order lookup uses `stripe_orders.entry_ids` array containment.
- [x] Query `entries`, `stripe_orders`, and `stripe_customers` only as needed for the identifier provided.
- [x] Include evidence for payment status, order status, amount, paid timestamp, linked entry IDs, and shortened provider references.
- [x] [EXPANDED] Treat `stripe_orders.amount_cents` as integer cents in all summaries and evidence; never label it as dollars without conversion.
- [x] [EXPANDED] For `entryId`, find matching online orders with array containment on `stripe_orders.entry_ids`; do not use scalar equality.
- [x] Add limitations when an entry has `payment_status = 'paid'` but no matching `stripe_orders` row, because mail/check/manual payment can be valid.
- [x] Verify with `pnpm --dir packages/admin-mcp test`.

## Task 8: Show Access Diagnostic

**Files:**

- Create: `packages/admin-mcp/src/diagnostics/accessDiagnostics.ts`
- Create: `packages/admin-mcp/src/__tests__/accessDiagnostics.test.ts`
- Modify: `packages/admin-mcp/src/tools/index.ts`

**Interfaces:**

- Produces: `listShowAccess(input, deps): Promise<DiagnosticResult>`

- [x] Write failing tests for active secretary, chairman, steward, club admin, and site admin roles.
- [x] [ADDED] Write failing tests for inactive and expired roles being clearly labeled instead of silently omitted.
- [x] [ADDED] Write failing tests proving club-scoped roles for the show's `club_id` are included even when `user_roles.show_id` is null.
- [x] Query `user_roles`, `roles`, and `people` using actual role names from the database/migrations.
- [x] [EXPANDED] First load the show's `club_id`; then union show-scoped grants and club-scoped grants for that club. Mirror the access pattern used by `is_show_secretary(show_id)` / `is_club_admin(club_id)` policies.
- [x] [ADDED] Add a limitation note if a grant has both a non-matching `show_id` and the show's `club_id`; V1 does not count it as show access unless current policy helpers do.
- [x] Return role name, person display name, redacted email, active state, club scope, show scope, and expiration when present.
- [x] Include a limitation if the show has no scoped secretary-like role.
- [x] Verify with `pnpm --dir packages/admin-mcp test`.

## Task 9: Local Setup Documentation and MCP Config

**Files:**

- Create: `docs/admin-mcp-local-setup.md`
- Modify: `.mcp.json` only if the config can be committed without secrets

**Interfaces:**

- Consumes: root script `pnpm mcp:admin`
- Produces: local setup instructions for Codex/Claude

- [x] Document the purpose: local site-admin read diagnostics only.
- [x] Document required env vars:
  - `MYK9_MCP_SUPABASE_URL`
  - `MYK9_MCP_SUPABASE_SERVICE_ROLE_KEY`
  - `MYK9_MCP_APP_BASE_URL`
  - `MYK9_MCP_ENV_LABEL`
- [x] [ADDED] Document that the service-role key gives full database access, so this server should only run on the owner's trusted machine.
- [x] [ADDED] Document how to disable the server by removing or commenting out the `myk9-admin` MCP entry.
- [x] Document example questions:
  - “Which entries are unpaid for this show?”
  - “Why did this entry not get a confirmation email?”
  - “Who has secretary access to this show?”
  - “Does this show look ready to publish?”
- [x] Document that generic Supabase MCP still exists for schema/database work, while this package is myK9-aware diagnostics.
- [x] Document that write actions are intentionally out of V1.
- [x] [ADDED] Document that committing `.mcp.json` changes is not docs-only work; implementation must use a feature branch/PR if it modifies `.mcp.json`.
- [x] Verify docs with `git diff --check`.

## Task 10: End-to-End Smoke Test and Hardening Pass

**Files:**

- Modify only files created in earlier tasks if failures are found.

**Interfaces:**

- Consumes: all V1 tools
- Produces: verified local MCP server

- [x] Run `pnpm mcp:admin:build`.
- [x] Run `pnpm mcp:admin:test`.
- [x] Run one local MCP smoke test from Codex or Claude with staging credentials.
- [ ] [DEFERRED — no separate production environment exists] Run one smoke test with production credentials only after staging smoke passes.
- [x] [REVISED] V1.0 smoke questions (the three diagnostics; source the IDs via generic Supabase MCP or the app UI):
  - “Diagnose the confirmation email for this entry ID.”
  - “Diagnose the payment for this entry ID / payment intent ID.”
  - “Who has access to this show?”
- [ ] [ADDED] V1.1 smoke questions (only once lookups ship):
  - “List recent shows.”
  - “Summarize configuration for this show ID.”
  - “List unpaid entries for this show ID.”
- [x] [ADDED] Run at least one real-schema smoke call for every registered tool and require `state !== 'error'`. A mocked query-builder test is not enough to call a tool complete.
- [x] Confirm no response contains the service-role key, full Stripe secrets, raw table dumps, or unrelated PII.
- [x] Confirm the server works without running the myK9Show dev server.
- [x] Confirm the server fails closed when a required env var is missing.
- [x] [ADDED] Confirm invalid UUIDs, ambiguous inputs, and empty result sets return typed diagnostic states.
- [x] Confirm all returned links use `MYK9_MCP_APP_BASE_URL`.

## Testing Phase

Required before calling V1 complete:

- Unit tests for config validation, schema validation, redaction, link building, and result envelope states.
- Unit tests for each diagnostic function using mocked Supabase query builders.
- [ADDED] Real-schema smoke coverage for every registered tool against staging, because mocked query builders cannot prove column names or array operators are correct.
- Negative tests for missing IDs, invalid UUIDs, ambiguous lookup inputs, missing source rows, and Supabase query errors.
- Tests proving every tool caps `limit` to `maxLimit`.
- Tests proving confirmation email and payment diagnostics return `insufficient_data` or a limitation instead of inventing an answer.
- [ADDED] Tests proving unbounded questions cannot return raw table dumps or more than `maxLimit` rows.
- [ADDED] Tests proving Supabase errors return safe diagnostic states and do not expose stack traces or secrets.
- Typecheck for `packages/admin-mcp`.
- Local MCP smoke test from at least one AI client.

Do not run the full app E2E suite for this V1 unless implementation touches app UI or shared app code. This package should be isolated from myK9Show runtime.

## Deferred Beyond V1

- Hosted remote MCP server.
- OAuth/user-scoped MCP access.
- Secretary or exhibitor MCP access.
- AskQ cost optimization.
- Write-capable MCP tools.
- Draft-and-confirm dog, show, class, or role mutations.
- Stripe or Resend provider API calls beyond reading myK9-stored status.
- Database audit table for MCP tool calls.
- [ADDED] Running the MCP server from CI, Vercel, Supabase Edge Functions, or any shared host.

## Rollout Notes

Start with staging credentials. Because the project has no real production users or real production data yet, production reads are acceptable after staging smoke tests pass, but the tool remains local and owner-only.

If a tool returns misleading or overbroad data, disable that tool by unregistering it from `packages/admin-mcp/src/tools/index.ts` and keep the rest of the server usable.

[ADDED] If the whole server misbehaves, remove or comment out the local `myk9-admin` MCP client entry and stop the local process. No database migration or app deploy is required to roll back V1.
