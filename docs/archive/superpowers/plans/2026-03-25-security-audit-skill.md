# Security Audit Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `/security-audit` Claude Code skill that audits the myK9 platform for security vulnerabilities in two modes (full audit and diff review), generates a report, and offers auto-fixes.

**Architecture:** Two markdown files — `SKILL.md` (workflow, mode detection, report template, fix instructions) and `references/checklist.md` (7 security check categories with specific checks). The skill is invoked via `/security-audit` and reads the checklist as reference data during execution.

**Tech Stack:** Claude Code skill system (SKILL.md markdown format), git CLI for diff detection

**Spec:** `docs/superpowers/specs/2026-03-25-security-audit-skill-design.md`

**Testing:** This deliverable is two markdown files (not code), so unit tests don't apply. Task 6 (smoke test) serves as the testing phase — it executes the skill's workflow end-to-end and validates the output format and finding accuracy against known issues.

---

## File Structure

| File                                                    | Action | Responsibility                                                                                                         |
| ------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| `.claude/skills/security-audit/SKILL.md`                | Create | Frontmatter, argument parsing, mode detection, workflow steps, report format template, fix workflow, parallelism hints |
| `.claude/skills/security-audit/references/checklist.md` | Create | 7 security check categories with specific checks — pure reference data                                                 |

---

## Task 1: Create the checklist reference file

**Files:**

- Create: `.claude/skills/security-audit/references/checklist.md`

This is the reference data the skill reads. No workflow logic. Each category lists what to check, what file patterns to scan, and what constitutes a finding.

- [ ] **Step 1: Create directory structure**

Run: `mkdir -p ".claude/skills/security-audit/references"`

- [ ] **Step 2: Write checklist.md**

Write the file with all 7 categories. Each category includes:

- Category name and number
- File patterns to scan (used by SKILL.md to determine what to read)
- Specific checks as a checklist
- Examples of what a finding looks like

```markdown
# Security Audit Checklist

Reference data for the security-audit skill. Each category lists what to check, where to look, and what constitutes a finding.

---

## 1. RLS Policy Integrity

**Scan:** `supabase/migrations/*.sql` — look for `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`

**Checks:**

- [ ] Every table has both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`
- [ ] Policies use helper functions (`is_platform_admin()`, `can_manage_show()`, `is_club_admin()`, `is_trial_secretary()`, `get_my_person_id()`) — not inline `auth.uid()` comparisons
- [ ] No `WITH CHECK (true)` on tables that store sensitive or privileged data without a `-- RATIONALE:` comment
- [ ] SELECT policies include `deleted_at IS NULL` for soft-deletable tables (people, dogs, shows)
- [ ] Storage policies validate path ownership via `(storage.foldername(name))[2] = (SELECT auth.uid())::text`
- [ ] Mutation policies (INSERT/UPDATE/DELETE) restrict to appropriate roles — not open to all authenticated users on privileged tables (user*roles, roles, permissions, role_permissions, stripe*\*)

**Finding example:** Table `user_roles` has `FOR INSERT TO authenticated WITH CHECK (true)` — any user can grant themselves any role.

---

## 2. Edge Function Auth

**Scan:** `supabase/functions/*/index.ts` — read each function's auth handling

**Checks:**

- [ ] JWT verified via `supabase.auth.getUser(token)` before any data operations
- [ ] Unauthenticated endpoints are ONLY webhook receivers (resend-webhook, stripe-webhook) or database-triggered functions (push-trigger-\*)
- [ ] Role/permission checks query `user_roles` table — not `user.app_metadata` JWT claims
- [ ] `SUPABASE_SERVICE_ROLE_KEY` used only inside edge functions, never returned to client or logged
- [ ] CORS `Access-Control-Allow-Origin` set to specific origins — not `*` unless the function is internal-only (called by other functions, not frontend)
- [ ] Webhook endpoints verify signatures: Svix HMAC for Resend, `stripe.webhooks.constructEvent()` for Stripe

**Finding example:** `send-registration-email` checks `user.app_metadata?.role === 'admin'` instead of querying `user_roles` table.

---

## 3. RBAC & Privilege Escalation

**Scan:** `supabase/migrations/*.sql` (RLS policies on user_roles, roles, permissions tables) + `apps/myk9show/src/services/rbac/` + `apps/myk9show/src/context/AuthContext.tsx`

**Checks:**

- [ ] `user_roles` INSERT/UPDATE/DELETE restricted via RLS to site_admin (not open to all authenticated)
- [ ] `roles`, `permissions`, `role_permissions` tables INSERT/UPDATE/DELETE restricted to site_admin
- [ ] Scoped permission checks (`hasPermission` with `scope`) validate `club_id`/`show_id` — no fallthrough to `return true` when scope doesn't match
- [ ] `SECURITY DEFINER` functions (`is_platform_admin()`, `can_manage_show()`, etc.) check `auth.uid()` internally
- [ ] No client-side-only authorization (every protected action also enforced by RLS or edge function auth)
- [ ] `expires_at` and `is_active` respected in all role/permission queries (RLS helpers, RPC functions, frontend hooks)
- [ ] `SecurityValidator` escalation prevention aligns with RLS policies (can't bypass via direct Supabase calls)

**Finding example:** `hasPermission()` returns `true` as default when scoped permission doesn't match any user role.

---

## 4. Client Auth Patterns

**Scan:** `apps/myk9show/src/context/AuthContext.tsx`, `apps/myk9show/src/routes/*.tsx`, `apps/myk9show/src/components/common/ProtectedRoute*`

**Checks:**

- [ ] All role-gated routes wrapped with `<ProtectedRoute>` specifying `requiredRole` or `requiredPermission`
- [ ] No sensitive data fetched before `loading` state resolves (race condition with auth init)
- [ ] Permission cache invalidation triggered when roles are assigned/revoked (not just on 5-min TTL)
- [ ] Suspended user enforcement at both levels: token hook (`custom_access_token_hook`) and AuthContext (`userProfile.status` check)
- [ ] No hardcoded credentials, API keys, or secrets in `.ts`/`.tsx` files (grep for patterns: `sk_`, `key_`, `secret`, `password`, `Bearer`)
- [ ] Dev-only features guarded by `import.meta.env.DEV` — not a string comparison or localStorage flag that could be set in production

**Finding example:** Route `/admin/users` missing `<ProtectedRoute>` wrapper.

---

## 5. Data Exposure

**Scan:** `apps/myk9show/src/` — grep for Supabase query patterns, error handling, logging

**Checks:**

- [ ] Queries for health records, payment data, contact info include user-scoping (`.eq('owner_id', userId)` or equivalent RLS)
- [ ] Error boundaries and catch blocks don't expose: table names, column names, SQL fragments, stack traces — in UI or console
- [ ] Logging services (LoggingService, console.\*) don't log: passwords, tokens, card numbers, PII fields
- [ ] RLS SELECT policies don't leak extra columns via permissive reads (check for `SELECT *` patterns vs. explicit column lists in security-sensitive tables)
- [ ] Soft-deleted rows (people, dogs, shows) filtered by `deleted_at IS NULL` in application queries and RLS

**Finding example:** Error toast shows `Error: relation "user_roles" does not exist` — leaks table name.

---

## 6. Payment Security (Stripe)

**Scan:** `supabase/functions/stripe-*/*.ts`, `apps/myk9show/src/services/stripe.ts`

**Checks:**

- [ ] All Stripe API calls go through edge functions — frontend never imports `stripe` or uses `STRIPE_SECRET_KEY`
- [ ] `stripe-webhook/index.ts` verifies signature via `stripe.webhooks.constructEvent(body, sig, endpointSecret)`
- [ ] Price/amount comes from server-side lookup (Stripe price ID or database), not from client request body
- [ ] `stripe-customer-portal` scopes session to the authenticated user's `stripe_customer_id`
- [ ] No `VITE_STRIPE_SECRET_KEY` or `VITE_` prefixed Stripe secrets (only `VITE_STRIPE_PUBLISHABLE_KEY` is acceptable)
- [ ] Checkout session `success_url` and `cancel_url` use same-origin URLs (no open redirect)

**Finding example:** Checkout edge function reads `price` from request body instead of looking up server-side.

---

## 7. Input Validation

**Scan:** `apps/myk9show/src/` — grep for `dangerouslySetInnerHTML`, URL param usage, file upload handling, form submission

**Checks:**

- [ ] No `dangerouslySetInnerHTML` with user-supplied content (only with sanitized or trusted HTML)
- [ ] URL/route parameters (`useParams`, `useSearchParams`) validated before use in Supabase queries or RPCs
- [ ] File uploads (storage bucket writes) validate: file type, file size, file name (no path traversal `../`)
- [ ] Form inputs validated via Zod schemas (in `onValidate`) before database writes
- [ ] No string concatenation to build SQL or RPC arguments — all queries use Supabase client's parameterized methods

**Finding example:** `useParams().showId` passed directly to `.eq('id', showId)` without UUID format validation.
```

- [ ] **Step 3: Verify file is under 500 lines**

Run: `wc -l ".claude/skills/security-audit/references/checklist.md"`
Expected: under 500 lines

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/security-audit/references/checklist.md
git commit -m "feat: add security audit checklist reference"
```

---

## Task 2: Create SKILL.md — frontmatter, intro, and mode detection

**Files:**

- Create: `.claude/skills/security-audit/SKILL.md`

Note: Intentionally omitting `disable-model-invocation` so Claude can invoke this skill when the user says "check security" or "audit for vulnerabilities" in natural language.

- [ ] **Step 1: Write the first section of SKILL.md**

Write `.claude/skills/security-audit/SKILL.md` with the following content (frontmatter through mode detection):

```markdown
---
name: security-audit
description: Security audit for the myK9 platform. Two modes — full audit (all RLS, edge functions, RBAC, auth, Stripe, input validation) or diff review (scoped to branch changes). Use when asked to "audit security", "security review", "check for vulnerabilities", or before major releases.
user-invocable: true
argument-hint: [--full | branch-name]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git *), Agent
---

# Security Audit

You are a security auditor for the myK9 platform. Your job is to find **exploitable vulnerabilities, auth bypasses, privilege escalation paths, and data exposure risks** in the codebase. You are NOT checking code style, performance, or UX — focus on security.

## Input

The user provides one of:

- `--full` or `full` → full audit mode (scan entire project)
- A branch name → diff review mode (scan that branch's changes via `git diff main...<branch>`)
- Nothing → auto-detect based on current branch

Parse `$ARGUMENTS` accordingly.

## Mode Detection

Determine which mode to run:

1. If `$ARGUMENTS` contains `--full` or equals `full` → **full audit mode**
2. If `$ARGUMENTS` contains a branch name → **diff review mode** using `git diff main...<branch>`
3. If `$ARGUMENTS` is empty:
   - Current branch is not `main` AND has changes vs main → **diff review mode** using `git diff main...HEAD`
   - Otherwise → **full audit mode**

**Context:**
!`git branch --show-current`
!`git diff --stat main...HEAD 2>/dev/null | tail -1`
```

- [ ] **Step 2: Commit progress**

```bash
git add .claude/skills/security-audit/SKILL.md
git commit -m "feat: add security-audit skill — frontmatter and mode detection"
```

---

## Task 3: Add full audit and diff review workflows to SKILL.md

**Files:**

- Modify: `.claude/skills/security-audit/SKILL.md`

- [ ] **Step 1: Append full audit workflow**

Append this content to SKILL.md:

```markdown
## Full Audit Workflow

Run when mode is `full`. Scans the entire project against all 7 checklist categories.

### Step 1: Load checklist

Read `references/checklist.md` for all check categories, file patterns, and finding examples.

### Step 2: Scan migrations (categories 1, 3)

Read all `supabase/migrations/*.sql` files. Check against:

- **Category 1 (RLS Policy Integrity):** Every table has ENABLE + FORCE RLS, policies use helper functions, no unguarded `WITH CHECK (true)` on privileged tables, soft-delete respected, storage path ownership validated.
- **Category 3 (RBAC & Privilege Escalation):** `user_roles`/`roles`/`permissions` mutation policies restricted to admin, scoped permission checks don't fallthrough, SECURITY DEFINER functions check `auth.uid()`, `expires_at`/`is_active` respected.

### Step 3: Scan edge functions (categories 2, 6)

Read all `supabase/functions/*/index.ts` files. Check against:

- **Category 2 (Edge Function Auth):** JWT verified before operations, unauthenticated endpoints are webhooks/internal only, role checks use `user_roles` table not JWT claims, service role key not exposed, CORS restricted, webhook signatures verified.
- **Category 6 (Payment Security):** Stripe calls via edge functions only, webhook signature verified, price validated server-side, portal scoped to user, no VITE\_ Stripe secrets.

### Step 4: Scan app source (categories 4, 5, 7)

Grep and read files in `apps/myk9show/src/`. Check against:

- **Category 4 (Client Auth):** ProtectedRoute on all gated routes, no data fetch before auth load, cache invalidation on role changes, suspension enforced, no hardcoded secrets, dev features properly guarded.
- **Category 5 (Data Exposure):** Queries scoped to user, errors don't leak internals, logging doesn't capture PII, soft-deleted data hidden.
- **Category 7 (Input Validation):** Parameterized queries, no dangerouslySetInnerHTML with user content, URL params validated, file uploads validated, Zod schemas on forms.

### Step 5: Check for previous audit

Look for most recent `docs/security-audit-*.md`. If found, note its findings for the comparison section.

### Step 6: Generate report

Write report to `docs/security-audit-YYYY-MM-DD.md`. If a report for today already exists, overwrite it. See Report Format section below.

### Step 7: Present summary and offer fixes

See Fix Workflow section below.

**Parallelism hint:** You MAY use the Agent tool to parallelize independent scans — Group A (steps 2), Group B (step 3), Group C (step 4) — if the project is large enough to warrant it.

## Diff Review Workflow

Run when mode is `diff`. Scans only files changed on the branch.

### Step 1: Load checklist

Read `references/checklist.md`.

### Step 2: Get changed files

Run `git diff --name-only main...HEAD` (auto-detect) or `git diff --name-only main...<branch>` (explicit arg).

### Step 3: Filter categories

Only run categories whose file patterns appear in the changed files:

- `supabase/migrations/` changed → categories 1, 3
- `supabase/functions/` changed → category 2
- `src/context/Auth*`, `src/routes/`, `src/components/common/Protected*` changed → category 4
- `src/services/stripe*`, Stripe edge functions changed → category 6
- Any `.ts`/`.tsx` changed → categories 5, 7

If no security-relevant files changed, report "No security-relevant changes detected" and exit.

### Step 4: Scan changed files

Read each changed file AND its immediate dependencies:

- For `.sql` files: also read any SQL functions they reference (grep for function names in other migration files)
- For `.ts`/`.tsx` files: also read files they directly import (one level, not transitive)

Check against the filtered categories from Step 3.

### Step 5: Generate report

Write report to `docs/security-review-YYYY-MM-DD-<branch>.md`. If a report for today's date and branch already exists, overwrite it.

### Step 6: Present summary and offer fixes

See Fix Workflow section below.
```

- [ ] **Step 2: Commit progress**

```bash
git add .claude/skills/security-audit/SKILL.md
git commit -m "feat: add audit and diff review workflows to security-audit skill"
```

---

## Task 4: Add report format, fix workflow, and rules to SKILL.md

**Files:**

- Modify: `.claude/skills/security-audit/SKILL.md`

- [ ] **Step 1: Append report format section**

Append this content to SKILL.md:

````markdown
## Report Format

Generate the report using this template:

```
# Security Audit — YYYY-MM-DD

**Mode:** Full Audit | Diff Review (branch: `<branch-name>`)
**Checklist version:** references/checklist.md @ <short-hash>

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | N |
| HIGH | N |
| MEDIUM | N |
| LOW | N |
| **Total** | **N** |

Auto-fixable: N of M findings

## Findings

### [SEVERITY] SA-NNN: <title>

**Category:** <checklist category name>
**Location:** `<file-path>:<line>` (or migration number)
**Evidence:** <the actual code/policy that was found>
**Risk:** <what an attacker could do with this>
**Fix:** <specific remediation steps>
**Auto-fixable:** Yes/No

---

(repeat for each finding, ordered by severity: CRITICAL first, then HIGH, MEDIUM, LOW)

## Categories Checked

| Category | Files Examined | Findings | Skipped |
|----------|---------------|----------|---------|
| RLS Policy Integrity | N | N | — |
| Edge Function Auth | N | N | — |
| RBAC & Privilege Escalation | N | N | — |
| Client Auth Patterns | N | N | — or "No changes" |
| Data Exposure | N | N | — |
| Payment Security | N | N | — |
| Input Validation | N | N | — |

## Previous Audit Comparison

If a previous audit report exists in `docs/`, compare findings:
- **New findings:** issues not in the previous report
- **Resolved:** issues from the previous report no longer present
- **Unchanged:** issues still present from the previous report

If no previous report exists, note: "First audit — no comparison available."
```

Get the checklist version hash with: `git log -1 --format=%h -- .claude/skills/security-audit/references/checklist.md`

### Severity Definitions

- **CRITICAL** — Exploitable now with minimal effort. Privilege escalation, unauthorized data access, or payment manipulation.
- **HIGH** — Auth bypass or data exposure achievable with moderate effort or chained conditions.
- **MEDIUM** — Defense-in-depth gap. Not directly exploitable alone but weakens overall posture.
- **LOW** — Best practice deviation or hardening opportunity. No direct exploit path.
````

- [ ] **Step 2: Append fix workflow section**

Append this content to SKILL.md:

```markdown
## Fix Workflow

After generating the report:

1. Present summary to user: "Found N findings (X critical, Y high, Z medium, W low). M are auto-fixable."
2. Ask: "Want me to fix the M auto-fixable issues?"
3. If yes, create fixes as atomic commits — one per finding:
   - Commit format: `security: SA-NNN <short description>`
   - RLS fixes → **new** migration file (never modify existing migrations)
   - Edge function fixes → edit the function source
   - Client code fixes → edit source files
   - After each fix, verify typecheck and lint pass before committing
4. Non-auto-fixable findings remain in the report with manual fix guidance

### Auto-fixable Criteria

A finding is auto-fixable if it's mechanical — applying a known-good pattern without design decisions.

| Auto-fixable | Examples                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Yes**      | Adding missing `FORCE ROW LEVEL SECURITY`, replacing `WITH CHECK (true)` with a role-check policy, adding JWT verification boilerplate, removing hardcoded secret |
| **No**       | Redesigning permission scoping logic, changing RBAC architecture, deciding which roles should access a new table, restructuring auth flow                         |

Rule of thumb: if the fix applies a known pattern, it's auto-fixable. If it requires a design decision, it's not.

## Rules

- **Verify every finding.** Read the actual code. No speculation. Each finding must cite evidence.
- **Read full files, not just pattern matches.** Context matters — a grep hit is a lead, not a finding.
- **Check for `-- RATIONALE:` comments** before flagging permissive RLS policies. Intentional permissiveness (e.g., entries INSERT) is documented.
- **A clean audit is valid.** Don't manufacture findings. If nothing is wrong, say so.
- **Focus on exploitability.** A theoretical risk with no exploit path is LOW at most. Prioritize what an attacker could actually do.
- **No style or performance feedback.** Other skills handle those. Stay in your lane.

## Scope Boundaries [ADDED]

This skill does NOT do:

- **Runtime testing** — No HTTP requests to staging/production. Use playwright or `/qa` for that.
- **Dependency scanning** — `code-review-extensions` handles npm audit / supply chain during PR review.
- **Secrets history scanning** — Doesn't scan git history. Use `git-secrets` or `trufflehog` for that.
- **Penetration testing** — Static analysis only. Doesn't attempt exploits.

## Relationship to Other Skills [ADDED]

- **`code-review-extensions`** handles per-PR dependency/supply chain review. This skill audits the broader security posture.
- **`phase-review`** flags security issues in commit review. This skill provides deeper category-by-category analysis.
- **`debugging-patterns`** has RLS/auth bug patterns for reactive debugging. This skill is preventive.

Do not invoke `code-review-extensions` or `phase-review` during a security audit — they serve different purposes.
```

- [ ] **Step 3: Verify SKILL.md is under 500 lines**

Run: `wc -l ".claude/skills/security-audit/SKILL.md"`
Expected: under 500 lines

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/security-audit/SKILL.md
git commit -m "feat: add report format, fix workflow, and rules to security-audit skill"
```

---

## Task 5: Verify skill registration

**Files:**

- Read: `.claude/skills/security-audit/SKILL.md`

- [ ] **Step 1: Verify skill directory structure**

Run: `ls -la .claude/skills/security-audit/`
Expected: `SKILL.md` and `references/` directory

Run: `ls -la .claude/skills/security-audit/references/`
Expected: `checklist.md`

- [ ] **Step 2: Verify frontmatter is parseable**

Run: `head -10 .claude/skills/security-audit/SKILL.md`
Expected: YAML frontmatter with `name: security-audit`, `user-invocable: true`, `allowed-tools` includes Read/Grep/Glob/Edit/Write/Bash/Agent

- [ ] **Step 3: Verify line counts**

Run: `wc -l .claude/skills/security-audit/SKILL.md .claude/skills/security-audit/references/checklist.md`
Expected: Both under 500 lines

- [ ] **Step 4: Verify all required sections exist in SKILL.md**

Run: `grep "^## " .claude/skills/security-audit/SKILL.md`
Expected output should include: Input, Mode Detection, Full Audit Workflow, Diff Review Workflow, Report Format, Fix Workflow, Rules

- [ ] **Step 5: Fix any issues found and commit**

Only commit if files were modified in this task.

---

## Task 6: Smoke test

This task validates the skill works. Since skills are loaded at session start, the current session won't see the new skill via `/security-audit`. Instead, manually execute the skill's workflow.

- [ ] **Step 1: Simulate the skill by reading and following SKILL.md**

Read `.claude/skills/security-audit/SKILL.md` and `references/checklist.md`. Then execute the full audit workflow manually: scan migrations for RLS issues, scan edge functions for auth issues, scan app source for client auth/data exposure/input validation issues.

- [ ] **Step 2: Verify report output**

Confirm a report file is generated at `docs/security-audit-2026-03-25.md` with:

- Summary table with severity counts
- At least one finding with the correct format (Category, Location, Evidence, Risk, Fix, Auto-fixable)
- Categories Checked table
- Previous Audit Comparison section (should say "First audit — no comparison available")

- [ ] **Step 3: Verify known issues are surfaced**

The spec identifies 5 known issues. Confirm at least these are found:

1. **[CRITICAL]** `user_roles` RLS — `WITH CHECK (true)` on INSERT/UPDATE/DELETE
2. **[HIGH]** `send-registration-email` — admin check uses JWT claims instead of `user_roles` table

- [ ] **Step 4: Commit the smoke test report**

```bash
git add docs/security-audit-2026-03-25.md
git commit -m "docs: first security audit report — smoke test of security-audit skill"
```

---

## Task 7: Update project documentation

**Files:**

- Modify: `TO-DOS.md` — add note about security audit skill completion

- [ ] **Step 1: Update TO-DOS.md**

Add a completed item noting the security audit skill was created, with a brief description of what it covers.

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: note security-audit skill in TO-DOS"
```
