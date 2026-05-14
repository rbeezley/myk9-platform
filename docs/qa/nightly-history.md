# Nightly QA History

Track scheduled Nightly outcomes here until a more automated report exists. Keep entries short, evidence-backed, and tied to `docs/qa/findings.md` when failures repeat.

## Entry Template

```markdown
### YYYY-MM-DD

- **Playwright command:** pass | fail | skipped
- **Route sweep:** pass | fail | partial | skipped
- **Active specs:** passed/total
- **Failures:** spec or route, trace/screenshot path, finding id
- **Fixes made:** file paths or none
- **Demotions/promotions:** suite map changes or none
- **Notes:** timeout, missing credentials, known environmental issue, or follow-up
```

## History

### 2026-05-14

- **Playwright command:** pass
- **Route sweep:** partial
- **Active specs:** Vitest 18/18; Playwright 45/45 after cross-role and exhibitor online-entry promotion proof
- **Failures:** none in active Vitest or Playwright Nightly; route sweep could not audit club-admin because the documented local credential failed sign-in, and admin was skipped because no local admin password is configured
- **Fixes made:** `apps/myk9show/src/test/e2e/cross-role-workflows.spec.ts` rewritten from stale all-in-one workflow coverage to focused current role smoke coverage; `apps/myk9show/src/test/e2e/registration/exhibitorSelfRegistration.spec.ts` rewritten from placeholder coverage to a real online-entry replay with shared writes intercepted.
- **Demotions/promotions:** promoted repaired cross-role smoke and exhibitor online-entry replay into `Nightly Active`.
- **Notes:** Ran from clean `main`. Route sweep covered public, secretary, exhibitor, and judge routes at desktop plus 375px mobile with no console errors or owned 4xx/5xx responses on passed routes. Public `/sign-in` and protected `/registration` redirects were treated as expected route behavior, not findings. Later repair proof passed the focused cross-role spec alone (`4 passed`, retries disabled), the focused exhibitor online-entry spec alone (`1 passed`, retries disabled), and the full active Playwright command with the promoted online-entry replay (`45 passed`, 2.6m, retries disabled).

### 2026-05-13

- **Playwright command:** fail
- **Route sweep:** partial
- **Active specs:** 24/25
- **Failures:** `apps/myk9show/src/test/e2e/uat/secretary/disposable-entry.spec.ts`, finding `QA-TEST-FLAKE-001`
- **Fixes made:** Playwright collection fix in the three secretary UAT specs: `critical-path.spec.ts`, `disposable-entry.spec.ts`, and `evidence.spec.ts`
- **Demotions/promotions:** none
- **Notes:** Full Nightly rerun proceeded after the collection fix and took 34.2m. Route sweep covered public, secretary, exhibitor, and judge routes at desktop plus 375px mobile with no console errors or owned 4xx/5xx responses. Club-admin sign-in failed with the documented unverified credential; admin sweep skipped because no local admin password is configured. Later repair proof passed the focused disposable-entry spec and the full active Nightly command (`25 passed`, 1.1m); `QA-TEST-FLAKE-001` is closed.

### 2026-05-12

- **Playwright command:** pass
- **Route sweep:** scheduled for overnight run
- **Active specs:** 25/25
- **Failures:** none
- **Fixes made:** Wave 1 Playwright repairs and QA docs before scheduling
- **Demotions/promotions:** promoted Wave 1 specs into `Nightly Active`
- **Notes:** Verified locally with `--retries=0`: `25 passed (1.1m)`
