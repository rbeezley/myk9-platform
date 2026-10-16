# Vercel preview quota controls

> **2026-09-23:** the myK9Show app project no longer builds from Git at all (`git.deploymentEnabled: false`); production deploys run through `deploy-myk9show.yml` — see [`ci-vercel-deploys.md`](ci-vercel-deploys.md). What follows still applies to the guides project.

> **2026-10-12:** the guides project's Git repository is now disconnected in Vercel too, because `git.deploymentEnabled: false` stopped its builds but not its "Skipped – Not affected" records (about 47 a day). Skip the "connected to GitHub" check in section 1 for the guides project. See [The Git connection is off](#the-git-connection-is-off-2026-10-12).

> **Status:** Repo-side policy is in place. Vercel dashboard verification is still required because the current connector can read basic project metadata but cannot read or update the monorepo skip-unaffected setting.

The Vercel Hobby tier has a daily deployment-created limit. This monorepo can spend that quota quickly because each PR push may create previews for more than one connected Vercel project. The target behavior is:

- GitHub CI is the merge gate.
- Vercel previews are review aids, not required checks.
- Unaffected monorepo projects should not build for unrelated PR changes.
- PR branches should be pushed in batches after local verification.

## 1. Enable skip-unaffected project behavior

Check both connected Vercel projects:

| Vercel project                                                       | Root Directory  | Expected behavior                                                 |
| -------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| `myk9-platform-myk9show` (`prj_cI5y8eatUD4YDRZn3ZTBcLFdN1uk`)        | `apps/myk9show` | App previews build only when the app or its dependencies changed. |
| `myk9-platform-myk9show-guides` (`prj_jHJvF6oJEiRw344vhKHQDkKPGr3f`) | `apps/docs`     | Guide previews build only when docs/guides changed.               |

In Vercel, open each project and verify:

1. **Settings → General → Root Directory** is set to the directory above.
2. **Build and Deployment → Root Directory** has Vercel's monorepo skip-unaffected behavior enabled.
3. The project is connected to GitHub, not another Git provider.

The repo already satisfies the monorepo requirements Vercel documents for this feature:

- [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) includes `apps/*` and `packages/*`.
- [`apps/myk9show/package.json`](../../apps/myk9show/package.json) declares the internal workspace packages it depends on.
- [`apps/docs/package.json`](../../apps/docs/package.json) is named `@myk9/docs` and does not depend on the app packages.

Do **not** use an Ignored Build Step as the primary quota fix. Vercel's Ignored Build Step still runs after a deployment has entered the build pipeline, so it can still spend deployment/concurrency quota. Skip-unaffected projects is the lower-noise control for a monorepo.

Verification after changing Vercel settings:

- A docs-only PR should not build the myK9Show app project.
- An app-only PR should not build the guides project.
- A shared package change should build only the projects that actually depend on that package.

### Agent branches never build a guides preview

Skip-unaffected alone was not enough. On 2026-09-25 the guides project made 78 deployments: 46 skipped as "Not affected", but 32 built, 21 of them for agent PRs that touched only myK9Show, migrations or edge functions, most likely because a branch's first push has no earlier deployment to compare against. The account hit its 100-a-day limit and the real myK9Show production deploy was refused (`api-deployments-free-per-day`).

The first fix turned Git deploys off only for `claude/*`, `codex/*`, `worktree-*` and `main`. That was not enough either. On 2026-10-04, branches named `feat/*`, `chore/*`, `fix/*` and `qa/*` slipped past the list. In 24 hours the guides project created 79 deployments: 27 preview builds, plus 52 "Skipped – Not affected" records, which Vercel still creates. The owner's myK9Show production deploy was refused twice (`api-deployments-free-per-day`).

### The guides publish only on request (2026-10-04)

[`apps/docs/vercel.json`](../../apps/docs/vercel.json) sets `git.deploymentEnabled: false`, exactly like myK9Show. `apps/myk9show/src/test/ci/guidesPreviewScope.test.ts` pins this. It stopped the builds, but **not the records**.

### The Git connection is off (2026-10-12)

`deploymentEnabled: false` did not stop the guides project from creating deployment records. From 2026-10-05 to 2026-10-12, GitHub's deployment list (`gh api repos/rbeezley/myk9-platform/deployments`) shows:

- **330 guides records**, about 47 a day: 244 "Preview" records (PR heads) and 86 "Production" records (one per `main` merge).
- **Every one ended "Skipped – Not affected".** None built.

The project was still connected to the repo, and the monorepo skip-unaffected check created a record for every push before anything else applied. These are the same skipped records that filled the quota on 2026-10-04. Whether a skipped record counts toward the 100-a-day limit is not confirmed, but that incident suggests it does. myK9Show, with the same `vercel.json` setting, created only 4 records that week.

The owner disconnected the guides project's Git repository in Vercel at 16:51 UTC (Settings → Git → Disconnect). Publishing does not need the connection: `deploy-guides.yml` reaches the project through `VERCEL_PROJECT_ID` and `VERCEL_TOKEN` (`vercel pull`, `vercel build`, `vercel deploy --prebuilt --prod`), not through Git.

**Verified the same day.** The only push after the disconnect, `7262e6389` at 16:58, got no guides record in the following 93 minutes. Five more skipped records did arrive after 16:51, but every one was for a commit pushed before it: Vercel created them 50 to 55 minutes after the push. Publishing still works: `deploy-guides.yml` run 38285164238 published to `help.myk9show.com`.

**To check that it holds:** list the newest records at least an hour after a merge or PR push, because records lag the push by up to about 55 minutes. A guides record is any record whose status links to `myk9-platform-myk9show-guides-…vercel.app`. Since the disconnect, the label reads just `Preview` or `Production`, without the project name, so read the link rather than the label. A guides record for a commit pushed after the disconnect means something reconnected the project. Records owned by `rbeezley` (`guides-production`, `production`) come from the publish workflows and are expected.

```bash
gh api "repos/rbeezley/myk9-platform/deployments?per_page=5" --jq '.[]|"\(.created_at) \(.environment)"'
```

**Do not reconnect the repository** to get PR previews back. To preview a guides change, build it locally (below).

To publish the guides, run the manual workflow. Each run costs one Vercel deployment:

```bash
gh workflow run deploy-guides.yml                  # main as it is now
gh workflow run deploy-guides.yml -f ref=<sha>     # a specific commit or branch
```

It builds in Actions and uploads with `vercel deploy --prebuilt --prod`, the same pattern as [`deploy-myk9show.yml`](../../.github/workflows/deploy-myk9show.yml). There are no guides PR previews any more. To check a guides change before publishing, build locally with `pnpm --filter @myk9/docs build`. The dormant `guides-release` branch tracking (MYK9-44) no longer deploys anything either, because Git deploys are off. When MYK9-44 is picked up, the guides release should go through this workflow.

**A red "Deployment rate limited" status on a PR is the quota, not a leak.** While the day's quota is spent, Vercel can post that failure (`targetUrl` ending `?upgradeToPro=build-rate-limit`) before it checks whether the project builds at all, and nothing is built.

## 2. Keep Vercel previews non-required

GitHub branch protection should continue to use GitHub CI as the required gate. As of 2026-07-07, the `main-required-checks` ruleset requires only:

- `Quality Checks`
- `Test`
- `A11y smoke`
- `E2E PR Smoke`

No Vercel status context is required. If a Vercel preview fails only because the Hobby quota is exhausted, treat it as an availability/quota condition, not a code blocker. Merge can proceed once the required GitHub checks are green and the change has been reviewed.

## 3. Reduce push churn

Before pushing a PR branch:

- Run focused local verification first.
- Use subagent/review passes before the first push when practical.
- Batch small fixes into one push instead of pushing every edit.
- Prefer one cleanup/fixup commit after review feedback instead of several micro-pushes.
- Do not rerun or re-push solely to clear a Vercel rate-limit status.

For docs-only/operator-doc changes, validate with `git diff --check` and targeted `rg` checks. For app changes, run the narrow tests/typechecks tied to the files touched before pushing.
