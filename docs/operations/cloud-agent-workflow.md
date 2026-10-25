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

| Provider          | Setup command                                                                | Status                                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code cloud | `MYK9_TOOLS_DIR=/usr/local/bin bash scripts/cloud/setup.sh`                  | **Verified** by the Stage 1 proof rerun on 2026-10-25 (branch @ `45a6cbcc9`, `NODE_OPTIONS` heap set): setup, preflight, typecheck, lint, test file and deno check all as expected. See [Stage 1 proof results](#stage-1-proof-results)             |
| Codex cloud       | `MYK9_CLOUD=1 MYK9_TOOLS_DIR=/usr/local/bin bash scripts/cloud/setup.sh`     | **Not yet verified**. Codex writes each environment's **Install script** itself, so tell it to use this command verbatim; Codex documents no environment marker, so `MYK9_CLOUD=1` declares it. See [Run the Stage 1 proof](#run-the-stage-1-proof) |
| GitHub Actions    | `bash scripts/cloud/setup.sh --role=<role>` (`GITHUB_ACTIONS` is the marker) | Used from Stage 2                                                                                                                                                                                                                                   |

The script:

1. Refuses on Darwin, on a machine with no cloud marker (unless `--force`) and on anything but Linux x86_64.
2. Requires the image's Node ≥ 22.12.0 and pnpm ≥ 9.15.9; it never installs or replaces them.
3. Installs gh, Deno and ShellCheck when missing or below the minimum, from the GitHub release URLs in [`scripts/cloud/tool-versions.json`](../../scripts/cloud/tool-versions.json), and stops with nothing installed on a sha256 mismatch. (`dl.deno.land` is blocked by the Claude cloud network policy; the GitHub release asset is not.)
4. Runs `pnpm install --frozen-lockfile`, builds the shared packages, runs `pnpm qa:dist-fresh`, then the preflight.

It copies no `.env`, credentials, browser profile or Keychain state. Secrets come from the provider's own settings.

`pnpm typecheck` needs a larger Node heap than the default, as in CI (`ci.yml` sets `NODE_OPTIONS=--max-old-space-size=4096`). Set `NODE_OPTIONS` in the provider's environment variables. On 2026-10-24 in a Claude Code cloud session, the app typecheck aborted with a heap OOM at the default and passed with `--max-old-space-size=6144`; `pnpm lint` and a shuffled app test file passed without it. Keep `--use-openssl-ca` in the value when the image already sets it, since the agent proxy needs it.

To change a pin, update `install`, `minimum`, `url` and `sha256` together, from the project's published checksums where it has them (gh and Deno do; ShellCheck does not, so hash the downloaded archive), and rerun setup in a cloud session.

## Run the Stage 1 proof

MYK9-1397 stays open until a fresh session in each cloud runs setup and the narrow checks on `main` and records the result. Provider settings below were checked against each provider's documentation on 2026-10-25; recheck them if a label no longer matches.

### Claude Code cloud environment

At [claude.ai/code](https://claude.ai/code), open the environment selector (the first control under the message box) and edit **Default** or choose **New environment**:

- **Network access**: **Trusted**. Its allowlist already includes `github.com`, `objects.githubusercontent.com` and `release-assets.githubusercontent.com`, which setup downloads gh, Deno and ShellCheck from.
- **Environment variables**: `NODE_OPTIONS=--use-openssl-ca --max-old-space-size=6144` (the image's own value is `--use-openssl-ca`, which the agent proxy's CA bundle needs; keep it).
- **Setup script**: leave empty for the proof. The box runs before the environment's variables are set, and it is cached only when it finishes in about five minutes, which a full install and package build may not. Run setup inside the session instead (the route verified on 2026-10-24), and move it into the box only after it has worked there.
- **GitHub**: the Claude GitHub App on the repository, or `/web-setup`. Through the session's GitHub proxy `gh api` works, but `gh pr` and `gh issue` (GraphQL) are rejected; the handoff CLI uses only `gh api`.

### Codex cloud environment

Choose **Work in > Cloud > Select environment > Create environment**, or **Settings > Codex Cloud > Environments > Create environment**:

- **Repositories**: `rbeezley/myk9-platform`.
- **Install script**: Codex writes this while it prepares the environment. Tell it to use exactly `MYK9_CLOUD=1 MYK9_TOOLS_DIR=/usr/local/bin bash scripts/cloud/setup.sh` and nothing else.
- **Environment variable**: `NODE_OPTIONS=--max-old-space-size=6144`.
- **Network**: turn on **Allow Codex to access internet**, choose **Package managers**, and add `github.com`, `api.github.com`, `objects.githubusercontent.com` and `release-assets.githubusercontent.com` under **Additional allowed domains**.
- **Network secret** (for the Linear read): `LINEAR_API_KEY` for `api.linear.app`, so the task sees only a placeholder.
- **Publish**, then start a new task; existing tasks keep their old state.

Codex's documentation does not state the VM's architecture, its Node and pnpm versions, or the install script's working directory. Setup refuses anything but Linux x86_64 and requires Node ≥ 22.12.0 and pnpm ≥ 9.15.9 already in the image, so the proof is what answers those. A refusal is a recorded blocker, not a reason to edit the pins.

### Session prompt

Paste into a fresh session in each environment, using the `codex/` prefix for the Codex run:

```text
Stage 1 cloud proof for MYK9-1397. Report any missing tool or permission as a BLOCKER, never as a pass.
1. Branch claude/myk9-1397-cloud-proof from main.
2. Run: MYK9_CLOUD=1 MYK9_TOOLS_DIR=/usr/local/bin bash scripts/cloud/setup.sh  (record its output)
3. Run: pnpm cloud:preflight --role=implementer --json
4. Run: pnpm typecheck; pnpm lint; cd apps/myk9show && pnpm vitest run scripts/verify-artifact-secrets.test.ts --sequence.shuffle
5. Run: deno check --node-modules-dir=none --no-lock supabase/functions/push-trigger-class-status/index.ts supabase/functions/push-trigger-run-proximity/index.ts
   (class-status has known pre-existing errors tracked in MYK9-1400; record the output, don't fix it)
6. Read MYK9-1397 in full from Linear, to prove full-issue access.
7. Record tool versions, uname -m, and each result in docs/operations/cloud-agent-workflow.md (the provider table and "Known gaps"), open a DRAFT PR, and stop.
```

Stage 1 closes when both runs have passed or named a specific blocker, their runbook PRs have merged, and MYK9-1397 has been re-read in full against its acceptance criteria.

### Stage 1 proof results

**Claude Code cloud, 2026-10-25 rerun**, fresh session, branch `claude/myk9-1397-cloud-proof` @ `45a6cbcc9` (`main` @ `38598b7af` plus the first run's docs commit). `uname -m`: `x86_64`. 4 vCPU, 15 GiB RAM. Environment `NODE_OPTIONS` was `--use-openssl-ca --max-old-space-size=6144`, so the first run's typecheck blocker is **resolved**.

| Step | Command                                                                      | Result                                                                                                                                                                                        |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2    | `echo "$NODE_OPTIONS"`                                                       | Pass: `--use-openssl-ca --max-old-space-size=6144`                                                                                                                                            |
| 3    | `MYK9_CLOUD=1 MYK9_TOOLS_DIR=/usr/local/bin bash scripts/cloud/setup.sh`     | Pass, exit 0. gh 2.89.0 already present; installed Deno 2.1.4 and ShellCheck 0.10.0; frozen install of 1461 packages; 12/12 package builds; `qa:dist-fresh` clean; embedded preflight `ready` |
| 4    | `pnpm cloud:preflight --role=implementer --json`                             | Pass, exit 0, `"missing": []`. Node 22.22.0, pnpm 9.15.9, git 2.43.0, gh 2.89.0, Deno 2.1.4, ShellCheck 0.10.0, jq 1.7; github.com reachable; `gh api` read ok                                |
| 5a   | `pnpm typecheck`                                                             | Pass, exit 0, 26/26 tasks in 3m32s with the environment's heap flag, no override. Ratchets report no new diagnostics (scripts/cloud 2 baselined, E2E 7 baselined)                             |
| 5b   | `pnpm lint`                                                                  | Pass, exit 0, 14/14 tasks; `@myk9/show` 0 errors, 43 warnings                                                                                                                                 |
| 5c   | `pnpm vitest run scripts/verify-artifact-secrets.test.ts --sequence.shuffle` | Pass, exit 0, 6/6 tests (seed `1792954387783`)                                                                                                                                                |
| 6    | `deno check … push-trigger-class-status … push-trigger-run-proximity`        | Exit 1, as expected: only the 3 known TS2339 errors at `push-trigger-class-status/index.ts:60-62` (MYK9-1400); no errors in `push-trigger-run-proximity`                                      |

The first run (same day, `main` @ `38598b7af`) passed every other step, including a Linear `get_issue MYK9-1397` read with all 7 acceptance criteria, but `pnpm typecheck` OOMed (exit 134) because the environment's `NODE_OPTIONS` lacked the heap flag. Setting it in the environment fixed that.

Codex cloud: not yet run.

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

- Only OWNER, MEMBER and COLLABORATOR comments count; the repository is public. A trusted comment that is malformed, whose `eventId` does not match its content, or whose `pr` is not this PR is an **invalid record**: `read` then returns `needs-human` without reporting any older state as current, and `append` refuses to write.
- `append` posts only an event for this PR, and only a child of the latest event after re-reading the ledger. A stale snapshot, a fork or a duplicate posts nothing.
- `read` returns `continue | wait | needs-human | complete`. A recorded owner whose run may still be going means `wait`; only an Actions run can be asked whether it ended. No process age, missing file or expired VM proves another owner's run is over.
- A clean result counts only on the current head with every referenced artifact still available. An artifact matches only when its digest, run ID and head SHA all match the event; the Actions API exposes no attempt, so the digest is what tells a re-uploaded replacement apart. A moved head, or an expired, missing, mismatched or digest-less artifact, means evidence is unavailable, never clean.
- `complete` needs a merged PR whose latest event is a `closed-out` with result `clean` and no unmet criteria; any other close-out keeps the owed action.
- **A snapshot is never authorization.** Merges still need a person's go-ahead on the exact head.

Detailed reports and logs go in Actions artifacts with 30-day retention, referenced by run ID, attempt and digest. The PR or Linear record keeps the minimal receipt. Everything uploaded or published passes [`publication-scan.ts`](../../scripts/cloud/publication-scan.ts) first. That reuses the E2E artifact scanner over every secret-named variable in the environment (model keys, `GH_TOKEN`, `LINEAR_API_KEY`, test passwords). A hit, a scanner error, a missing staging directory or any directory inside it that cannot be listed blocks publication. Diagnostics name locations only, scrubbed of secret values (a file can be named after the key it holds).

## Known gaps

- Codex cloud setup has not been run (it can't be from a Claude session). Record its versions here once it has.
- `deno check` reports pre-existing type errors in `push-trigger-class-status` and `push-trigger-announcement`: untyped PostgREST embeds infer arrays where a many-to-one embed returns an object at runtime. `push-trigger-run-proximity` checks clean. Filed separately, not fixed in Stage 1.
- The base64 spelling of a secret is not scanned (the shared scanner matches verbatim and JSON-escaped forms).
