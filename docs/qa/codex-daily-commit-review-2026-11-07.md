# Codex daily commit review — 2026-11-07

## Window and baseline

source: codex. Source review: **22 total / 22 reviewed / 0 unreviewed**.
Window: (98f96a0fe0f2e76438c826dbf67fad07a9ef298b, 85ad5fc2b84d26ecf376b416af9773ac05cc4641], 2026-11-06T03:49:40Z through 2026-11-07T02:59:54Z.
Frozen baseline: `85ad5fc2b84d26ecf376b416af9773ac05cc4641`. No preceding gap or fallback.
Report path: `docs/qa/codex-daily-commit-review-2026-11-07.md`.
Prior memory confirms older publication failures recovered; no pending cursor replayed.

## Review and verification

Related commits reviewed together: scoring read-back and ringside cards; queued-write supersession; volunteer recovery; label previews; janitor parent disposition; push worker readiness; Show Desk filters, focus and navigation; phone chrome; judge supplies schema, service and report consolidation; entry search and identity; rail simplification; replica remount and drag refresh; admin delete override, audit and SQL guards. Coverage ledger is the complete inventory below.

Focused checks: app 67 files / 948 tests; replication 2 files / 13 tests; scoring 1 file / 8 tests; ringside 1 file / 8 tests; QA 2 files / 61 tests, all passed. Bootstrap/package builds and diff check passed. Initial sandbox fetch failed DNS, retry succeeded. Initial bootstrap stalled and was interrupted (130); authorized retry passed. Initial detached test launch yielded no result; foreground supervised run supplied the reported results. No test failure inferred from that launch.

No fresh browser, physical Android, live SQL, full suite, payment, deployment, shared fixture or production-send verification performed. SQL behavioral tests were source-reviewed, not executed locally. No application code changed, fixes implemented or PRs opened.

## P0 / P1

No confirmed new finding.

## P2 / Medium

- **NCR-2026-11-07-01 / MYK9-1735 — new.** Product error recovery / UX. Secretary, `/shows/:showId?tool=judge-supplies`, all viewports. First/last seen 2026-11-07 UTC; run count 1; baseline as above. `ShowJudgeSuppliesTool.tsx:62,99` uses only supplies data truthiness for Loading, never its error state. A rejected first supplies read with judges loaded leaves Loading after retries finish. Service throws and query exposes error; complete control-flow inspection confirms the branch. Expected explicit error and retry. High confidence; no data loss asserted. Claude implementation unclaimed. Acceptance and closure: initial rejection, successful retry, cached background failure regressions plus 390px/desktop browser rejection-and-recovery proof. Archived-inclusive searches and full MYK9-1728/comments distinguish this from its completed migration scope. [Full execution contract](https://linear.app/myk9-platform/issue/MYK9-1735).
- **MYK9-1734 — unchanged acceptance gate.** Source Medium, canonical P2 verification. Gate steward run-order drag, actual Android. First owner report Nov 6 local; last reconciliation Nov 7 UTC; no new device recurrence claimed. #3675 re-reads local entries after persistence; focused helper tests pass. Prior touch-action hypothesis was rejected by owner evidence; do not revive #3673. Owner Richard; closure still requires actual Android stable drop beyond grace period, saved order after reload and outside-grip scrolling on deployed #3675 or newer. [Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1734), reconciliation comment f5ad3f61-a1b3-48f1-a429-61a9517c65db.

## P3 / Low

No confirmed new finding.

## Counts and persistence

New 1; unchanged 1; resolved 0; duplicate 0; rejected 0; blocked findings 0. Created MYK9-1735; reconciled MYK9-1734. No filing limitation. Previous run's resolved ledger remains historical, with no new closure claimed.
Fixes found in subsequent commits: #3657 extends #3655 read-back identity sizing; #3664 refines #3663 trial menu; #3667 regenerates the #3665 schema relationships. MYK9-1728's recorded deployment and owner acceptance preserve its Done scope; the temporary old-table deployment mismatch is historical, not an unresolved filing.

## Boundary

`daily-commit-review`: `85ad5fc2b84d26ecf376b416af9773ac05cc4641`; window end `2026-11-07T02:59:54Z`; runner `codex-daily-commit-review`; run date `2026-11-07`. Publication/readback SHA recorded outside this commit.

## Reviewed commit inventory

```text
3079d83e51acf915ff00db3f59d4cd1fc6ae4d80 docs(qa): record November 6 commit review and cursor
07596b26ec06ba7fd050e3138e2a4329c6c29b54 fix(scoring-ui): centered Faults row and a read-back the judge can read at a distance (MYK9-1724) (#3655)
c5ee0b65ed6a7c416b403242183ec4e60fff2a79 fix(replication): an acknowledged write supersedes older queued writes of the same columns (MYK9-1721) (#3656)
9dae554368f4d409a0c3e67ac664dad2ef07c601 fix(scoring-ui): large armband and dog name on the score read-back (MYK9-1724) (#3657)
17531c4db2a9f78576995eefb6c0250cdd1b1bce fix(volunteers): the empty volunteer picker says why and points to Add Volunteer (MYK9-1726) (#3658)
ce923d54e3c1dfa17ccdc9cd6cd4f053df08a53e fix(labels): label previews look like paper in dark mode (MYK9-1722) (#3661)
117e198a2c7a091cb3808ee17bf68e00dd14563e fix(qa): issue janitor waits on open child issues instead of returning a parent to Todo (MYK9-1434) (#3659)
ce61f194cf13bda1b1da2ea20d03e520d3572701 fix(push): push switch re-checks when the service worker becomes ready (MYK9-1698) (#3660)
6ee140a9cb67f57967aa40a29ba7d5ba3a79d80c fix(show-desk): UI polish batch from the owner's walk and the Show Desk audit (MYK9-1727) (#3663)
83bfac26899d1ecaad216744fc28ad41f5f55d25 docs(janitor): live prompt keeps janitor: marker lines and skips already-posted comments (MYK9-1434)
b169de79d7a334c2d99a3f4368925a2db845cd2d fix(show-desk): trial menu tidy + Trial report; Actions button 44px (MYK9-1727) (#3664)
98d908b05062cb6c1e449ab5acd37b25ba08f1ed fix(show-page): phone show chrome — labelled Actions, every tab visible, shorter header (MYK9-1729) (#3666)
a14b50f4d6839d2120ce9bf280fcdb6b624296f4 feat(judge-supplies): store judge supplies once per show (MYK9-1728) (#3665)
3ef6544b444665df333f78553bd5a86daab31497 chore(types): regenerate Supabase types after show_judge_supplies push (MYK9-1728) (#3667)
bbcc071f22b9102caa8f8a002721749efac737bd docs(guide): trial menu and Judge supplies match the app (MYK9-1730) (#3668)
d1c4fd08ffb0d75bfe5714a38daa002b44a1de5f fix(rail): My Entries always shows for staff who are also exhibitors (MYK9-1525) (#3669)
0ce23139f020220540bb47eefe92a984acface26 fix(ringside): class list re-reads the local replica on mount (MYK9-1731) (#3670)
562fa7ea637856567993602db80503d04a0e27f3 fix(entries): Handlers step shows each row's class on a phone (MYK9-1732) (#3671)
140f8492c42c5d05ffdf714ff2da6ee6a8c0b491 fix(entries): Entry Forms cards show armbands; search is a full field on phones (MYK9-1733) (#3672)
45bb4ced1d91e589cd529c563486219fca9904cb fix(ringside): section letter sits under the armband number, no corner tab (#3674)
8f9ec2b50cc49e74cffd4f435516f91f02a46123 fix(ringside): a dropped card no longer flips back for a moment (MYK9-1734) (#3675)
85ad5fc2b84d26ecf376b416af9773ac05cc4641 feat(delete): site admins can override a blocked show, trial or class delete (MYK9-1596) (#3676)
```
