---
name: review-fix
description: Fast PR review follow-up workflow. Use when addressing review comments, small nits, test-only changes, docs/comments, or tiny PR follow-ups after a PR already exists.
---

# Review Fix

Use this for small PR follow-ups after review comments. Optimize for a tight patch and focused validation, then let CI provide broad coverage after push.

## Workflow

1. **Read the comment and classify risk**
   - Micro: docs/comments, test-only changes, helper docs, copy, or tiny nits that do not alter production behavior.
   - Low-risk: one small production behavior change in one app/module.
   - High-risk: auth/RLS, DB migrations, payment, entry submission, offline/replication, shared helpers used broadly, or cross-app behavior.

2. **Patch narrowly**
   - Read each touched file before editing.
   - Make the smallest change that resolves the review comment.
   - Prefer pure helper extraction for tricky UI/state logic so fast unit tests can cover behavior without slow component harnesses.

3. **Validate by risk**
   - Micro: run focused tests only. Skip full local typecheck/lint unless production TypeScript changed.
   - Low-risk: run focused tests plus app/package-local typecheck. Run app-local lint only when production code changed.
   - High-risk: run full `pnpm typecheck`, full `pnpm lint`, and related/broader tests.

4. **Commit and push**
   - Commit only the review follow-up files.
   - Push after explicit confirmation when AGENTS.md requires it for shared-system/GitHub mutations.

5. **PR checks**
   - Do not repeatedly poll checks by default.
   - If checks are pending, report that CI is running and stop.
   - Use `gh pr checks <number> --watch` only when the user explicitly asks to wait.

## Examples

Micro review follow-up:

```bash
cd apps/myk9show
pnpm exec vitest run src/path/to/focused.test.ts
```

Low-risk production TypeScript follow-up:

```bash
pnpm --filter @myk9/show typecheck
cd apps/myk9show && pnpm exec vitest run src/path/to/focused.test.ts
```

High-risk follow-up:

```bash
pnpm typecheck
pnpm lint
```

## Rules

- Do not reopen broad implementation scope while addressing a narrow review comment.
- Do not add a slow component/integration test when a pure helper test captures the behavior with the same confidence.
- Do not wait on CI unless the user asks.
