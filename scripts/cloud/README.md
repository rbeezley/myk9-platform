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
