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

**Parallelism hint:** You MAY use the Agent tool to parallelize independent scans — Group A (step 2), Group B (step 3), Group C (step 4) — if the project is large enough to warrant it.

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

## Scope Boundaries

This skill does NOT do:

- **Runtime testing** — No HTTP requests to staging/production. Use playwright or `/qa` for that.
- **Dependency scanning** — `code-review-extensions` handles npm audit / supply chain during PR review.
- **Secrets history scanning** — Doesn't scan git history. Use `git-secrets` or `trufflehog` for that.
- **Penetration testing** — Static analysis only. Doesn't attempt exploits.

## Relationship to Other Skills

- **`code-review-extensions`** handles per-PR dependency/supply chain review. This skill audits the broader security posture.
- **`phase-review`** flags security issues in commit review. This skill provides deeper category-by-category analysis.
- **`debugging-patterns`** has RLS/auth bug patterns for reactive debugging. This skill is preventive.

Do not invoke `code-review-extensions` or `phase-review` during a security audit — they serve different purposes.

## Rules

- **Verify every finding.** Read the actual code. No speculation. Each finding must cite evidence.
- **Read full files, not just pattern matches.** Context matters — a grep hit is a lead, not a finding.
- **Check for `-- RATIONALE:` comments** before flagging permissive RLS policies. Intentional permissiveness (e.g., entries INSERT) is documented.
- **A clean audit is valid.** Don't manufacture findings. If nothing is wrong, say so.
- **Focus on exploitability.** A theoretical risk with no exploit path is LOW at most. Prioritize what an attacker could actually do.
- **No style or performance feedback.** Other skills handle those. Stay in your lane.
