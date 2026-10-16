# Supabase native local dev (no Docker) — spike findings

> **Status:** Complete

Spike run 2026-10-15 on the dev Mac (macOS 27.0.1, Apple silicon) in worktree
`nostalgic-lovelace-30a976`. Question: can the Supabase CLI's Docker-free
"native" runtime run a full local stack per worktree, so agents can rebuild
the schema from `supabase/migrations/` and run the behavioral SQL tests before
pushing instead of only in CI?

## Answer

**Yes, it works end to end.** All 693 migrations apply from scratch, all 153
behavioral SQL test files pass (`BEHAVIORAL SQL TESTS PASSED (153 files)`),
and the class-absent installed-mutation proof goes red on every mutation and
green on the real functions — the same three steps as CI's `sql-tests` job.
Nothing touched the linked project.

| Step                                                                                     | Time |
| ---------------------------------------------------------------------------------------- | ---- |
| `supabase start --runtime native`, empty cache (incl. ~800 MB download) + 693 migrations | 39 s |
| Same, second project, warm cache                                                         | 33 s |
| `supabase db reset --no-seed` (all 693 migrations again)                                 | 22 s |
| `run-behavioral-sql-tests.sh` (153 files)                                                | 51 s |
| `stack destroy` (both stacks)                                                            | 2 s  |

So a cold rebuild-and-test loop is about two minutes, and a re-run after
`db reset` about 75 seconds.

## Availability

- Native mode is **released but experimental**: `supabase start --runtime native`,
  enabled by `[experimental] stack = true` in `config.toml` or
  `SUPABASE_EXPERIMENTAL_STACK=1`. Docs:
  [Docker and native runtimes](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes),
  [Running multiple local projects](https://supabase.com/docs/guides/local-development/running-multiple-local-projects).
- Supported on macOS 14+ Apple silicon and Linux glibc 2.35+; not Intel Macs or Windows.
- **Needs CLI ≥ 2.121.0.** Before that, native `pg_cron` jobs failed on macOS.
  The Mac has 2.117.0 (`/opt/homebrew/bin/supabase`); Homebrew stable was
  2.119.0 on 2026-10-15. The spike used the official v2.121.0 darwin-arm64
  release tarball (checksum verified) from the scratchpad, and did not
  upgrade the global install.
- The spike used the env var and a scratch `SUPABASE_HOME`, so neither
  `config.toml` nor `~/.supabase` changed.

## What broke, or differs from Docker

- **Extensions:** nothing broke. Installed: `pg_cron 1.6.4`, `pg_net 0.20.4`,
  `pg_stat_statements`, `pgcrypto`, `supabase_vault 0.3.1`, `uuid-ossp`,
  `vector 0.8.2`, on PostgreSQL 17.11 (matches `major_version = 17`).
- **pg_cron:** works. All 12 migration-scheduled jobs exist; a probe job and
  `ringside-containment-sampler` ran and succeeded. Jobs that read an edge
  function URL from Vault (`continuous-health-check` and friends) fail with a
  NOT NULL error on `net.http_request_queue.url`, because a fresh local Vault
  has no secrets. That is harmless, and it means a local stack can never call
  production. Native caveat: a job body cannot contain its own
  `BEGIN`/`COMMIT`; ours are `DO` blocks or plain statements, so none are affected.
- **Vault:** `vault.create_secret` and `vault.decrypted_secrets` round-trip.
- **Auth / REST:** `GET /auth/v1/health` returns 200. REST is up (401 for an
  unauthenticated `platform_settings` read, which is expected). Services are
  lazy by default, so they start on the first request.
- **`--exclude` names differ.** CI's Docker list
  (`edge-runtime,imgproxy,logflare,mailpit,postgres-meta,studio,supavisor,vector`)
  is rejected. Native takes capabilities: `rest, auth, realtime, storage,
functions, studio, mail, analytics, pooler`. The spike used
  `--exclude functions,studio,mail,analytics,pooler`.
- **Not tried:** edge functions (`functions serve`), Storage uploads, Realtime
  clients, and the financial SQL tests (`run-financial-sql-tests.sh`, which use
  their own throwaway cluster rather than the Supabase stack).
- **Disk:** about 800 MB of shared download cache (`$SUPABASE_HOME/cache/stack`,
  kept by `stack destroy`) plus about 120 MB per stack's data directory.
- A project's runtime is fixed when the stack is first created. Changing it
  means destroying the stack and recreating it.

## Two worktrees at once

- The ports in `config.toml` (`db.port = 54322`, `api.port = 54321`) count as
  exact requests. A second project fails fast with a clear message naming the
  project that holds the port:
  `Public port 54322 … is in use by the stack of project …/nostalgic-lovelace-30a976`.
  It does not corrupt the first stack.
- With `SUPABASE_DB_PORT=55322 SUPABASE_API_PORT=55321` the second stack
  starts beside the first (33 s), with its own data and all 693 migrations. A
  stack's identity is its project root plus git branch, so each worktree
  already gets its own stack.
- Deleting the fixed `port` keys switches the CLI to dynamic, stable
  per-project ports (20000–32767). That would affect everyone's
  `config.toml`, so the spike left them alone.
- **Blocker for running two at once:** `scripts/qa/run-behavioral-sql-tests.sh`
  (and `class-absent-mutation.ts`) accept only the exact URL
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. A second
  worktree's stack on another port is refused. The guard would need to accept
  any `127.0.0.1` / `localhost` port, which still blocks shared hosts.

## Proposed adoption (not done in this spike)

1. Pin CLI ≥ 2.121.0 for local use (Homebrew upgrade once stable reaches it,
   or a repo-local download script).
2. Add `pnpm qa:sql-local`: start a native stack for the worktree with the
   native exclude list, `db reset --no-seed`, run the behavioral tests and the
   mutation proof, then stop. Per-worktree port via `SUPABASE_DB_PORT`.
3. Relax the loopback guard to any loopback port. Keep the refusal of
   non-loopback hosts and add a known-answer test for it.
4. Mention it in CLAUDE.md's "No Docker here" LESSON and the `/commit`
   high-risk ladder for migration changes.

## Adopted: `pnpm qa:sql-local` (2026-10-15)

Step 2 above shipped as an **optional** pre-push check for migration changes;
CI's `sql-tests` job stays the authoritative gate.
`scripts/qa/run-sql-local.sh`:

- refuses a CLI older than 2.121.0 with an upgrade message (`SUPABASE_BIN`
  points it at a CLI that is not on `PATH`, such as a downloaded release);
- owns a dedicated stack named `qa-sql-local`, never the worktree's default
  stack, so a development stack you started yourself keeps its data. It
  destroys any leftover `qa-sql-local` stack first, then starts it fresh
  (`SUPABASE_EXPERIMENTAL_STACK=1`, `--runtime native`, the native exclude
  list); a new stack applies every migration on start, and with no
  `seed.sql` that equals CI's `start` + `db reset --no-seed`. `db reset` has no
  `--stack` flag, so it is not used (Codex review of #3055 caught the earlier
  version resetting and destroying the default stack);
- runs CI's steps by calling the same scripts: `run-behavioral-sql-tests.sh`,
  `class-absent-mutation.ts`, `run-financial-sql-tests.sh`;
- runs `stack destroy --stack qa-sql-local --yes` on success, failure or Ctrl-C, and fails the run
  if that teardown fails (a leaked stack holds its ports);
- never passes `--linked`, `db push` or a remote URL.
  `scripts/qa/run-sql-local.test.ts` pins the version gate, the teardown, the
  named stack and the absence of linked-project flags against a stub CLI.

Evidence on the dev Mac with the v2.121.0 release: green on this branch
(693 migrations, 153 behavioral files, mutation proof, financial assertions)
in 73 s with a warm download cache; red when a scratch migration dropped
`trg_enforce_show_publish_gate` (`show_publish_gate_trigger_test.sql` failed,
stack destroyed, exit 3); and with the worktree's own default stack already
running, the run stopped at `start` ("Public port 54322 … is in use") and
the default stack survived.

Not done, deliberately: step 4.

## Adopted: two worktrees at once (2026-10-15)

Step 3 above. The behavioral runner and `class-absent-mutation.ts` now accept
`postgresql://postgres:postgres@{127.0.0.1|localhost}:<port>/postgres` for any
port, still anchored with no query string, so a non-loopback host and a libpq
`?host=` / `?hostaddr=` override are both refused (known-answer cases in
`run-behavioral-sql-tests.test.ts`). `run-sql-local.sh` gives each worktree its
own port pair: `SUPABASE_DB_PORT` / `SUPABASE_API_PORT` when set, otherwise a
slot in 40000-41999 derived from the worktree path and stepped past any port
already listening, after any leftover `qa-sql-local` stack is destroyed.
config.toml's 54321/54322 stay as they are for plain `supabase start`, so a
worktree's own default stack no longer blocks the run either.

Evidence on the dev Mac with the v2.121.0 release: with this worktree's own
default stack already running on 54322, two worktrees ran `run-sql-local.sh`
at the same moment (db ports 41211 and 41145). Both went green (all
migrations, 153 behavioral files, the four-signature mutation proof, financial
assertions) in 27 s, both `qa-sql-local` stacks were destroyed, and the default
stack was still answering on 54322 afterwards.

## Testing phase

This spike's evidence is the commands above, run against a native stack. Any
adoption PR must:

- run `pnpm qa:sql-local` red on a deliberately broken migration (for example
  a `GRANT` narrowing that LESSONS `grant-never-narrows` describes) and green
  on `main`;
- run two worktrees' `qa:sql-local` at once on different ports;
- show the relaxed URL guard refusing a non-loopback host in
  `run-behavioral-sql-tests.test.ts`.
