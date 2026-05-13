# myK9 Quality Score

The myK9 Quality Score is a weekly 0-100 trendline for platform health. It is not a claim that the app is "bug free"; it is a way to see whether trusted QA signal, role coverage, finding hygiene, and process discipline are improving over time.

Use this score for planning and trend discussions, not as a release gate by itself.

## Score Formula

| Area                | Weight | What It Measures                                                 |
| ------------------- | -----: | ---------------------------------------------------------------- |
| Trusted Test Signal |     30 | Active PR/Nightly specs pass without retries or repeated flakes. |
| Coverage Breadth    |     20 | Core roles and workflows have trusted active coverage.           |
| Findings Health     |     20 | Open findings are few, owned, current, and proof-closable.       |
| Static Quality      |     15 | Drift checks, type/lint/format checks, and suite map health.     |
| QA Process Health   |     15 | Nightly history, flake budget, repair queue movement.            |

Each area is scored from `0.0` to `1.0`, then multiplied by its weight.

```text
Quality Score =
  30 * trusted_test_signal
+ 20 * coverage_breadth
+ 20 * findings_health
+ 15 * static_quality
+ 15 * process_health
```

## Weekly Scoring Guide

### Trusted Test Signal

- `1.0`: PR smoke and active Nightly pass with `--retries=0`; no repeated flakes in the last 14 days.
- `0.8`: active Nightly passes, but one spec has a recent isolated failure.
- `0.6`: active Nightly has a known triaged failure with a finding and owner.
- `0.3`: active Nightly is failing with unclear cause or stale evidence.
- `0.0`: active Nightly is not runnable.

### Coverage Breadth

Score by trusted active coverage across these role/workflow groups:

| Group                         | Covered By Trusted Active QA? |
| ----------------------------- | ----------------------------- |
| Public browse/show details    | yes                           |
| Auth/sign-in smoke            | yes                           |
| Secretary dashboard/wizard    | yes                           |
| Secretary existing-user entry | yes                           |
| Secretary entry management    | partial                       |
| Exhibitor registration        | no                            |
| Judge/scoring                 | no                            |
| Admin CRUD                    | no                            |
| myK9Q ringside                | conditional                   |

Use:

- `1.0`: most critical groups covered by active specs or a reliable route sweep.
- `0.7`: secretary/public paths covered, but exhibitor/judge/admin gaps remain.
- `0.4`: boot/auth covered, but golden paths mostly manual.
- `0.0`: no trusted active coverage.

### Findings Health

Start at `1.0`, then subtract:

- `0.35` for each open blocker.
- `0.20` for each open high finding.
- `0.08` for each stale medium finding older than 14 days.
- `0.04` for each stale low finding older than 30 days.
- `0.10` if any fixed finding lacks a proof command or manual replay result.

Do not score below `0.0`.

### Static Quality

- `1.0`: `pnpm qa:e2e-map:check` passes; relevant type/lint/format checks pass for the week's changes.
- `0.8`: drift check passes, but type/lint was not run for low-risk docs-only work.
- `0.5`: static checks have known unrelated failures documented.
- `0.0`: drift check fails or new specs are unclassified.

### QA Process Health

- `1.0`: `nightly-history.md` is current, repair queue changed intentionally, promotions/demotions follow proof rules.
- `0.8`: history is current, but repair queue did not move.
- `0.5`: Nightly ran, but history/findings were not updated promptly.
- `0.0`: no recent Nightly history or active suite ownership.

## Current Baseline

### 2026-05-12

| Area                | Score | Weight | Points |
| ------------------- | ----: | -----: | -----: |
| Trusted Test Signal |  1.00 |     30 |   30.0 |
| Coverage Breadth    |  0.55 |     20 |   11.0 |
| Findings Health     |  1.00 |     20 |   20.0 |
| Static Quality      |  1.00 |     15 |   15.0 |
| QA Process Health   |  0.85 |     15 |   12.8 |

**Quality Score:** `88.8 / 100`

Interpretation: the QA process foundation is strong and the active Nightly signal is trusted, but coverage breadth is still narrow. The score should improve by promoting exhibitor, judge/scoring, admin CRUD, and myK9Q ringside checks from candidate/manual status into trusted active coverage.

## Update Cadence

Update this score weekly after reviewing:

- `docs/qa/nightly-history.md`
- `docs/qa/findings.md`
- `docs/qa/e2e-suite-map.md`
- `OPEN-TODOS.md` repair queue movement
- The most recent PR smoke/Nightly proof commands

Automation can come later once there are enough nightly-history entries to compute trends honestly.
