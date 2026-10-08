# Show-day walk, 2026-10-05 (Claude) — BLOCKED: show-day fixture stale

- Run token: 2026-10-05 (scheduled run)
- Prompt version (`origin/main`): `fdc776704486980cd192d96c0916c06620c56ea7`
- Worktree base SHA: `fdc776704486980cd192d96c0916c06620c56ea7`
- Prior show-day walk baseline: `2026-09-28-show-day-walk-codex.md`
- Surface: none walked
- WALK ENTRY: none created
- Teardown: not applicable, no writes made

## Result

The walk is **blocked: show-day fixture stale**. SQL access works (the Supabase MCP query ran). `Heartland Scent Work Week` (`dededede-0000-0000-0000-000000000014`) has seven trials, dated 2026-09-25 through 2026-10-01. The trial-timezone date today is 2026-10-05, so no trial matches today. The fixture's last trial date is **2026-10-01**, and nobody has reseeded for the seven-day window.

Beyond the blocker, none of the seven trials has a live class: the `classes` join returned no rows, so every trial reports 0 classes and 0 entries. That is stronger than "dates lapsed", and the next reseed should be checked for it.

Per the prompt, nothing else was walked. No show was created or re-dated, and no UI or SQL writes were made.

## Findings

None filed. A stale fixture is a harness precondition, not an app finding.

## Canary candidates

None (no walk ran).

## Prompt corrections

None found. The precondition query behaved as written.
