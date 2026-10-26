# Cloud command environment

Use `run.sh` for **every cloud command**, including the install step. Each invocation restores the environment in its own process, so it works in fresh task shells without relying on an earlier script's `export` statements. It refuses non-Linux machines and requires `MYK9_CLOUD=1`, `CLAUDE_CODE_REMOTE=true` or `GITHUB_ACTIONS=true` before writing files.

```bash
# Provider install step, from the repository checkout:
MYK9_CLOUD=1 bash scripts/cloud/run.sh bash scripts/cloud/setup.sh

# Later task commands, each in its own shell:
MYK9_CLOUD=1 bash scripts/cloud/run.sh pnpm cloud:preflight --role=implementer --json
MYK9_CLOUD=1 bash scripts/cloud/run.sh pnpm typecheck
MYK9_CLOUD=1 bash scripts/cloud/run.sh pnpm lint
MYK9_CLOUD=1 bash scripts/cloud/run.sh bash -c 'cd apps/myk9show && pnpm vitest run scripts/verify-artifact-secrets.test.ts --sequence.shuffle'
```

Redirect each proof command to the active worktree's `.logs/<name>.log`, then immediately run `echo "EXIT=$?"`. A failed prerequisite or skipped check is a **BLOCKER**.

## Writable tools and caches

By default, the wrapper discovers the primary checkout through Git's common directory and uses its gitignored `.cloud-tools/` directory. Linked worktrees share these prepared tools. Dependencies, builds and `.logs/` remain in the active checkout. No hard-coded checkout path or privileged `/usr/local/bin` write is required.

The wrapper sets defaults for `MYK9_TOOLS_DIR`, `COREPACK_HOME`, the four XDG directories and `DENO_DIR`, then prepends the tools directory to `PATH`. Existing explicit settings take precedence. To use a different shared writable location, set `MYK9_CLOUD_HOME` in the provider environment; for example `/workspace/.myk9-tools`. Remove an old `MYK9_TOOLS_DIR=/usr/local/bin` override when selecting the writable default.

The wrapper defaults `ASTRO_TELEMETRY_DISABLED=1` and adds a 6144 MB Node heap unless `NODE_OPTIONS` already chooses a heap. It preserves existing TLS/CA flags. `turbo.json` explicitly passes the runtime settings to package commands in strict environment mode, including Astro's writable config directory.

`run.sh` does not install or replace Node/pnpm, change tool pins, modify `HOME`, copy `.env` files or configure credentials. The provider must supply the required Node/pnpm versions; `setup.sh` continues to enforce the existing minimums and archive checksums. An image using Corepack can prepare its pnpm shim in the wrapper's writable tools directory before setup:

```bash
MYK9_CLOUD=1 bash scripts/cloud/run.sh bash -c 'corepack enable --install-directory "$MYK9_TOOLS_DIR" pnpm && bash scripts/cloud/setup.sh'
```

## Codex provider settings

- Use the wrapper command above for the install script and for task commands. Setting variables only inside the install script does not persist them into task shells.
- Allow `jsr.io` in addition to the existing package-manager and GitHub release hosts. The two push functions import `jsr:@supabase/functions-js/edge-runtime.d.ts`. Without this host, both Deno checks fail before type validation. Keep `LINEAR_API_KEY` scoped to `api.linear.app`.
- Publish the environment change and start a fresh task. An existing task does not prove that a new provider configuration works. This session's environment tools are read-only, so adding the domain is an outstanding **BLOCKER** until the environment owner changes it.
- Keep a clean primary checkout on current `main`, preserving any existing branch, and do work in a linked feature worktree. The inflight guard stays enabled. Its separate Claude GraphQL limitation is tracked in MYK9-1415.

After the network change, rerun both commands and record their actual exits:

```bash
MYK9_CLOUD=1 bash scripts/cloud/run.sh deno check --node-modules-dir=none --no-lock supabase/functions/push-trigger-class-status/index.ts supabase/functions/push-trigger-run-proximity/index.ts
MYK9_CLOUD=1 bash scripts/cloud/run.sh deno check --node-modules-dir=none --no-lock supabase/functions/push-trigger-run-proximity/index.ts
```

MYK9-1400 tracks the three known class-status type errors. Record them separately if reached; an expected failure is still a failure. Do not change the pins or edge-function source to make this environment proof green.

## Verification

`run.test.ts` covers fresh shells, shared tools across linked worktrees, paths containing spaces, local-machine refusal, preserved TLS/heap options, argument/exit-code forwarding and a real Turbo child receiving the config/telemetry settings. Run it with the existing cloud suite:

```bash
MYK9_CLOUD=1 bash scripts/cloud/run.sh pnpm exec vitest run --project=root scripts/cloud --sequence.shuffle
MYK9_CLOUD=1 bash scripts/cloud/run.sh shellcheck scripts/cloud/run.sh
```

The original Codex Stage 1 proof is preserved in [the workflow runbook](../../docs/operations/cloud-agent-workflow.md#codex-cloud). This wrapper is its remediation; a fresh provider task with the updated network policy is still required for final proof.

### Remediation results, 2026-10-25

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

### Published-environment proof retry, 2026-10-26

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
