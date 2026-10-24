# Cloud Agent Workflow

How Claude Code and Codex sessions set up, check themselves and hand work off, on the Mac or in a cloud checkout. Plan: [`docs/plan-cloud-agent-workflow.md`](../plan-cloud-agent-workflow.md). Stage 1 (this page): setup, preflight, discovered checkout paths, branch prefixes and the handoff ledger (MYK9-1397). Cloud review publication (Stage 2) and continuation (Stage 3) are not built yet.

## Local and cloud are both permanent

The cloud route is an addition, not a replacement. On the Mac nothing changes:

- `bash scripts/bootstrap-worktree.sh` still prepares a worktree.
- `pnpm qa:codex-review` and `pnpm qa:claude-review`, including `--post`, keep their behavior and their local logins.
- `scripts/cloud/setup.sh` refuses to run on macOS, before it downloads or installs anything, and never touches Node, gh auth, `~/.codex`, `~/.claude` or the Keychain. `scripts/cloud/local-compat.test.ts` holds it to that.
- `pnpm cloud:preflight` is read-only everywhere, so it is safe to run locally to see what a role would need.

## Branch prefixes declare authorship

| Implementer | Branch prefix | Independent reviewer |
| ----------- | ------------- | -------------------- |
| Claude      | `claude/`     | Codex                |
| Codex       | `codex/`      | Claude               |

Name branches `<prefix>myk9-<n>-<slug>`. Linear's "copy branch name" suggests `richardbeezley1/myk9-<n>-…`; replace the prefix. From Stage 2 the cloud reviewer cross-checks the prefix against the commits' `Co-Authored-By:` trailers and refuses a mismatch, an unknown prefix or mixed authorship.

Open PRs as **drafts** while iterating and mark them ready for review when they are. Once Stage 2 ships, marking a PR ready starts a cloud review and every later push re-runs it; drafts get none, because the gate is pinned to the exact head.

## Cloud setup

Point the provider's setup step at the one script. Tools land in `MYK9_TOOLS_DIR`, default `<repo>/.cloud-tools/bin` (gitignored); use a directory already on `PATH` so later shells find them.

| Provider          | Setup command                                                                | Status                                                                                          |
| ----------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Claude Code cloud | `MYK9_TOOLS_DIR=/usr/local/bin bash scripts/cloud/setup.sh`                  | Verified 2026-10-24 (default tools dir), versions below                                         |
| Codex cloud       | `MYK9_CLOUD=1 MYK9_TOOLS_DIR=/usr/local/bin bash scripts/cloud/setup.sh`     | **Not yet verified**: Codex has no documented environment marker, so `MYK9_CLOUD=1` declares it |
| GitHub Actions    | `bash scripts/cloud/setup.sh --role=<role>` (`GITHUB_ACTIONS` is the marker) | Used from Stage 2                                                                               |

The script:

1. Refuses on Darwin, on a machine with no cloud marker (unless `--force`) and on anything but Linux x86_64.
2. Requires the image's Node ≥ 22.12.0 and pnpm ≥ 9.15.9; it never installs or replaces them.
3. Installs gh, Deno and ShellCheck when missing or below the minimum, from the GitHub release URLs in [`scripts/cloud/tool-versions.json`](../../scripts/cloud/tool-versions.json), and stops with nothing installed on a sha256 mismatch. (`dl.deno.land` is blocked by the Claude cloud network policy; the GitHub release asset is not.)
4. Runs `pnpm install --frozen-lockfile`, builds the shared packages, runs `pnpm qa:dist-fresh`, then the preflight.

It copies no `.env`, credentials, browser profile or Keychain state. Secrets come from the provider's own settings.

To change a pin, update `install`, `minimum`, `url` and `sha256` together, from the project's published checksums where it has them (gh and Deno do; ShellCheck does not, so hash the downloaded archive), and rerun setup in a cloud session.

## Preflight

```bash
pnpm cloud:preflight --role=implementer            # node, pnpm, git, gh, deno, shellcheck, jq
pnpm cloud:preflight --role=reviewer --reviewer-harness=codex   # + codex CLI, OPENAI_API_KEY in cloud
pnpm cloud:preflight --role=publisher              # node, git, gh, jq
pnpm cloud:preflight --role=publisher --json       # machine-readable report
```

It exits nonzero and names each missing capability. Its only probes are `--version` calls, a HEAD request to github.com and `gh api rate_limit`, a GET: it never proves write access by writing. Model keys are reported by name only. Locally the reviewer's key check reads "local login; not checked", since the Mac wrappers use the CLI logins.

`gh auth status` can fail in a Claude cloud session while `gh api` works, because the proxy injects credentials. The preflight therefore tests an API read, not `auth status`.

Verified in a Claude Code cloud session on 2026-10-24: Node 22.22.0, pnpm 9.15.9, git 2.43.0, gh 2.89.0, jq 1.7, Deno 2.1.4 and ShellCheck 0.10.0 (both installed by setup.sh), with GitHub reads working. Implementer and publisher roles came back ready. The reviewer role reported `ANTHROPIC_API_KEY` missing, which is expected: that key lives in the `independent-review` environment from Stage 2.

## Edge-function checks

```bash
pnpm exec tsx scripts/cloud/deno-check-changed.ts --list   # which entrypoints this branch affects
pnpm exec tsx scripts/cloud/deno-check-changed.ts          # deno check each one
```

An entrypoint counts as affected when its transitive relative imports reach a changed file: its own folder, `_shared/`, or the `packages/` modules some functions import. A change to `supabase/functions/deno.json` checks everything. The script passes `--node-modules-dir=none` (without it, Deno finds the pnpm `node_modules` and rejects `npm:` specifiers) and `--no-lock`.

## Handoff ledger

A run records its checkpoints as append-only marked comments (`<!-- myk9-handoff:v1 -->`) in the PR thread. Before a PR exists, the checkpoint is a Linear comment on the issue that points at the pushed branch. A fresh session, local or cloud, rebuilds the issue, current head, owner, evidence and next step from those records, not from temp folders or a prior context window.

```bash
pnpm exec tsx scripts/cloud/handoff-cli.ts read --pr=<n>                       # GET only
pnpm exec tsx scripts/cloud/handoff-cli.ts append --pr=<n> --event=<file.json>
```

Rules the code enforces ([`handoff.ts`](../../scripts/cloud/handoff.ts)):

- Only OWNER, MEMBER and COLLABORATOR comments count; the repository is public. An event whose `eventId` does not match its content is rejected.
- `append` re-reads the ledger and posts only a child of the latest event. A stale snapshot, a fork or a duplicate posts nothing.
- `read` returns `continue | wait | needs-human | complete`. A recorded owner whose run may still be going means `wait`; only an Actions run can be asked whether it ended. No process age, missing file or expired VM proves another owner's run is over.
- A clean result counts only on the current head with every referenced artifact still available. A moved head or an expired or missing artifact means evidence is unavailable, never clean.
- **A snapshot is never authorization.** Merges still need a person's go-ahead on the exact head.

Detailed reports and logs go in Actions artifacts with 30-day retention, referenced by run ID, attempt and digest. The PR or Linear record keeps the minimal receipt. Everything uploaded or published passes [`publication-scan.ts`](../../scripts/cloud/publication-scan.ts) first. That reuses the E2E artifact scanner over every secret-named variable in the environment (model keys, `GH_TOKEN`, `LINEAR_API_KEY`, test passwords). A hit, a scanner error or a missing staging directory blocks publication, and diagnostics name locations only, never a value.

## Known gaps

- Codex cloud setup has not been run (it can't be from a Claude session). Record its versions here once it has.
- `deno check` reports pre-existing type errors in `push-trigger-class-status` and `push-trigger-announcement`: untyped PostgREST embeds infer arrays where a many-to-one embed returns an object at runtime. `push-trigger-run-proximity` checks clean. Filed separately, not fixed in Stage 1.
- The base64 spelling of a secret is not scanned (the shared scanner matches verbatim and JSON-escaped forms).
