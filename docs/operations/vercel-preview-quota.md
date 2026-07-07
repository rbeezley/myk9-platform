# Vercel preview quota controls

> **Status:** Repo-side policy is in place. Vercel dashboard verification is still required because the current connector can read basic project metadata but cannot read or update the monorepo skip-unaffected setting.

The Vercel Hobby tier has a daily deployment-created limit. This monorepo can spend that quota quickly because each PR push may create previews for more than one connected Vercel project. The target behavior is:

- GitHub CI is the merge gate.
- Vercel previews are review aids, not required checks.
- Unaffected monorepo projects should not build for unrelated PR changes.
- PR branches should be pushed in batches after local verification.

## 1. Enable skip-unaffected project behavior

Check both connected Vercel projects:

| Vercel project | Root Directory | Expected behavior |
| --- | --- | --- |
| `myk9-platform-myk9show` (`prj_cI5y8eatUD4YDRZn3ZTBcLFdN1uk`) | `apps/myk9show` | App previews build only when the app or its dependencies changed. |
| `myk9-platform-myk9show-guides` (`prj_jHJvF6oJEiRw344vhKHQDkKPGr3f`) | `apps/docs` | Guide previews build only when docs/guides changed. |

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
