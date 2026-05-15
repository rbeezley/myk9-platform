# QA Discovery Workflow

Discovery is the bug-hunting lane. Nightly answers, "Is the trusted baseline still healthy?" Discovery answers, "Where is the app still weak?"

## Rules

- Run discovery on a branch, not dirty `main`.
- Failures are expected; do not demote trusted Nightly specs because discovery found unrelated failures.
- Fix only clear, low-risk local issues that can be proved in the same run.
- Log durable issues in `docs/qa/findings.md`.
- Do not run shared-system mutations without explicit confirmation.
- Do not promote discovery specs to Nightly until they pass alone and in the full target batch with retries disabled.

## Core CRUD Batch

Current safe batch:

```bash
pnpm qa:discovery:crud
```

This runs dog, club, people, class, trial, and show CRUD coverage, including the show soft-delete proof that closed `QA-ROLE-RLS-MISMATCH-002`.

Compatibility alias:

```bash
pnpm qa:discovery:crud:full
```

This currently runs the same full CRUD batch. Keep the alias while the QA system is still settling so older notes that mention the full command remain valid.

## Finding Loop

1. Run the discovery batch.
2. Classify each failure:
   - stale test/schema drift: repair the spec and rerun
   - low-risk app bug: fix and rerun the focused proof
   - DB/RLS/shared-system issue: add a migration or finding, but do not push/apply it without confirmation
   - unclear behavior: log a finding with exact evidence
3. Update `docs/qa/findings.md`.
4. Update `docs/qa/quality-scorecard.md`.
5. Promote only after repeat green runs.

## Promotion Gate

A discovery spec can move toward Nightly only after:

- the spec passes alone with `--retries=0`
- the relevant discovery batch passes with `--retries=0`
- any required migrations are applied in the target environment
- no open finding remains for that surface
- `docs/qa/e2e-suite-map.md` is updated in the same change
