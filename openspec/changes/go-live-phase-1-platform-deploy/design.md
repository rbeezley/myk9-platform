## Context

Phase 1 cannot be completed purely by an agent because it depends on private GitHub secrets, repo variables, Vercel production settings, Supabase Auth Management API writes, and dashboard proof. The safe autonomous work is to make the repo evidence repeatable and make every blocked gate explicit.

No UX-facing work is involved. The existing app surfaces remain unchanged.

## Goals / Non-Goals

**Goals:**

- Provide a tested TypeScript verifier for local/source evidence.
- Check that the production deploy workflow is present, CI-gated, and inert until `PRODUCTION_DEPLOY_ENABLED=true`.
- Check that `apps/myk9show/vercel.json` has not prematurely disabled Git auto-deploy.
- Check that all four show-day realtime kill-switch defaults are `true` in source.
- Check that the auth-email runbook still documents Management API PATCH with Resend SMTP and rate-limit fields, not `supabase config push`.
- Update tracking docs with evidence and the morning checklist.

**Non-Goals:**

- Do not read or write GitHub secrets or variables.
- Do not call Vercel APIs or mutate Vercel settings.
- Do not call Supabase Management API.
- Do not run production deploys or function deploys.
- Do not modify user-facing app code.

## Decisions

1. Use a local TypeScript verifier.
   - Rationale: source checks are deterministic and testable, and they avoid network/shared-system access.
   - Alternative considered: docs-only checklist. Rejected because source drift can silently invalidate dashboard instructions.

2. Treat `git.deploymentEnabled.main=false` as a gated future state, not an immediate repo change.
   - Rationale: the runbook says this commit lands only after a CI-gated production deploy has been observed with Git auto-deploy still enabled.

3. Check kill-switch defaults from source only.
   - Rationale: production Vercel env values require dashboard/API access; source defaults can still be verified locally and the env proof remains a gate.

## Risks / Trade-offs

- Source checks can prove readiness but not operator-completed dashboard state -> tracker must keep Phase 1 unchecked.
- Workflow syntax checks are heuristic -> tests cover the verifier logic, but GitHub remains the final arbiter once secrets/variables are set.
- Vercel config must stay deliberately incomplete until validation -> the verifier reports that as a gated state rather than a failure.

## Migration Plan

1. Add verifier, tests, package scripts, and OpenSpec artifacts.
2. Run focused tests, local verifier, OpenSpec validation, and diff hygiene.
3. Update runbook/tracker with evidence and remaining gates.
4. Open a PR. Do not archive until merged and Phase 1 gates are either completed or explicitly deferred.

Rollback: remove the verifier, tests, package scripts, OpenSpec change, and tracking-doc updates. No database or dashboard rollback is needed.

## Open Questions

- Should docs/guides Vercel gating be handled in the same later rollout as myK9Show or as a separate non-gating follow-up?
