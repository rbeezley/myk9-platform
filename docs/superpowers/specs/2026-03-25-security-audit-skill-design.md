# Security Audit Skill — Design Spec

**Date:** 2026-03-25
**Status:** Draft

## Overview

A Claude Code skill that audits the myK9 platform for security vulnerabilities. Operates in two modes: **full audit** (proactive, entire project) and **diff review** (reactive, scoped to branch changes). Generates a markdown report with severity-rated findings, then offers to auto-fix what it can.

## Motivation

We have three security-adjacent skills (`code-review-extensions`, `phase-review`, `debugging-patterns`) but none provide a standalone security audit workflow. Our attack surface includes Supabase RLS on 53 tables, 12+ edge functions, a 7-role RBAC system, Stripe payment flows, and client-side auth state management. Research during design uncovered a critical RLS gap on `user_roles` and several medium-severity issues — we need a repeatable way to find these.

## Skill Structure

```
.claude/skills/security-audit/
├── SKILL.md              # Main skill (~300 lines, max 500)
└── references/
    └── checklist.md      # Tailored security checklist (~200 lines, max 500)
```

Installed as a project-local skill in `.claude/skills/`. Not a superpowers plugin — it's specific to this project's stack. Both files must stay under 500 lines per project conventions.

**File responsibilities:**

- **SKILL.md** — Frontmatter, mode detection, argument parsing, workflow steps, report format template, fix workflow instructions, parallelism hints
- **references/checklist.md** — The 7 security check categories with their specific checks (what to look for). Pure reference data, no workflow logic.

## Mode Detection

The skill auto-detects which mode to run:

1. If argument is `--full` or `full` → **full audit mode**
2. Else if current branch != main AND there's a diff against main → **diff review mode**
3. Else → **full audit mode** (on main with no args)

**Invocation examples:**

- `/security-audit` — auto-detect
- `/security-audit --full` — force full audit from any branch
- `/security-audit feature/new-rls` — review that branch's diff

**Argument parsing:** Parse `$ARGUMENTS` as follows: if it contains `--full` or `full`, use full audit mode. If it contains a branch name, use diff review mode with `git diff main...<branch>` (allows reviewing a branch without checking it out). If empty, auto-detect based on current branch (feature branch → diff review using `git diff main...HEAD`, main → full audit).

## Checklist Categories

The skill reads `references/checklist.md` for its check categories. Each category lists specific checks tailored to our stack.

### 1. RLS Policy Integrity

- New tables have `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- Policies use helper functions (`is_platform_admin()`, `can_manage_show()`, etc.) not inline auth logic
- No `WITH CHECK (true)` on sensitive tables without a documented `-- RATIONALE:` comment
- SELECT policies respect `deleted_at IS NULL` for soft-deleted rows
- Storage policies validate path ownership (`storage.foldername(name)` checks)
- Mutation policies (INSERT/UPDATE/DELETE) restrict to appropriate roles

### 2. Edge Function Auth

- JWT verified via `supabase.auth.getUser(token)` before any operations
- Unauthenticated endpoints are only webhooks or internal-trigger functions
- Role/permission checks query `user_roles` table, not JWT `app_metadata` claims
- `SUPABASE_SERVICE_ROLE_KEY` never exposed to client or logged
- CORS restricted to known origins (not `*` unless function is internal-only)
- Webhook endpoints verify signatures (Svix for Resend, Stripe signature for Stripe)

### 3. RBAC & Privilege Escalation

- Role assignment mutations restricted via RLS to authorized users
- Scoped permission checks validate `club_id`/`show_id` — no unguarded global fallthrough
- `SECURITY DEFINER` functions check `auth.uid()` internally
- No client-side-only authorization gates (server/RLS must enforce independently)
- `expires_at` and `is_active` respected in all role/permission queries
- `SecurityValidator` escalation prevention cannot be bypassed by direct DB calls

### 4. Client Auth Patterns

- `ProtectedRoute` wraps all role-gated routes with appropriate `requiredRole`/`requiredPermission`
- No sensitive data fetched before auth loading completes (`loading` state respected)
- Permission cache invalidation triggered on role changes
- Suspended user enforcement at both token hook and AuthContext levels
- No hardcoded credentials, API keys, or secrets in source files
- Dev-only features guarded by `import.meta.env.DEV` (not just a flag check)

### 5. Data Exposure

- Queries scope to current user's data — no cross-user PII leakage (health records, payment data, contact info)
- Error messages don't expose internal structure (table names, column names, SQL, stack traces)
- Logging services don't capture sensitive fields (passwords, tokens, card numbers, PII)
- Public endpoints and RLS SELECT policies return only intended fields (no `SELECT *` leaking extra columns)
- Soft-deleted data not visible via public queries

### 6. Payment Security (Stripe)

- All Stripe API calls go through edge functions (never client-direct with secret key)
- Stripe webhook signature verified on all webhook endpoints
- Price/amount validated server-side (client cannot set its own price)
- Customer portal session scoped to authenticated user's `stripe_customer_id`
- No Stripe secret keys in client bundles or environment variables with `VITE_` prefix

### 7. Input Validation

- User input reaches database via parameterized queries (Supabase client), not string concatenation
- File uploads validated for type, size, and path (no path traversal)
- URL/route parameters validated before use in queries or RPC calls
- No `dangerouslySetInnerHTML` with user-supplied content
- Form inputs sanitized via Zod schemas before submission

## Workflow

### Full Audit Mode

1. **Read checklist** — Load `references/checklist.md`
2. **Scan migrations** — Read all `supabase/migrations/*.sql` files. Check RLS policies, function definitions, grants, and helper functions against categories 1 and 3.
3. **Scan edge functions** — Read all `supabase/functions/*/index.ts` files. Check auth patterns, service role usage, CORS, webhook verification against category 2.
4. **Scan app source** — Grep for auth patterns, protected routes, data fetching, error handling, secrets, input handling against categories 4, 5, and 7.
5. **Scan Stripe integration** — Check edge functions and client service files against category 6.
6. **Generate report** — Write findings to `docs/security-audit-YYYY-MM-DD.md`. If a report for today's date already exists, overwrite it.
7. **Offer fixes** — Ask user if they want auto-fixable issues addressed

### Diff Review Mode

1. **Read checklist** — Load `references/checklist.md`
2. **Get diff** — `git diff main...HEAD` (auto-detect) or `git diff main...<branch>` (explicit branch arg) to identify changed files
3. **Filter categories** — Only run categories whose file patterns appear in the diff:
   - `supabase/migrations/` changed → categories 1, 3
   - `supabase/functions/` changed → category 2
   - `src/context/Auth*`, `src/routes/`, `src/components/common/Protected*` changed → category 4
   - `src/services/stripe*`, Stripe edge functions changed → category 6
   - Any `.ts`/`.tsx` changed → categories 5, 7
4. **Scan changed files + immediate dependencies** — For changed `.sql` files, also read any SQL functions they reference (grep for function names in other migration files). For changed `.ts`/`.tsx` files, read files they directly import (one level of imports, not transitive).
5. **Generate report** — Write to `docs/security-review-YYYY-MM-DD-<branch>.md`. If a report for today's date and branch already exists, overwrite it.
6. **Offer fixes** — Same as full mode, scoped to findings

## Report Format

```markdown
# Security Audit — YYYY-MM-DD

**Mode:** Full Audit | Diff Review (branch: `<branch-name>`)
**Checklist version:** references/checklist.md @ <short-hash>

## Summary

| Severity  | Count |
| --------- | ----- |
| CRITICAL  | 0     |
| HIGH      | 0     |
| MEDIUM    | 0     |
| LOW       | 0     |
| **Total** | **0** |

Auto-fixable: N of M findings

## Findings

### [CRITICAL] SA-001: <title>

**Category:** <checklist category name>
**Location:** `<file-path>:<line>` (or migration number)
**Evidence:** <what was found — the actual code/policy>
**Risk:** <what an attacker could do>
**Fix:** <specific remediation>
**Auto-fixable:** Yes/No

---

(repeat for each finding, ordered by severity)

## Categories Checked

| Category                    | Files Examined | Findings | Skipped    |
| --------------------------- | -------------- | -------- | ---------- |
| RLS Policy Integrity        | 12             | 1        | —          |
| Edge Function Auth          | 8              | 0        | —          |
| RBAC & Privilege Escalation | 5              | 1        | —          |
| Client Auth Patterns        | —              | —        | No changes |
| ...                         |                |          |            |

## Previous Audit Comparison

(If a previous audit report exists in docs/, diff the findings:
new findings, resolved findings, unchanged findings)
```

### Severity Definitions

- **CRITICAL** — Exploitable now with minimal effort. Privilege escalation, unauthorized data access, or payment manipulation.
- **HIGH** — Auth bypass or data exposure achievable with moderate effort or chained conditions.
- **MEDIUM** — Defense-in-depth gap. Not directly exploitable alone but weakens overall posture.
- **LOW** — Best practice deviation or hardening opportunity. No direct exploit path.

## Auto-Fixable Criteria

A finding is **auto-fixable** if it can be resolved by adding or modifying a single file without changing application logic or requiring user decisions about business rules.

| Auto-fixable | Examples                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Yes**      | Adding missing `FORCE ROW LEVEL SECURITY`, replacing `WITH CHECK (true)` with a role-check policy, adding JWT verification boilerplate to an edge function, removing a hardcoded secret |
| **No**       | Redesigning permission scoping logic, changing RBAC architecture, deciding which roles should access a new table, restructuring auth flow                                               |

Rule of thumb: if the fix is mechanical (applying a known-good pattern), it's auto-fixable. If it requires a design decision, it's not.

## Fix Workflow

After generating the report:

1. Skill presents summary: _"Found N findings (X critical, Y high, Z medium, W low). M are auto-fixable."_
2. Asks: _"Want me to fix the M auto-fixable issues?"_
3. If yes:
   - Creates fixes as atomic commits, one per finding
   - Commit message format: `security: SA-NNN <short description>`
   - RLS fixes → new migration files (never modify existing migrations)
   - Edge function fixes → edit the function source
   - Client code fixes → edit source files
4. Each commit references the finding ID in the message
5. Non-auto-fixable findings remain in the report with manual guidance

## SKILL.md Design

### Frontmatter

```yaml
---
name: security-audit
description: Security audit for the myK9 platform. Two modes: full audit (all RLS, edge functions, RBAC, auth, Stripe, input validation) or diff review (scoped to branch changes). Use when asked to "audit security", "security review", "check for vulnerabilities", or before major releases.
user-invocable: true
argument-hint: [--full | branch-name]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git *), Agent
---
```

### Workflow Steps (in SKILL.md)

1. **Parse arguments** — Parse `$ARGUMENTS`: if `--full` or `full`, use full audit mode. If a branch name, use diff review with `git diff main...<branch>`. If empty, auto-detect (feature branch → diff review using `main...HEAD`, main → full audit).
2. **Read checklist** — `Read references/checklist.md`
3. **In diff mode: get changed files** — `git diff --name-only main...HEAD`
4. **Scan categories** — Work through each applicable category sequentially. You MAY use the Agent tool to parallelize independent category groups (e.g., categories 1+3 scanning migrations in parallel with categories 4+5+7 scanning app source) if the scope warrants it, but this is an optimization, not a requirement.
5. **Check for previous audit** — Look for most recent `docs/security-audit-*.md` or `docs/security-review-*.md` to diff against
6. **Write report** — Generate markdown report file
7. **Present summary** — Show finding counts to user
8. **Offer fixes** — Present auto-fixable findings and ask the user whether to proceed
9. **Apply fixes** — If approved, create atomic commits. After each fix, verify typecheck and lint pass before committing (the pre-commit hook enforces this).

### Parallelism Hint

For full audit mode, these category groups are independent and can be parallelized via Agent tool:

- **Group A:** RLS + RBAC (categories 1, 3) — reads migrations
- **Group B:** Edge functions + Stripe (categories 2, 6) — reads supabase/functions/
- **Group C:** Client auth + data exposure + input validation (categories 4, 5, 7) — greps app source

For diff review mode, only run groups whose file patterns appear in the diff.

## What This Skill Does NOT Do

- **Runtime testing** — No actual HTTP requests to staging/production (use `/qa` or playwright for that)
- **Dependency scanning** — `code-review-extensions` already covers npm audit / supply chain
- **Generic OWASP/STRIDE labeling** — Findings use our own severity levels, not framework categories
- **Secrets scanning** — Doesn't scan git history for leaked secrets (use `git-secrets` or `trufflehog` for that)
- **Penetration testing** — Static analysis only; doesn't attempt exploits

## Integration with Existing Skills

- **`code-review-extensions`** — Continues to handle dependency/supply chain review during PR code review. Security audit focuses on the broader posture, not per-PR dependency changes.
- **`phase-review`** — Continues to flag security issues during commit review. Security audit provides deeper, category-by-category analysis.
- **`debugging-patterns`** — RLS and auth bug patterns remain there for debugging workflows. Security audit is preventive, not reactive-to-bugs.

## Known Issues to Catch on First Run

The research phase identified these existing issues the first audit should surface:

1. **[CRITICAL] `user_roles` RLS** — INSERT/UPDATE/DELETE policies use `WITH CHECK (true)`. Any authenticated user can grant themselves any role.
2. **[HIGH] `send-registration-email` admin check** — Uses `user.app_metadata?.role === 'admin'` (JWT claim) instead of querying `user_roles` table.
3. **[MEDIUM] Scope check fallthrough** — `hasPermission()` in AuthContext returns `true` when scope doesn't match any user role (falls through to default).
4. **[MEDIUM] Permission cache TTL** — 5-minute cache means revoked roles persist for up to 5 minutes.
5. **[MEDIUM] `send-push-notification` unauthenticated** — No JWT verification, relies on being internal-only.
