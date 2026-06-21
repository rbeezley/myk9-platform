# CI-gated production deploys (myK9Show)

> **Status:** Rollout pending — the workflow is merged but **not yet in effect**.
> Until the operator setup below completes (secrets + `git.deploymentEnabled`),
> Vercel's Git integration still auto-deploys `main` on every push.

**Target state:** production deploys of myK9Show gated on a green CI run — the
[`Deploy Production`](../../.github/workflows/deploy-production.yml) workflow
ships `main` to Vercel **only after** the entire `CI` workflow (Quality Checks +
Test + Build + A11y smoke + E2E PR Smoke) succeeds on the merged commit.

**Current state:** Vercel's Git integration still deploys every push to `main`
to production regardless of whether tests passed. The workflow is inert without
its `VERCEL_*` secrets, and Git auto-deploy stays on until step 3 lands. This
runbook covers the one-time operator setup and the **safe rollout order** — do
not disable Vercel auto-deploy until you have seen the CI-gated workflow produce
a correct production deployment at least once.

## How it works

`deploy-production.yml` triggers on `workflow_run` (completion of the `CI`
workflow), not on `push`, so it can gate on CI's overall conclusion. It runs
only when **all** of these hold:

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

### 1. Add three GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value | Where to get it |
| --- | --- | --- |
| `VERCEL_TOKEN` | A Vercel access token | Vercel → Account Settings → Tokens → Create. Scope it to the team that owns the project. |
| `VERCEL_ORG_ID` | The Vercel org/team id | `cd apps/myk9show && vercel link` (once), then read `.vercel/project.json` → `orgId`. |
| `VERCEL_PROJECT_ID` | The myK9Show project id | Same `.vercel/project.json` → `projectId`. |

`.vercel/` is git-ignored — `vercel link` is only used locally to read the two
ids; do not commit it.

### 2. Validate the gated deploy WITH auto-deploy still enabled

Do **not** disable Vercel auto-deploy yet. Merge the workflow, then trigger a
`main` build (any merge, or re-run CI on `main`). Confirm:

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

Instead, set `git.deploymentEnabled` for `main` to `false` in
[`apps/myk9show/vercel.json`](../../apps/myk9show/vercel.json). This blocks
deploys created from **Git events** on `main`, while leaving **CLI/API** deploys
(this workflow) and **PR preview** deploys (other branches) fully working:

```jsonc
{
  // ...existing config...
  "git": {
    "deploymentEnabled": {
      "main": false
    }
  }
}
```

Land that as a small follow-up commit once the workflow is validated — it is
config as code (reviewable, no dashboard step). From the commit that adds it,
pushes to `main` no longer auto-deploy; only the CI-gated workflow does.

## Rollback

If the gated deploy misbehaves, restore the previous behavior immediately by
reverting the `git.deploymentEnabled` change in `apps/myk9show/vercel.json`
(set `main` back to `true` or remove the `git` block) and merging — Vercel
resumes auto-deploying `main` on push. The workflow can be left in place or
disabled in Actions; with auto-deploy back on, production is unblocked while the
workflow is fixed.

## Not covered here

- **Docs/guides Vercel project** (`apps/docs`) still auto-deploys from `main`
  via its own Git integration. Gating it the same way is a follow-up — add a
  second job (or workflow) with that project's `VERCEL_PROJECT_ID`. Its build is
  independent of the app test suite, so it is lower risk to leave as-is for now.
- **Preview deploys for PRs** are unchanged — they keep coming from Vercel's Git
  integration (the Ignored Build Step above only skips production).

See also [`VERCEL-SETUP.md`](../architecture/VERCEL-SETUP.md) for project URLs,
root directories, and required `VITE_*` env vars.
