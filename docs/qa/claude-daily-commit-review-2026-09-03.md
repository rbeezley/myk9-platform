# Claude daily commit review — 2026-09-03

> **Status:** Reference

Failover run for the `daily-commit-review` stream. `source: claude`, `audit: commit-review`.

## Window

|                          |                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Boundary row at start    | `73569e478` / 2026-09-03T10:16:29Z / `codex-daily-commit-review`                                                 |
| Formal window            | `73569e478`..`d5a495862` — **1 commit, docs-only** (the boundary stamp itself)                                   |
| Window actually reviewed | `42753661e`..`73569e478` — **37 commits, 515 files**                                                             |
| Baseline SHA             | `73569e478`                                                                                                      |
| Stamped to               | `d5a495862`                                                                                                      |
| Coverage gap             | **None.** The 2026-09-02 Claude run ended at `42753661e`; the Codex stamp started there exclusively. Contiguous. |

### Why the window was widened

The task brief states the Codex daily stream is paused for token budget and instructs this run to assume Codex has not run. The committed boundary row says otherwise — `codex-daily-commit-review` stamped 37 commits at 10:16 UTC today. Taking the cursor at face value would have made this run vacuous: one docs-only commit.

That Codex stamp changed only `docs/qa/audit-boundary.md` and touched neither `findings.md` nor any Linear issue — a zero-finding result over 37 commits including six new migrations, five edge-function changes and 185 deleted source files. That is the exact shape of the standing `codex review` trap (it exits 0 when a usage-limit abort means it reviewed nothing), and it is the shape the brief predicts. The boundary file's own contract says under-stamping costs only a re-review while over-stamping deletes coverage silently, so the cheap direction was to re-review.

Both traps in this stream's memory were checked first: the working tree held no uncommitted `docs/qa/` edits, and `main` CI was read rather than assumed.

The three findings below all sit inside the range Codex marked reviewed, so the widening was not wasted.

## Counts

|                              |                                                             |
| ---------------------------- | ----------------------------------------------------------- |
| New                          | 4 (1×P1, 2×P2, 1×P3)                                        |
| Unchanged                    | 0                                                           |
| Resolved                     | 0                                                           |
| Duplicate                    | 0                                                           |
| Rejected                     | 0                                                           |
| Blocked                      | 0                                                           |
| Fixes found in later commits | 0                                                           |
| Linear issues filed          | 5 (MYK9-354, MYK9-355 parent, MYK9-356, MYK9-357, MYK9-358) |
| Existing references used     | MYK9-351, MYK9-330, MYK9-118, MYK9-289, MYK9-323            |
| Harness / environment items  | 2 (reported here, not filed)                                |

No finding reached its second consecutive run, so nothing was promoted.

## P1

### `NCR-2026-09-03-01` — MYK9-354 — `replace_judge_qualifications` self-service arm

`59e0668c8` (#1980) added a `SECURITY DEFINER` RPC whose guard admits
`public.get_my_person_id() = p_person_id`. No RLS policy on `judge_qualifications` has ever
admitted the caller's own person: INSERT and UPDATE are `secretary OR site_admin`, DELETE is
`site_admin` alone. Because the function is definer-run, RLS is not a backstop, so any
authenticated user can insert and delete their own judge credentials — `judge_number`,
`organization`, `qualification_level`, `is_active` — and `getJudgesWithQualifications()` gates the
secretary's assignment picker on exactly the presence of such a row.

Verified against the live database: the deployed function carries the arm and `prosecdef` is true;
the four live policies are as stated. Filed P1 rather than P0 because reaching the harmful end
state needs a secretary to then assign the forged judge — it is an authorization and
credential-integrity regression, not a read of data the caller could not already see.

Full record, reproduction and acceptance criteria in MYK9-354.

## P2

### `NCR-2026-09-03-02` — MYK9-356 — client/server divergence on `entry_status='absent'`

`debf07450` (#1971) refactored `EXCLUDED_ENTRY_STATUSES` from an explicit literal into
`[...NON_RUNNING_ENTRY_STATUSES, 'moved', 'not_accepted']`, silently folding `'absent'` into the
client's expected-entry exclusions. The deployed `refresh_class_scoring_state` excludes exactly
`scratched, withdrawn, moved, not_accepted` — confirmed by `pg_get_functiondef` — and `'absent'` is
a permitted `entry_status` under `entries_entry_status_check`, so this is not the dead-branch case
the same change used to justify dropping `'cancelled'`.

The module's own doc comment states the server rule and now contradicts the code six lines below
it. `atShowClassCompletion.ts` can therefore report a class complete while the server holds it
incomplete and skips `recalculate_class_placements` — the MYK9-118 shape this file exists to
prevent. The test suite pins `'absent'` only against `isNonRunningEntry`, never against
`isExpectedEntry`, so the change was unpinned in both directions.

### `NCR-2026-09-03-03` — MYK9-357 — `validate-passcode` fails open on an unresolved client IP

The same PR correctly stopped trusting caller-controlled `x-forwarded-for`, but replaced the old
`'unknown'` shared bucket with `null`, and `null` now short-circuits the gate to
`{ kind: 'allowed' }`. `record_login_attempt` is skipped too, so those attempts leave no audit row.
The sibling `unavailable()` path in the same file returns 503 on limiter failure, and #1988 —
merged the same day — is titled "fail closed after cached settings refresh errors"; the two
failure modes in one module now point in opposite directions.

Deliberate and pinned by a test, so filed for explicit acceptance rather than as an unnoticed bug.
Reachability today is low: Supabase Edge sits behind Cloudflare, which sets `cf-connecting-ip`.
That makes it a latent fail-open resting on an infrastructure property nothing in this repo
asserts.

## P3

### `NCR-2026-09-03-04` — MYK9-358 — a "fix" migration that changes nothing

`20260902180000_fix_judge_qualification_authorization.sql` is byte-identical to
`20260902170000_replace_judge_qualifications.sql` once each file's two-line header is stripped, and
both shipped in the same commit. Its header claims to align the function with the unified RBAC role
name and says the original "predates role consolidation" — neither is true; `'secretary'` is
already the unified name (migration `068`). A header describing a change the file does not make is
how an auditor stops looking, which is roughly how MYK9-354 survived review.

## Harness / environment — reported, not filed

These are not product defects and were kept out of Linear per the task contract.

### `main` CI red on `73569e478`, green on the docs-only commit that followed

Run 33712325739, job `Test myK9Show (coverage)`: 1 failed of 18 729.

```
FAIL src/test/ci/scheduledFailureNotifier.behaviour.test.ts
  > scheduled-failure notifier > collapses duplicates on the recovery path too
Error: Command failed: bash /tmp/notifier-2UaXOr/notify.sh
```

Run 33743620453 on `d5a495862` — a docs-only delta, no code change between the two — passed. So
the failure is non-deterministic.

**Not reproduced.** The action's `run:` block was extracted and executed 400 times against the same
stubbed `gh` and the same inputs the failing case uses (`OUTCOME=success`, two open issues): 0
failures. Nothing in the script is order- or time-dependent under that harness, so the likely cause
is resource pressure in the coverage job (the test shells out to `bash` plus several stub
subprocesses via `execFileSync`, which throws the same "Command failed" on a signal as on a
non-zero exit). **Inconclusive** — recorded so a second occurrence promotes it rather than
restarting the investigation.

### Nightly Health red again — recurrence of MYK9-289

Run 33746973235, jobs `Read-only QA health` and `Cross-browser route health (advisory)`:

```
✘ route-health-by-role.spec.ts:338 › Route health: exhibitor › exhibitor routes render clean
  Error: exhibitor/my-entries: app API requests did not settle before route transition
  (same for exhibitor/account, exhibitor/shows, exhibitor/notifications)
```

This is the same failure and the same spec as **MYK9-289**, which is marked Done. It has recurred
and needs a human to reopen it; this run did not, since it is environment class and the task
forbids filing such items as defects.

## Checks run

| Check                                                                               | Result                                                                                                                                              |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boundary + trap reconciliation (`git status docs/qa/`, `gh run list --branch main`) | clean tree; `main` CI red at `73569e478`, green at `d5a495862`                                                                                      |
| Six new migrations read in full                                                     | 1 P1 + 1 P3; MYK9-329 view rebuild verified correct                                                                                                 |
| MYK9-329 view diff against its prior emit (`20260828200000`)                        | exactly one arm removed, column list identical, `security_invoker=false` restated inline, grants restated                                           |
| Live ACL/policy verification (`pg_policy`, `pg_proc`, `pg_constraint`)              | confirmed the P1; confirmed `'absent'` is a permitted `entry_status`                                                                                |
| Live function-body verification (`pg_get_functiondef`)                              | confirmed the server rollup predicate for the P2                                                                                                    |
| Five changed edge functions reviewed                                                | 1 P2; `entry_fee`-as-dollars and `entries.armband` fixes confirmed against `information_schema`                                                     |
| New edge tests registered in **both** allowlists                                    | pass — `validate-passcode/*`, `send-registration-email/*`, `send-confirmation-email/*` present in `vitest.config.ts` and `tsconfig.edge-tests.json` |
| 185 deleted source modules swept for dangling references                            | none, including `PremiumGate`, `RoleBasedLanding`, `ClearCacheButton`                                                                               |
| `databaseManager.getDatabase` argument change in #1989                              | **not** a defect — the parameter is a log tag on a singleton, verified in `DatabaseManager.ts:270`                                                  |
| Applied migration `103` edited                                                      | comment-only, no SQL change — noted, not filed                                                                                                      |
| UX-facing PRs (#1973, #1974, #1978, #1979) against `docs/INTENT.md`                 | no intent violations found                                                                                                                          |
| Notifier shell reproduction, 400 runs                                               | 0 failures — inconclusive                                                                                                                           |

## Verification limits

- **The P1 could not be exercised end to end.** Evaluating the guard under a simulated
  non-privileged JWT returns `42501: permission denied for function is_site_admin` over the MCP
  connection. The finding rests on the deployed function body and the live policy set, both read
  directly, not on a live call.
- **Behavioural SQL tests have never run locally** — no container runtime on this Mac. Any SQL
  coverage proposed in the filed issues will first execute in CI.
- **No test suite was executed.** The review worktree has no `node_modules`, and bootstrapping it
  would not have added signal beyond the CI run already read for `73569e478`.
- **The notifier flake is unexplained**, not dismissed. 400 clean reproduction runs rule out the
  script's logic under an unloaded harness; they do not rule out the CI job's resource conditions.
- **Staging data is thin for the P2**: no `entry_status='absent'` row exists today, so the
  divergence is proven by code and constraint rather than by an observed disagreement.

## Related

- `docs/qa/audit-boundary.md` — the stream cursor, stamped by this run.
- `docs/operations/scheduled-audits-claude.md` — this task's prompt, source of truth.
