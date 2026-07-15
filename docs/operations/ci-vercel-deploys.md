# CI-gated production deploys (myK9Show + guides)

> **Status:** Activation finalizing. Credentials and the enable variable are
> configured, and both CI-gated production jobs successfully deployed merge SHA
> `8f48109b` in [Deploy Production run 29434507221](https://github.com/rbeezley/myk9-platform/actions/runs/29434507221).
> The app and guides `git.deploymentEnabled.main=false` guards are landing now;
> final evidence must confirm that no parallel Git-triggered production deploy occurs.

**Target state:** production deploys of myK9Show and the guides site gated on a green CI run — the
[`Deploy Production`](../../.github/workflows/deploy-production.yml) workflow
ships both projects to Vercel **only after** the entire `CI` workflow (Quality
Checks + Test + Build + A11y smoke + E2E PR Smoke) succeeds on the merged commit.

**Current state:** `PRODUCTION_DEPLOY_ENABLED=true`, all four required secrets
are configured, and the CI-gated workflow has successfully deployed both Vercel
projects. The final config-as-code guards disable Git-event deployments from
`main` for both projects while preserving CLI/API production deployments and PR
previews. This runbook retains the one-time setup and rollback procedure.

## How it works

`deploy-production.yml` triggers on `workflow_run` (completion of the `CI`
workflow), not on `push`, so it can gate on CI's overall conclusion. It runs
only when **all** of these hold:

- the `PRODUCTION_DEPLOY_ENABLED` repo variable is `'true'` (the enable gate)
- `CI` concluded `success`
- the run was a `push` (post-merge to `main`), not a pull request
- the head branch was `main`

It checks out the exact `head_sha` CI validated and runs `vercel deploy --prod`,
which performs a **remote build** using the project's own settings (Root
Directory `apps/myk9show`, the turbo `buildCommand` in
[`apps/myk9show/vercel.json`](../../apps/myk9show/vercel.json), and the
dashboard env vars). Only the trigger changed versus the old Git auto-deploy —
the build environment is identical, which keeps the failure surface small.

## One-time operator setup

### 1. Add four GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret                   | Value                   | Where to get it                                                                          |
| ------------------------ | ----------------------- | ---------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`           | A Vercel access token   | Vercel → Account Settings → Tokens → Create. Scope it to the team that owns the project. |
| `VERCEL_ORG_ID`          | The Vercel org/team id  | `cd apps/myk9show && vercel link` (once), then read `.vercel/project.json` → `orgId`.    |
| `VERCEL_PROJECT_ID`      | The myK9Show project id | Same `.vercel/project.json` → `projectId`.                                               |
| `VERCEL_DOCS_PROJECT_ID` | The guides project id   | Link the guides project once and read its `.vercel/project.json` → `projectId`.          |

`.vercel/` is git-ignored — `vercel link` is only used locally to read the two
ids; do not commit it.

### 2. Enable the workflow, then validate WITH auto-deploy still enabled

Only after the four secrets exist, flip the enable gate: Repo → Settings →
Secrets and variables → Actions → **Variables** → set `PRODUCTION_DEPLOY_ENABLED`
to `true`. Until this variable is `true` the deploy job is skipped, so the
workflow can merge harmlessly and never runs `vercel deploy` with empty secrets.

Do **not** disable Vercel auto-deploy yet. Trigger a `main` build (any merge, or
re-run CI on `main`). Confirm:

- the **Deploy Production** workflow runs only after `CI` goes green,
- it finishes successfully and prints a production URL in its job summary,
- that URL serves the expected build.

At this point production has been deployed **twice** (once by Vercel's Git
integration, once by the workflow) — that is expected and harmless during
validation.

### 3. Disable Vercel's production auto-deploy (Git events only)

Once step 2 looks correct, stop Vercel's **Git integration** from deploying
`main` so the workflow becomes the sole production path.

> **Do NOT use an Ignored Build Step keyed on `VERCEL_ENV=production`.** The
> Ignored Build Step runs for **every** production build that enters BUILDING —
> including the one this workflow's `vercel deploy --prod` creates — so
> `exit 0 when production` would abort the gated deploy too. It cannot
> distinguish a Git-triggered build from a CLI/API build.

Instead, set `git.deploymentEnabled` for `main` to `false` in both
[`apps/myk9show/vercel.json`](../../apps/myk9show/vercel.json) and
[`apps/docs/vercel.json`](../../apps/docs/vercel.json). This blocks deploys
created from **Git events** on `main`, while leaving **CLI/API** deploys (this
workflow) and **PR preview** deploys (other branches) fully working:

```jsonc
{
  // ...existing config...
  "git": {
    "deploymentEnabled": {
      "main": false,
    },
  },
}
```

Land that as a small follow-up commit once the workflow is validated — it is
config as code (reviewable, no dashboard step). From the commit that adds it,
pushes to `main` no longer auto-deploy; only the CI-gated workflow does.

## Rollback

Two levers, no code revert needed for the fast path:

1. **Stop the gated workflow immediately** — set the `PRODUCTION_DEPLOY_ENABLED`
   repo variable to `false` (or delete it). The deploy job is skipped on the
   next run; no merge required.
2. **Restore Git auto-deploy** — revert the `git.deploymentEnabled` changes in
   both `apps/myk9show/vercel.json` and `apps/docs/vercel.json` (set `main` back
   to `true` or remove the `git` blocks) and merge. Vercel resumes
   auto-deploying `main` on push.

Do both to fully return to the pre-rollout state (workflow off, Git auto-deploy
on) while the workflow is fixed.

## Not covered here

- **Docs/guides Vercel project** (`apps/docs`) uses the `deploy-docs` job,
  `VERCEL_DOCS_PROJECT_ID`, and its own `vercel.json` Git guard. It is gated by
  the same post-merge CI completion event as myK9Show but retains its own Vercel
  project and production environment.
- **Preview deploys for PRs** are unchanged — they keep coming from Vercel's Git
  integration (`git.deploymentEnabled.main: false` disables Git deploys only for
  the `main` branch, so other-branch previews still build).
- **Preview deployment quota controls** live in
  [`vercel-preview-quota.md`](vercel-preview-quota.md). Keep Vercel preview
  contexts non-required and use monorepo skip-unaffected project behavior instead
  of an Ignored Build Step quota workaround.

See also [`VERCEL-SETUP.md`](../architecture/VERCEL-SETUP.md) for project URLs,
root directories, and required `VITE_*` env vars.
