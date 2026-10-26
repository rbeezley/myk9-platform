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

Setup and the wrapper source `environment.sh` to discover the same primary-checkout tools folder. Writable explicit tools paths are preserved; an unwritable tools path falls back to `.cloud-tools/bin`. Only unwritable Corepack, pnpm and Deno folders are redirected. Writable defaults and explicit paths stay in use, including prepared caches. To use a different shared writable location, set `MYK9_CLOUD_HOME` in the provider environment; for example `/workspace/.myk9-tools`. An explicit cloud home works outside a Git checkout without invoking Git; setup itself still requires a repository. Remove an old `MYK9_TOOLS_DIR=/usr/local/bin` override when selecting the writable default.

The wrapper leaves every XDG variable untouched, so existing gh/git config and Playwright browsers remain visible. The wrapper defaults `ASTRO_TELEMETRY_DISABLED=1` to prevent Astro from writing its config, and adds a 6144 MB Node heap unless `NODE_OPTIONS` already chooses a heap. It preserves existing TLS/CA flags. `turbo.json` explicitly passes the runtime settings to package commands in strict environment mode, using task-scoped pass-through for Corepack/pnpm locations, heap and Astro telemetry. The real wrapper-to-Turbo test checks this contract. No global XDG pass-through is added.

`run.sh` does not install or replace Node/pnpm, change tool pins, modify `HOME`, copy `.env` files or configure credentials. The provider must supply the required Node/pnpm versions; `setup.sh` continues to enforce the existing minimums and archive checksums. An image using Corepack can prepare its pnpm shim in the wrapper's writable tools directory before setup:

```bash
MYK9_CLOUD=1 bash scripts/cloud/run.sh bash -c 'corepack enable --install-directory "$MYK9_TOOLS_DIR" pnpm && bash scripts/cloud/setup.sh'
```

## Codex provider settings

- Use the wrapper command above for the install script and for task commands. Setting variables only inside the install script does not persist them into task shells.
- Allow `jsr.io` in addition to the existing package-manager and GitHub release hosts. The two push functions import `jsr:@supabase/functions-js/edge-runtime.d.ts`. Without this host, both Deno checks fail before type validation. Keep `LINEAR_API_KEY` scoped to `api.linear.app`.
- Publish the environment change and start a fresh task. An existing task does not prove that a new provider configuration works. A denied domain is a **BLOCKER** until the environment owner allows it and publishes the change.
- Keep a clean primary checkout on current `main`, preserving any existing branch, and do work in a linked feature worktree. The inflight guard stays enabled. Its separate Claude GraphQL limitation is tracked in MYK9-1415.

After the network change, rerun both commands and record their actual exits:

```bash
MYK9_CLOUD=1 bash scripts/cloud/run.sh deno check --node-modules-dir=none --no-lock supabase/functions/push-trigger-class-status/index.ts supabase/functions/push-trigger-run-proximity/index.ts
MYK9_CLOUD=1 bash scripts/cloud/run.sh deno check --node-modules-dir=none --no-lock supabase/functions/push-trigger-run-proximity/index.ts
```

MYK9-1400 tracks the three known class-status type errors. Record them separately if reached; an expected failure is still a failure. Do not change the pins or edge-function source to make this environment proof green.

## Verification

`run.test.ts` covers fresh shells, shared tools across linked worktrees, paths containing spaces, local-machine refusal, preserved TLS/heap options, argument/exit-code forwarding and a real wrapper-to-Turbo chain receiving the telemetry/heap and redirected runtime settings. Run it with the existing cloud suite:

```bash
MYK9_CLOUD=1 bash scripts/cloud/run.sh pnpm exec vitest run --project=root scripts/cloud --sequence.shuffle
MYK9_CLOUD=1 bash scripts/cloud/run.sh shellcheck scripts/cloud/run.sh
```

All dated proof results, including historical failures and current limitations, live only in [the workflow runbook](../../docs/operations/cloud-agent-workflow.md#codex-cloud). This README contains operating instructions, not a second proof ledger.

Shell tools require network permission for network operations and IPC: use
`with_additional_permissions` with `additional_permissions.network.enabled: true`.
Preserve inherited proxy and CA settings. Never infer a pass from a blocked or
skipped command. Run setup sequentially before typecheck or other proof checks.
