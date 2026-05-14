# QA Asset Inventory

This inventory supports Phase 0 of the proactive quality system. It organizes the QA assets that already exist before adding new agents, scripts, or CI gates.

## Operating Rules

- Preserve the myK9 intent: calm, obvious workflows where users are never left wondering whether an action worked.
- Log reusable proactive findings in `docs/qa/findings.md`.
- Classify Playwright specs with `docs/qa/e2e-suite-map.md` before adding or moving tests.
- Run `pnpm qa:e2e-map:check` after adding, deleting, moving, or reclassifying Playwright specs.
- Prefer focused commands over broad suites while the suite is being stabilized.
- Do not run shared-system mutations from QA work without explicit confirmation.

## Automatic Fix Boundary

During proactive QA, automatic fixes are limited to changes that are clearly local, reversible, and provable in the same run.

Allowed without additional confirmation:

- Stale Playwright selectors, role names, route paths, and test waits when the current UI behavior is already clear.
- Documentation and suite-map updates.
- Test-only helper fixes that do not alter production behavior.
- Dead imports, unused variables, formatting, typo fixes, and obvious copy corrections.
- Defensive null/empty-state guards that preserve existing behavior and have a focused proof.

Do not auto-fix; log a finding instead:

- Database migrations, RLS/role-policy changes, shared seed data, or Supabase function behavior.
- Payment, auth, offline/replication, or cross-app behavior.
- Broad production refactors or changes touching shared providers/data flows.
- Any change that requires guessing product intent, schema meaning, or business rules.
- Any shared-system mutation, including DB pushes, deploys, GitHub comments/PRs, Slack/email, or git push.

## Skills

| Asset                | Use When                                                                                                        | Command Or Invocation                        | Output                                                                              | Cadence                                       | Known Limitations                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `qa-feature`         | Auditing one feature end to end in a real browser                                                               | `/qa-feature <area> as <role>`               | Root-cause fixes, focused tests, E2E replay spec, findings in `docs/qa/findings.md` | Feature hardening                             | Requires a running app and valid test user; DB/RLS fixes may require confirmed shared-system migration push                    |
| `audit-pages`        | Sweeping routes for page load, console, network, data, and mobile issues                                        | `/audit-pages <role-or-scope>`               | Route-level findings in `docs/qa/findings.md`, TODO entries when needed             | Weekly, pre-release, or after broad refactors | Parameterized routes need real seeded IDs; known noise must be filtered                                                        |
| `harden`             | Stress-testing risky or recently changed code before commit                                                     | `/harden <file-or-directory>`                | Adversarial findings and direct fixes where low-risk                                | Per PR for risky changes                      | Existing workflow uses parallel reviewers; for myK9 QA, findings should also be copied into `docs/qa/findings.md` when durable |
| `debugging-patterns` | Looking up recurring bug families such as silent async failures, stale cache, RLS surprises, and stale closures | `/debugging-patterns <symptom>`              | Pattern diagnosis and targeted fix approach                                         | As needed during QA/fix work                  | Advisory only; still verify against actual schema/interfaces                                                                   |
| `commit`             | Risk-based validation before saving work                                                                        | `/commit`                                    | Validation summary and commit                                                       | Before committing                             | Do not use to push or mutate shared systems without confirmation                                                               |
| `playwright-cli`     | Browser recording fallback when Codex Browser is unavailable                                                    | `/playwright-cli` or direct skill-guided use | Snapshots, console/network inspection, optional local storage state                 | During feature QA recording                   | Storage state expires and must never be committed                                                                              |

## Playwright And Browser Assets

| Asset                         | Use When                                           | Command Or Invocation                                                                                                           | Output                                           | Cadence                                    | Known Limitations                                                                         |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| E2E suite map drift check     | Preventing unclassified specs                      | `pnpm qa:e2e-map:check`                                                                                                         | Fails if any E2E spec is unmapped or stale       | Every spec add/delete/move and pre-commit  | Checks classification coverage, not whether the category choice is correct                |
| myK9Show Playwright config    | Local E2E against Vite dev server                  | `cd apps/myk9show && pnpm test:e2e:clean <spec> --project=chromium --workers=1`                                                 | Playwright report, traces/screenshots on failure | Feature replay, smoke, nightly             | Default `pnpm test:e2e` runs every project/browser and can be too broad for PR confidence |
| myK9Show CI Playwright config | Built preview, Chromium-only                       | `cd apps/myk9show && pnpm test:e2e:ci`                                                                                          | CI-style Playwright report                       | CI/nightly candidate                       | Runs the whole test directory today; use cautiously until suites are tagged or split      |
| myK9Q E2E config              | Ringside scoring/auth smoke                        | `cd apps/myk9q && pnpm test:e2e -- --project=chromium`                                                                          | Playwright report                                | PR smoke or nightly for ringside changes   | Uses app-local port 5173; coordinate with myK9Show dev server                             |
| Secretary regression proof    | Proving the 2026-05-10 secretary remediation batch | `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/uat/secretary/qa-regression-proof.spec.ts --project=chromium --workers=1` | Strict browser-health proof                      | Pre-release and secretary workflow changes | Specific to the remediation matrix in `docs/plans/qa/2026-05-11-qa-regression-proof.md`   |
| Entity UI specs               | Replaying feature audits for CRUD/UI surfaces      | `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/entities/<area>UI.spec.ts --project=chromium --workers=1`                 | Feature-level replay                             | When touching that feature                 | Some specs are serial and seed data; avoid running unrelated specs in parallel            |
| Registration specs            | Exercising exhibitor/secretary entry flows         | `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/registration/<spec>.spec.ts --project=chromium --workers=1`               | Registration workflow proof                      | Nightly or registration changes            | Several phase specs are broad and should not be PR blockers until stabilized              |
| Cross-browser specs           | Browser/device compatibility checks                | `cd apps/myk9show && pnpm test:cross-browser:chrome` or focused `pnpm test:e2e:clean src/test/e2e/cross-browser/<spec>.spec.ts` | Compatibility report                             | Nightly/release                            | Browser matrix is slow and higher-flake than focused Chromium checks                      |
| myK9Show page objects/helpers | Reusable E2E abstractions                          | Import from `src/test/e2e/page-objects` and `src/test/e2e/helpers`                                                              | More stable specs                                | Any new E2E spec                           | Do not invent helpers without checking existing ones first                                |

## Unit, Type, And Static Checks

| Asset                   | Use When                                     | Command Or Invocation                                         | Output                 | Cadence                                               | Known Limitations                                                     |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------- | ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| Root typecheck          | Cross-monorepo TypeScript validation         | `pnpm typecheck`                                              | TypeScript errors      | PR validation                                         | Broad; can surface unrelated pre-existing failures                    |
| Root lint               | Cross-monorepo lint validation               | `pnpm lint`                                                   | ESLint errors          | PR validation                                         | Broad; can surface unrelated pre-existing failures                    |
| Root tests              | Cross-monorepo unit tests                    | `pnpm test`                                                   | Turbo test output      | PR/nightly                                            | Known suite hangs can occur; stop after 60 seconds if stuck           |
| myK9Show quick quality  | Focused app type/lint                        | `cd apps/myk9show && pnpm quality:quick`                      | Typecheck + lint       | PR validation for myK9Show docs/code-adjacent changes | Uses `npm run` internally but is invoked through pnpm                 |
| myK9Show focused vitest | Specific component/hook/helper proof         | `cd apps/myk9show && npx vitest run src/path/to/file.test.ts` | Focused unit result    | Any code fix                                          | Use custom render from `src/test/utils/testUtils.tsx` for React tests |
| myK9Q focused checks    | Ringside code validation                     | `cd apps/myk9q && pnpm typecheck && pnpm lint && pnpm test`   | Type/lint/unit output  | Ringside changes                                      | Do not add Tailwind to myK9Q                                          |
| Sequential unit helper  | Running unit files individually with timeout | `bash scripts/test-all.sh myk9show 30`                        | Pass/fail/hang summary | Debugging hangs                                       | Uses `timeout`, which may not exist on every platform                 |

## Planning And Proof Docs

| Asset                           | Use When                               | Command Or Invocation                                            | Output                  | Cadence                   | Known Limitations                                 |
| ------------------------------- | -------------------------------------- | ---------------------------------------------------------------- | ----------------------- | ------------------------- | ------------------------------------------------- |
| Proactive quality plan          | Source of truth for QA system rollout  | Read `docs/plans/qa/2026-05-12-proactive-quality-system-plan.md` | Phase plan              | Before QA-system changes  | Phase 0 only in this sprint                       |
| Secretary regression proof plan | Secretary remediation proof matrix     | Read `docs/plans/qa/2026-05-11-qa-regression-proof.md`           | Batch proof criteria    | Secretary regression work | Specific to 2026-05-10 findings                   |
| Intent document                 | Emotional/role UX guardrails           | Read `docs/INTENT.md`                                            | Role intent constraints | Before UX-facing QA/fixes | Not a route list or implementation spec           |
| Secretary golden path checklist | Manual secretary journey reference     | Read `docs/testing/secretary-golden-path-checklist.md`           | Manual checklist        | Secretary journey QA      | Needs pairing with automated proof where possible |
| Secretary walk seed             | Seed-data reference for secretary walk | Read `docs/testing/secretary-walk-seed.md`                       | Data setup notes        | Secretary journey QA      | Depends on current local/dev DB state             |

## Phase 0 Verification

For documentation-only Phase 0 changes, verify the inventory and formatting before closing the sprint:

```bash
pnpm exec prettier --check docs/qa/assets.md docs/qa/e2e-suite-map.md docs/qa/findings.md .agents/skills/qa-feature/SKILL.md .agents/skills/audit-pages/SKILL.md .agents/skills/harden/SKILL.md
```

Confirm every current Playwright spec appears in the suite map:

```bash
pnpm qa:e2e-map:check
```

### PR Smoke

Run only the small, high-signal Chromium set:

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/simple-connectivity.spec.ts \
  src/test/e2e/uat/secretary/qa-regression-proof.spec.ts \
  --grep "load home page without authentication|Secretary QA regression proof" \
  --project=chromium --workers=1
```

For ringside changes, add:

```bash
cd apps/myk9q
pnpm test:e2e -- --project=chromium
```

### Nightly

Nightly has three phases.

Phase 1 runs promoted Vitest registration service/store checks:

```bash
cd apps/myk9show
npx vitest run \
  src/test/unit/entryStore.multiClass.test.ts \
  src/test/services/entries/entryLimitChecker.waitlists.test.ts \
  src/test/services/APIErrorInterceptor.registrationRecovery.test.ts \
  src/hooks/useInfiniteScroll.performanceCaching.test.ts
```

Phase 2 runs the active Nightly Playwright command. Candidate specs are still inventoried in `docs/qa/e2e-suite-map.md`, but they are not in the scheduled gate until repaired and promoted.

```bash
cd apps/myk9show
pnpm test:e2e:clean \
  src/test/e2e/simple-connectivity.spec.ts \
  src/test/e2e/basic/registrationSmoke.spec.ts \
  src/test/e2e/browse-shows-to-details.spec.ts \
  src/test/e2e/uat/secretary/qa-regression-proof.spec.ts \
  src/test/e2e/uat/secretary/critical-path.spec.ts \
  src/test/e2e/uat/secretary/disposable-entry.spec.ts \
  src/test/e2e/uat/secretary/evidence.spec.ts \
  src/test/e2e/secretary/show-creation-wizard.spec.ts \
  src/test/e2e/secretary/classCreation.spec.ts \
  src/test/e2e/registration/secretaryExistingUsers.spec.ts \
  src/test/e2e/registration/index.spec.ts \
  src/test/e2e/registration/singleDogSingleClass.spec.ts \
  src/test/e2e/secretary-entry-walk.spec.ts \
  src/test/e2e/secretary/show-wizard-officials.spec.ts \
  src/test/e2e/registration/entryCreationCore.spec.ts \
  src/test/e2e/public-shows-responsive.spec.ts \
  --project=chromium --workers=1 --timeout=90000 --retries=0
```

Phase 3 is an agent/browser route-health sweep, not a terminal-only command:

```text
/audit-pages full
```

The sweep should cover public, exhibitor, secretary, judge, club-admin, and admin route groups as far as local credentials and seeded IDs allow. For each route, check render, console errors, owned 4xx/5xx network responses, unresolved skeletons, obvious broken UI, and 375px mobile sanity. Log durable issues in `docs/qa/findings.md`.

### Feature Audit

Run specs tied to the touched feature:

```bash
cd apps/myk9show
pnpm test:e2e:clean src/test/e2e/entities/<feature>UI.spec.ts --project=chromium --workers=1
```

For CRUD API-style E2E coverage:

```bash
cd apps/myk9show
pnpm test:e2e:clean src/test/e2e/entities/<feature>CRUD.spec.ts --project=chromium --workers=1
```

### Manual Debug

Run one debug/probe spec only while investigating:

```bash
cd apps/myk9show
pnpm test:e2e:clean src/test/e2e/<debug-spec>.spec.ts --project=chromium --headed --workers=1
```

### Candidate Delete

Do not run these as quality gates. Before deleting any candidate, confirm whether a newer spec covers the same behavior and move any unique assertions into a maintained spec.
