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

Point the provider's setup step at the one script. Tools land in `MYK9_TOOLS_DIR`, default `<primary-checkout>/.cloud-tools/bin` (gitignored); use a directory already on `PATH` so later shells find them.

| Provider          | Setup command                                                                | Status                                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code cloud | `MYK9_TOOLS_DIR=/usr/local/bin bash scripts/cloud/setup.sh`                  | **Verified** by the Stage 1 proof rerun on 2026-10-25 (branch @ `45a6cbcc9`, `NODE_OPTIONS` heap set): setup, preflight, typecheck, lint, test file and deno check all as expected. See [Stage 1 proof results](#stage-1-proof-results) |
| Codex cloud       | `MYK9_CLOUD=1 bash scripts/cloud/run.sh bash scripts/cloud/setup.sh`         | **Runtime checks passed through the wrapper on 2026-10-26; Deno remains blocked by JSR network policy.** See the current and historical receipts under [Codex cloud](#codex-cloud).                                                     |
| GitHub Actions    | `bash scripts/cloud/setup.sh --role=<role>` (`GITHUB_ACTIONS` is the marker) | Used from Stage 2                                                                                                                                                                                                                       |

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
- **Install script**: Codex writes this while it prepares the environment. Tell it to use exactly `MYK9_CLOUD=1 bash scripts/cloud/run.sh bash scripts/cloud/setup.sh`. Use the wrapper for every task command too; remove the old `/usr/local/bin` tools override. See [command instructions](../../scripts/cloud/README.md).
- **Environment variable**: `NODE_OPTIONS=--max-old-space-size=6144`.
- **Network**: turn on **Allow Codex to access internet**, choose **Package managers**, and add `github.com`, `api.github.com`, `objects.githubusercontent.com` and `release-assets.githubusercontent.com` and `jsr.io` under **Additional allowed domains**. Request shell network permission for each network/IPC command (`with_additional_permissions`, `additional_permissions.network.enabled: true`); leave proxy and CA settings intact.
- **Network secret** (for the Linear read): `LINEAR_API_KEY` for `api.linear.app`, so the task sees only a placeholder.
- **Publish**, then start a new task; existing tasks keep their old state.

Codex's documentation does not state the VM's architecture, its Node and pnpm versions, or the install script's working directory. Setup refuses anything but Linux x86_64 and requires Node ≥ 22.12.0 and pnpm ≥ 9.15.9 already in the image, so the proof is what answers those. A refusal is a recorded blocker, not a reason to edit the pins.

### Session prompt

Paste into a fresh session in each environment, using the `codex/` prefix for the Codex run:

```text
Stage 1 cloud proof for MYK9-1397. Report any missing tool or permission as a BLOCKER, never as a pass.
1. Branch claude/myk9-1397-cloud-proof from main.
2. Run: MYK9_CLOUD=1 bash scripts/cloud/run.sh bash scripts/cloud/setup.sh (record output and actual exit; finish setup before checks)
   Prefix every later command below with MYK9_CLOUD=1 bash scripts/cloud/run.sh.
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

#### Codex cloud

Current operating instructions: [scripts/cloud/README.md](../../scripts/cloud/README.md). All receipts below are chronological; later checks supersede only the failures they actually retest.

**2026-10-25**, fresh Codex cloud task, branch `codex/myk9-1397-cloud-proof` from freshly fetched `origin/main` @ `b7c22fa938bf2b4952b33d2475c626a0cca1febc`, in `/workspace/wt-myk9-1397-cloud-proof`. Every proof command redirected stdout/stderr to its own worktree `.logs/<name>.log`, followed immediately by `echo "EXIT=$?"`; prepared reruns also saved that receipt in `.logs/<name>.exit`. No tool pins or edge-function source were changed.

The install script **already ran setup**, using `/workspace/myk9-platform/.cloud-tools/install.sh`: it selected repo-local `.cloud-tools/bin`, Corepack pnpm 9.15.9, writable repo-local XDG paths and `NODE_OPTIONS=--max-old-space-size=6144`. Existing `.logs/cloud-setup.log` and `.logs/install-repeat.log` end with failed GitHub-read preflights; `.logs/install-final.log` ends with all tools ready, 12 successful package builds, fresh dist and `preflight: ready`. These historical logs contain **no captured process exit code**, so no historical exit code is asserted. This differs from the prescribed `/usr/local/bin` install command.

Those settings did **not** persist into the task shell: its `NODE_OPTIONS` was empty, its pnpm was 11.25.0, its gh was 2.46.0 (below the 2.89.0 minimum), and Deno/ShellCheck were absent from `PATH`. Prepared reruns explicitly prepended `/workspace/myk9-platform/.cloud-tools/bin`, restored the install script's `COREPACK_HOME` and XDG data/cache/state/config paths, and enabled `MYK9_CLOUD=1`. Typecheck, lint and the test used `NODE_OPTIONS=--max-old-space-size=6144`. Shell network access was enabled for network commands. Deno used a writable, empty worktree cache at `.cloud-tools/deno-cache`.

| Step                     | Command                                                                                                                                                     | Result                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1                        | Fetch latest `main`; create branch/worktree                                                                                                                 | Initial sandbox fetch exit 128 (proxy unreachable); network-enabled retry exit 0, worktree creation exit 0, base SHA above.                                                                                                                                                                                    |
| 2                        | `uname -m`; `echo "$NODE_OPTIONS"`; `node -v`; `pnpm -v`                                                                                                    | Each exit 0: `x86_64`; empty; `v24.19.0`; `11.25.0`. Prepared pnpm: `9.15.9`, exit 0.                                                                                                                                                                                                                          |
| 2                        | Tool versions                                                                                                                                               | Task shell: git 2.52.0, gh 2.46.0, jq 1.7 (exit 0 each); Deno and ShellCheck missing (exit 127 each, **BLOCKER**). Prepared tools: gh 2.89.0, Deno 2.1.4, ShellCheck 0.10.0, confirmed by passing preflight.                                                                                                   |
| 3                        | `MYK9_CLOUD=1 MYK9_TOOLS_DIR=/usr/local/bin bash scripts/cloud/setup.sh`                                                                                    | **BLOCKER**, exit 1: `install: cannot create regular file '/usr/local/bin/gh': Read-only file system`; expanded-permission retry also exit 1 (`Permission denied`). Arch, Node and pnpm were not refused. Logs: `setup.log`, `setup-escalated.log`.                                                            |
| 3 rerun                  | Same setup command with prepared tools/cache paths                                                                                                          | Exit 0: frozen install, 12 successful package builds, fresh dist, embedded preflight ready (`setup-prepared.log`). Reused existing repo-local binaries; this does **not** prove `/usr/local/bin` writable or task-shell persistence fixed.                                                                     |
| 4                        | `pnpm cloud:preflight --role=implementer --json`                                                                                                            | Initial exit 1: pnpm cannot create `/home/agent/.local/share/pnpm` (**BLOCKER**). Prepared rerun exit 0, `"missing": []`, `"cloud": true`, including network/GitHub reads (`preflight-prepared.log`).                                                                                                          |
| 5a                       | `pnpm typecheck`                                                                                                                                            | **BLOCKER**, initial exit 1 at pnpm store creation; prepared rerun exit 1: Astro cannot create `/home/agent/.config/astro`. 16/26 tasks completed; no claim that the whole workspace typechecks (`typecheck-prepared.log`).                                                                                    |
| 5b                       | `pnpm lint`                                                                                                                                                 | Initial exit 1 at pnpm store creation (**BLOCKER**); prepared rerun passes, exit 0: 14/14 tasks, 0 errors and 43 warnings (`lint-prepared.log`).                                                                                                                                                               |
| 5c                       | `pnpm vitest run scripts/verify-artifact-secrets.test.ts --sequence.shuffle` (in `apps/myk9show`)                                                           | Initial exit 1 at pnpm store creation (**BLOCKER**); prepared rerun passes, exit 0: 6/6 tests, seed `1792956760093` (`artifact-secrets-test-prepared.log`).                                                                                                                                                    |
| 6                        | `deno check --node-modules-dir=none --no-lock supabase/functions/push-trigger-class-status/index.ts supabase/functions/push-trigger-run-proximity/index.ts` | **BLOCKER**, initial exit 127 (Deno missing); prepared rerun exit 1: proxy tunnel to `https://jsr.io/@supabase/functions-js/meta.json` denied (`deno-combined-prepared.log`). Did not reach the three known MYK9-1400 errors; no typecheck pass asserted.                                                      |
| 6 fallback               | `deno check --node-modules-dir=none --no-lock supabase/functions/push-trigger-run-proximity/index.ts`                                                       | **BLOCKER**, initial exit 127; prepared rerun exit 1 with the same JSR network denial (`deno-proximity-prepared.log`). Run-proximity was checked separately and did not pass in this environment.                                                                                                              |
| 7                        | Linear GraphQL API with `LINEAR_API_KEY`                                                                                                                    | Pass, exit 0: full description, all 7 acceptance criteria, parent/children and both relation directions retrieved; all connection pages exhausted. Blocks MYK9-1398; related to MYK9-1400 and MYK9-1414. State observed: Done; this proof does not establish every criterion passed (`linear-full-issue.log`). |
| Workflow guard           | `pnpm qa:inflight docs/operations/cloud-agent-workflow.md`                                                                                                  | **BLOCKER**, exit 1: the supplied primary checkout is on `work`, not `main` (`inflight-prepared.log`). Work remained in the feature worktree. Linear In Progress issues were also read without pagination remaining.                                                                                           |
| Documentation validation | `pnpm qa:code-quality-ratchet`                                                                                                                              | Pass, exit 0 (`code-quality-ratchet.log`); `pnpm exec prettier --write docs/operations/cloud-agent-workflow.md` and `git diff --check` also exit 0.                                                                                                                                                            |

**Overall: BLOCKED.** Passing prepared reruns do not erase missing task-shell configuration, install permissions, the Astro permission failure or the Deno network denial. The draft PR records the proof; it does not close the cloud acceptance criterion.

##### Historical remediation results, 2026-10-25

Commands below used `MYK9_CLOUD=1 bash scripts/cloud/run.sh` in separate command shells, with shell network permission enabled. Node 24.19.0, pnpm 9.15.9, git 2.52.0, gh 2.89.0, Deno 2.1.4, ShellCheck 0.10.0 and jq 1.7 were confirmed by preflight; architecture remains x86_64. Logs and immediately captured exit receipts are in the proof worktree's `.logs/fix-*` files.

| Check                                                       | Result                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bash scripts/cloud/setup.sh`                               | Exit 0: frozen install, 12 package builds, fresh dist, embedded preflight ready. Uses writable repo-local tools.                                                                                                                                                        |
| `pnpm cloud:preflight --role=implementer --json`            | Exit 0, `missing: []`.                                                                                                                                                                                                                                                  |
| `pnpm typecheck`                                            | Exit 0, 26/26 tasks; Astro's config permission failure is resolved. An earlier attempt overlapped setup builds and exited 2 on a transient missing generated declaration; the sequential rerun passed after setup finished.                                             |
| `pnpm lint`                                                 | Exit 0, 14/14 tasks, 0 errors and 43 warnings.                                                                                                                                                                                                                          |
| Cloud suite, shuffled                                       | Exit 0, 8 files / 137 tests, including the 7 new wrapper/Turbo tests. The new tests failed before implementation; the Turbo fixture reproduced stripped config/telemetry settings.                                                                                      |
| Artifact-secrets app file, shuffled                         | Exit 0, 6/6 tests, seed `1792957818648`.                                                                                                                                                                                                                                |
| ShellCheck, Prettier, code-quality ratchet, diff whitespace | Exit 0 each.                                                                                                                                                                                                                                                            |
| Inflight guard for the four remediation paths               | Exit 0 after putting the clean primary checkout on freshly fetched `main`, preserving branch `work`. No guard bypass or guard source change. The original runbook is concurrently touched by PR #3272; these instructions are kept here to avoid overlapping that work. |
| Combined Deno check; run-proximity alone                    | **BLOCKER**, exit 1 each: proxy tunnel to `jsr.io` denied. The known MYK9-1400 diagnostics were not reached.                                                                                                                                                            |
| Broader shuffled app suite                                  | **BLOCKER: incomplete**. Interrupted after it stopped producing useful output, under the repository hang rule. Tool session exit 130; no final Vitest verdict or command exit receipt was produced. This is not a passing run.                                          |
| Fresh provider task after publishing settings               | **BLOCKER: not run**. The available environment tools cannot edit the allowlist or start a fresh managed task.                                                                                                                                                          |

The writable-path, shell-environment and Astro blockers are fixed for commands launched through the wrapper. JSR access, fresh-task proof and the incomplete broader app run remain explicit gaps. Tool pins and edge-function source are unchanged.

##### Published-environment proof retry, 2026-10-26

This proof ran in the attached published Codex Cloud environment, configuration
`cecfgver_6ade570b62648197b0587885e71cdaac` (revision 2), instance
`ccarenv_b64_Y2NhcmVudl85OTYyNWIzMDNhNDQ4MTkxOTkyODM4NDE0MmNjYTE4MA`.
Runtime status reported running/connected, current observations and restricted
network policy enforced. Individual secret/runtime-variable readiness remained
unknown; successful GitHub preflight is evidence for that API read only.

The task started from the provider's older checkout on `work` at
`f23d2fbf97d62bf5cc72a7376e2d85b3b8bf9153`, without `run.sh`. Fetching the existing
PR branch succeeded with network permission, and the proof ran in isolated linked
worktree `/workspace/wt-myk9-1397-cloud-proof` on
`codex/myk9-1397-cloud-proof`, exact source head
`66e0d34c3e4514f01c8c982cfa692cffa3d8a08c`. This is the attached cloud task's retry,
not the parent's earlier unattached Work attempt. The install script's old-snapshot
run is not counted: wrapper setup completed again here before all proof checks.
No credentials or local `.env` were copied. No executable source, pins or edge
functions changed in this retry.

**Shell network permission is required per command.** Use command-tool
`sandbox_permissions: "with_additional_permissions"` with
`additional_permissions: { network: { enabled: true } }` for commands that need
network access, preserving inherited proxy and CA settings. Without it the earlier
fetch exited 128 and HTTPS probe exited 7 with an unreachable proxy; with it the
GitHub HTTPS probe exited 0 / HTTP 200 and branch fetch exited 0. This was a shell
permission omission, not evidence of a broken published environment.

All commands below ran through `MYK9_CLOUD=1 bash scripts/cloud/run.sh`; network
permission was enabled. Each runner redirected output to `.logs/<name>.log`,
immediately captured the real status, printed `EXIT=<status>` and saved it in
`.logs/<name>.exit`. Logs remain local to this active worktree. Setup ran
sequentially before validation; independent checks then ran concurrently.

Versions: `uname -m` = `x86_64`; Node 24.19.0, pnpm 9.15.9, git 2.52.0,
gh 2.89.0, Deno 2.1.4, ShellCheck 0.10.0, jq 1.7; Turbo 2.11.8,
Vitest 5.0.0. JSON implementer preflight reported `missing: []`.

| Log name           | Exact command after wrapper                                                                                                                                 | Result                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup`            | `bash scripts/cloud/setup.sh`                                                                                                                               | `EXIT=0`: frozen install, 12/12 package builds, dist fresh, embedded preflight ready.                                                                                |
| `preflight`        | `pnpm cloud:preflight --role=implementer --json`                                                                                                            | `EXIT=0`, `missing: []`.                                                                                                                                             |
| `typecheck`        | `pnpm typecheck`                                                                                                                                            | `EXIT=0`, 26/26 tasks, normal strict Turbo environment mode; no loose-mode override. Scripts/cloud retains 2 known baselined TS2769 diagnostics, no new diagnostics. |
| `lint`             | `pnpm lint`                                                                                                                                                 | `EXIT=0`, 14/14 tasks, 0 errors / 43 warnings.                                                                                                                       |
| `cloud-tests`      | `pnpm exec vitest run --project=root scripts/cloud --sequence.shuffle`                                                                                      | `EXIT=0`, 8 files / 137 tests, seed `1793035773053`. Includes discovered-checkout, preflight, handoff, publication and wrapper regressions.                          |
| `scanner-tests`    | `bash -c 'cd apps/myk9show && pnpm vitest run scripts/verify-artifact-secrets.test.ts --sequence.shuffle'`                                                  | `EXIT=0`, 1 file / 6 tests, seed `1793035776595`.                                                                                                                    |
| `deno-combined`    | `deno check --node-modules-dir=none --no-lock supabase/functions/push-trigger-class-status/index.ts supabase/functions/push-trigger-run-proximity/index.ts` | **BLOCKER**, `EXIT=1`: JSR manifest download denied before type validation.                                                                                          |
| `deno-proximity`   | `deno check --node-modules-dir=none --no-lock supabase/functions/push-trigger-run-proximity/index.ts`                                                       | **BLOCKER**, `EXIT=1`: same JSR manifest denial.                                                                                                                     |
| `skill-validation` | `bash -c 'cd apps/myk9show && pnpm vitest run src/test/ci/skillTrees.test.ts --sequence.shuffle'`                                                           | `EXIT=0`, 19 tests, seed `1793035879605`; repository skill-tree/link/inventory validator. No skill references changed.                                               |
| `shellcheck`       | `shellcheck scripts/cloud/run.sh scripts/cloud/setup.sh`                                                                                                    | `EXIT=0`.                                                                                                                                                            |
| `ratchet`          | `pnpm qa:code-quality-ratchet`                                                                                                                              | `EXIT=0`, no metric regression.                                                                                                                                      |
| `inflight`         | `pnpm qa:inflight scripts/cloud/README.md`                                                                                                                  | Initial `EXIT=1`: clean primary on `work`, not `main`. Owner explicitly approved switching the clean primary to new `main` at `origin/main`, preserving `work`.      |
| `inflight-rerun`   | `pnpm qa:inflight scripts/cloud/README.md`                                                                                                                  | `EXIT=0`, no competing work on this receipt; owned PR excluded by branch.                                                                                            |

Both Deno attempts failed to load
`https://jsr.io/@supabase/functions-js/meta.json` with an unsuccessful proxy tunnel.
A read-only `curl --fail --silent --show-error --connect-timeout 5 --max-time 15
--output /dev/null --write-out 'HTTP_STATUS=%{http_code}\n'
https://jsr.io/@supabase/functions-js/meta.json` also exited 22, reporting proxy
HTTP 403 (CONNECT failed, so final HTTP_STATUS was 000). **The known MYK9-1400
class-status errors were not reached, and run-proximity is not type-validated.**
The environment owner still needs to allow `jsr.io`, publish and rerun both Deno
commands. No policy bypass, pin change or edge-source workaround was attempted.

The full issue and all five comments were read; MYK9-1397 remains In Progress.
The inflight Linear check found the owned Stage 1 issue plus separate Stage 2,
orchestration and pagination work; the README receipt avoids their paths.
Historical failures above remain historical failures. The broader app run from
2026-10-25 remains incomplete; it was not rerun here because this retry changes
only the proof receipt and adds or changes no tests. The required narrow cloud
suite and shuffled app file completed without hangs.

This receipt supports independent Claude review of the tooling PR, per the owner's
request, while the JSR-dependent acceptance criterion remains blocked. It does
not claim all Stage 1 acceptance criteria passed, CI green, independent review,
merge approval or deployment. Formatting, final whitespace and publication-scan
receipts are recorded with the final commit on MYK9-1397 and in the PR body.

Final receipt checks: `pnpm format:check:changed` **EXIT=0**;
`git diff --check` **EXIT=0**; existing `scanForPublication` over the staged
publication directory with `env: process.env` **EXIT=0**, `{ "ok": true }`.
The initial `ratchet` run with network permission passed (**EXIT=0**). A redundant
final ratchet invocation without that permission failed before analysis
(**EXIT=1**, `tsx` IPC socket `listen EPERM`); the same
`pnpm qa:code-quality-ratchet` with network permission passed again
(**EXIT=0**, `.logs/ratchet-final-network.log`). No source change was needed.
Shell permission must also permit tools' IPC sockets; a missing permission is
never a source-code verdict. All these receipts precede publication; raw logs
are not uploaded.

##### Claude review remediation and proof rerun, 2026-10-26

Claude reported ten findings on `c96ce0214a4c21be40adef2c7e516a0fd7da1ae3`.
This rerun uses the same published configuration/instance identified in the
preceding receipt and the same isolated `codex/myk9-1397-cloud-proof` worktree.
It is a review-fix rerun, not another fresh-provider launch. Final commit identity
and publication links are recorded on MYK9-1397 and PR #3273.

The narrower design leaves **all XDG roots untouched**. Astro telemetry is
disabled instead of moving config (including gh/git logins). Only Corepack, pnpm,
Deno or tools directories that fail an actual write probe get a writable fallback;
writable defaults and explicit paths keep existing caches visible. Setup and
run.sh source the same tools discovery helper. An explicit MYK9_CLOUD_HOME skips
Git discovery; the default uses --git-common-dir without requiring --path-format.
No credentials or local .env were copied; no tool pins or edge source changed.

The global Turbo pass-through list is removed. Build/typecheck/lint/test/dev
allow only Corepack/pnpm location, Node heap and Astro telemetry options. These
explicit options are honored in those tasks for local/CI callers too; no XDG
roots, auth config or credentials are added. The real Turbo regression now runs
through run.sh, with a 10-second child-process bound and explicit 20-second test
limit. Its contract discovers exports in both shell sources and rejects missing
task allowances. Direct-cloud-only discovery variables are explicitly excluded.
The runbook is now the only dated proof ledger; README contains instructions.

Before implementation, the updated wrapper regression file failed **EXIT=1**:
4 failures / 5 passes (9 tests), demonstrating hidden config/cache defaults,
read-only overrides, explicit-cloud-home Git discovery and wrapper-to-Turbo
failures. No module-scope mutable state was added. The complete touched cloud
suite subsequently passed shuffled; the broader app run was attempted once as
required and stopped under the no-progress rule below, not retried in a loop.

Every command below has prefix `MYK9_CLOUD=1 bash scripts/cloud/run.sh` and shell
network permission enabled (`with_additional_permissions`,
`additional_permissions.network.enabled: true`). Output and immediately captured
real exits are in this worktree's `.logs/review-<name>.log` / `.exit`. Setup
finished sequentially before proof checks. Versions remain x86_64; Node 24.19.0,
pnpm 9.15.9, git 2.52.0, gh 2.89.0, Deno 2.1.4, ShellCheck 0.10.0, jq 1.7;
Turbo 2.11.8 and Vitest 5.0.0.

| Log suffix       | Command after wrapper                                                                                                                                       | Actual result                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inflight-final` | `pnpm qa:inflight` with all eight affected paths including the shared helper                                                                                | `EXIT=0`, owned PR excluded, no competing path overlap (earlier scoped checks also exited 0).                                                                               |
| `setup`          | `bash scripts/cloud/setup.sh`                                                                                                                               | `EXIT=0`, 12/12 package builds, fresh dist, embedded preflight ready.                                                                                                       |
| `preflight`      | `pnpm cloud:preflight --role=implementer --json`                                                                                                            | `EXIT=0`, `missing: []`.                                                                                                                                                    |
| `typecheck`      | `pnpm typecheck`                                                                                                                                            | `EXIT=0`, strict Turbo 26/26 tasks. Existing scripts/cloud 2 and E2E 7 ratcheted diagnostics, no new diagnostics; Astro config write avoided without relocating XDG config. |
| `lint`           | `pnpm lint`                                                                                                                                                 | `EXIT=0`, 14/14 tasks, 0 errors and 43 warnings.                                                                                                                            |
| `cloud-contract` | `pnpm exec vitest run --project=root scripts/cloud --sequence.shuffle`                                                                                      | `EXIT=0`, 8 files / 140 tests, seed `1793037283501`. Earlier green runs: seeds `1793037089781`, `1793037214816`, also 140/140.                                              |
| `scanner-tests`  | `bash -c 'cd apps/myk9show && pnpm vitest run scripts/verify-artifact-secrets.test.ts --sequence.shuffle'`                                                  | `EXIT=0`, 6/6 tests, seed `1793037213924`.                                                                                                                                  |
| `skills`         | `bash -c 'cd apps/myk9show && pnpm vitest run src/test/ci/skillTrees.test.ts --sequence.shuffle'`                                                           | `EXIT=0`, 19/19 tests, seed `1793037215885`.                                                                                                                                |
| `deno-combined`  | `deno check --node-modules-dir=none --no-lock supabase/functions/push-trigger-class-status/index.ts supabase/functions/push-trigger-run-proximity/index.ts` | **BLOCKER**, `EXIT=1`: jsr.io manifest denied, unsuccessful proxy tunnel before type validation.                                                                            |
| `deno-proximity` | `deno check --node-modules-dir=none --no-lock supabase/functions/push-trigger-run-proximity/index.ts`                                                       | **BLOCKER**, `EXIT=1`: same JSR denial. Known MYK9-1400 errors not reached.                                                                                                 |
| `app-full`       | `bash -c 'cd apps/myk9show && pnpm vitest run --sequence.shuffle'` (supervised equivalent cwd/argv)                                                         | **BLOCKER: incomplete**, `EXIT=130`; seed `1793037341840`, no test counts/verdict. Owned runner interrupted after >30 seconds without output progress after its banner.     |
| `shellcheck`     | `shellcheck scripts/cloud/run.sh scripts/cloud/setup.sh scripts/cloud/environment.sh`                                                                       | `EXIT=0`.                                                                                                                                                                   |
| `ratchet`        | `pnpm qa:code-quality-ratchet`                                                                                                                              | `EXIT=0`, includes staged new helper, no metric regression.                                                                                                                 |

An intermediate `pnpm format:check:changed` correctly failed **EXIT=123** on the
moved runbook table. The runbook was formatted with Prettier; final formatting,
whitespace and publication scanner receipts accompany the final issue/PR update.
Raw logs are not published. JSR access and the incomplete broad app run remain
explicit limitations for independent Claude re-review; no new clean review gate,
merge, deployment or completed Stage 1 acceptance is claimed. MYK9-1397 remains
In Progress until merged and accepted.

###### Post-push confirmation of the reviewed-code candidate

After pushing `cb5fbe8f4514562b5fa475597e28734cb7f1e6b9`, setup ran again
sequentially through run.sh (**EXIT=0**, `.logs/postpush-setup.log`). Then the
same wrapper-prefixed proof commands above were rerun on that exact clean head:

| Log                       | Result                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postpush-preflight`      | **EXIT=0**, JSON implementer `missing: []`.                                                                                                                                                                                                       |
| `postpush-typecheck`      | **EXIT=0**, strict normal Turbo, 26/26 cached tasks; the earlier uncached review-fix typecheck passed 26/26 with 11 cached.                                                                                                                       |
| `postpush-lint`           | **EXIT=0**, 14/14 cached tasks, 0 errors / 43 warnings replayed.                                                                                                                                                                                  |
| `postpush-cloud`          | **EXIT=0**, 8 files / 140 tests, seed `1793037639243`.                                                                                                                                                                                            |
| `postpush-scanner`        | **EXIT=0**, 6/6 tests, seed `1793037640085`.                                                                                                                                                                                                      |
| `postpush-deno-combined`  | **BLOCKER**, **EXIT=1**, same JSR manifest tunnel denial before type validation.                                                                                                                                                                  |
| `postpush-deno-proximity` | **BLOCKER**, **EXIT=1**, same JSR denial. MYK9-1400 errors still not reached.                                                                                                                                                                     |
| `postpush-quality`        | **EXIT=0**, combined `shellcheck scripts/cloud/run.sh scripts/cloud/setup.sh scripts/cloud/environment.sh && pnpm qa:code-quality-ratchet && pnpm format:check:changed && git diff --check`; each check had also passed separately before commit. |

The broad app runner was not retried after its documented no-progress interruption.
The follow-up receipt commit changes documentation only; executable code remains
identical to the pushed candidate checked above. Final docs formatting, whitespace
and existing publication scanner all pass before publication. The owner still
owes independent Claude re-review on the final head; no clean gate is inferred
from these implementer checks.

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

- **Historical Codex blocker, resolved by wrapper proof 2026-10-26 — install permissions and environment persistence:** the requested setup cannot write `/usr/local/bin`; the install script instead prepared repo-local tools and caches, but its `PATH`, XDG/Corepack settings and heap flag did not persist into the task shell. The raw task commands failed on the pnpm store path and missing Deno/ShellCheck. Explicitly restoring prepared settings lets setup/preflight pass, without resolving fresh-shell configuration or the install destination permission.
- **Historical Codex blocker, resolved by strict typecheck 2026-10-26 — workspace typecheck:** even with prepared tools and a 6144 MB heap, Astro tries to create `/home/agent/.config/astro` and exits 1 on permissions. The workspace typecheck did not pass.
- **Codex cloud BLOCKER — Deno dependency network access:** `jsr.io` is absent from the supplied allowlist; the JSR functions package manifest request fails with an unsuccessful proxy tunnel. Both the combined check and the separate run-proximity check exit 1 before reaching the known MYK9-1400 diagnostics.
- **Historical Codex blocker, resolved with owner-approved clean primary switch 2026-10-26 — inflight guard:** the supplied primary checkout is on branch `work`; `qa:inflight` exits 1. The proof branch uses a linked worktree from freshly fetched `origin/main`.
- `deno check` reports pre-existing type errors in `push-trigger-class-status` and `push-trigger-announcement`: untyped PostgREST embeds infer arrays where a many-to-one embed returns an object at runtime. `push-trigger-run-proximity` checks clean. Filed separately, not fixed in Stage 1.
- The base64 spelling of a secret is not scanned (the shared scanner matches verbatim and JSON-escaped forms).
