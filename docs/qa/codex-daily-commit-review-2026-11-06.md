# Codex daily commit review — 2026-11-06

## Window and baseline

source: codex. Complete source review: **28 total / 28 reviewed / 0 unreviewed**.
Window: (da35e948408a416e61c4a6404b16b07dd896f54b, 98f96a0fe0f2e76438c826dbf67fad07a9ef298b], 2026-11-05T04:04:10Z through 2026-11-06T03:49:40Z.
Frozen baseline: `98f96a0fe0f2e76438c826dbf67fad07a9ef298b`. No gap before the window and no 24-hour fallback.
Report path: `docs/qa/codex-daily-commit-review-2026-11-06.md`.
Prior unpublished November 4/5 evidence was already recovered; memory confirms publication a28e5891e and 7a8ba0f47. No stale cursor replayed.

## Review and verification

Reviewed related commits together: CI AST/grant guards, push guards and watcher; responsive panels/account/scoring/labels; show-day filters, readiness and withdrawal recovery; show-store and replica races; targeted-message pagination; legacy scoresheet deletion; dependency and workflow changes. Checked current callers and schemas, subsequent fixes, prior report, finding registry and relevant Linear evidence. The deleted scoring components have no remaining application callers.

Focused checks: app 66 files / 525 tests passed; replication 3 files / 12 tests passed; QA guards 3 files / 53 tests passed, one file / four ShellCheck tests skipped. Scoring phone-layout/timer tests passed (see retained log). Bootstrap and package builds passed on authorized retry; git diff --check passed. Initial sandbox fetch DNS failed, authorized fetch succeeded. Initial dependency installation stalled and was interrupted; retry completed. QA suite completed in 24 seconds before the attempted interruption; it was not a hang or a failed check.

No full-suite, fresh browser, live SQL, physical print, deployment or production-send proof claimed. ShellCheck availability limits that check. No application changes, fixes, new PRs, payments, shared fixtures or deployments performed.

## P0 / P1

No confirmed unresolved findings introduced in this window.

## P2 / Medium

- **MYK9-1692 — resolved ledger, existing Done preserved.** Product audience truncation; first seen Nov 5, last reconciliation Nov 6, no new recurrence. Secretary show/class/checked-in messaging, all viewports. #3638 replaces the capped read with stable keyset paging and fail-closed page handling. Current focused suite passes. Recorded red/green >1000-entry, lowered-cap, duplicate and failed-page tests plus deployed artifact, authorized small send/history and owner inbox receipt meet closure proof. Owner Richard; next action none for accepted scope. [Canonical evidence](https://linear.app/myk9-platform/issue/MYK9-1692#comment-623c2079-d566-4c39-85ca-e13e8e512a62).
- **MYK9-1690 — resolved ledger, existing Done preserved.** Check-in status/acceptance; first known Nov 3, last reconciliation Nov 6, no new recurrence. Secretary desk, 390/1280px. Recorded run 42040641950 passes same-mounted individual/bulk At Gate/In Ring/No Status, desktop cold offline reload/reconnect and cleanup; deployed doors/search proof covers navigation. High confidence in recorded acceptance, not a new browser run. Owner Richard; next proof none for accepted scope. [Canonical evidence](https://linear.app/myk9-platform/issue/MYK9-1690#comment-2cd54ee7-18d7-46c7-98ab-3c943b194fc7).

## P3 / Low

- **MYK9-1660 — resolved ledger, existing Done preserved.** Source reproducibility, first Nov 1, last reconciliation Nov 6, no recurrence. All eight push entry points pin 3.6.7. Nov 5 authorized deployment/artifact readback and prior 89 focused tests satisfy the historical contract; no new fanout rehearsal needed. Owner Richard; next proof none. [Canonical evidence](https://linear.app/myk9-platform/issue/MYK9-1660#comment-5e998d88-82f5-44b3-80df-c1d8536663da).

## Counts and persistence

New 0; unchanged 0; resolved 3; duplicate 0; rejected 0; blocked findings 0. New Linear issues 0; reconciled MYK9-1692, MYK9-1690, MYK9-1660 after archived-inclusive searches and full issues/relevant comments. Historical completed scope preserved. No filing limitation. No unresolved finding remains in this run's ledger; verification limits above remain explicit.

Fixes found in subsequent commits: #3638 repairs audience pagination; #3641/#3647/#3653 successively repair store field omission, slower-save overwrite and upload-ack races. #3652 supersedes #3645's 56px timer target with 80px. No repair implemented by this audit.

## Boundary

`daily-commit-review`: `98f96a0fe0f2e76438c826dbf67fad07a9ef298b`; window end `2026-11-06T03:49:40Z`; runner `codex-daily-commit-review`; run date `2026-11-06`. Publication/readback SHA is recorded outside this commit.

## Reviewed commit inventory

```text
7a8ba0f47a87bccb3d29d376dc2e47eeeddaff2a docs(qa): complete November 5 commit review and advance cursor
61392a3d8ff00d2b8b899ccda4ad2935877dc6e4 test(ci): guard crypto.subtle tests with the node vitest environment pragma (MYK9-1706) (#3628)
ddaa2966366266a94d39c29ebc24448835145473 test(ci): guard functions deploy commands against missing --project-ref (MYK9-1708) (#3627)
d6229883324a8594709dd51ca68b7e301d8adce8 ci: run shellcheck SC2318 over tracked shell scripts (MYK9-1709) (#3629)
afcc41adb79f5e1bb7d9a71d1631c9659760a697 watch-pr-checks: exit 6 when the PR conflicts with its base (#3631)
8c6349d7b02bd4172cf377dba81cfd63f9773232 test: block-body vitest hooks, name the lint guard (MYK9-1707) (#3630)
37eaaf109b53ed7cca6066fe37da8d3d9d17d655 docs(lessons): grant-never-narrows is guarded by the migrations-only grant contract (MYK9-1654)
9fd73933a0cc2d9a2c4403227a94526e49832b8e fix(slideover): full width below md, size from md; retire slideover-size-band (#3632)
8d16fbafb97133077b537fc7719174ed43aff660 docs(lessons): record the PR that retired slideover-size-band (MYK9-1712)
0daea1a0264002b4e7fddfca699ec0d1480861d2 pre-push: a push to main carries only in-scope docs commits (MYK9-1713) (#3633)
39fbaa59d88f5a64a46fd16575b54e32538cf290 test: guard PostgREST embed targets keep SELECT (MYK9-1711) (#3634)
2f8ee1f9b56c749edc3a93b116182e7fb0bca3ac pre-push: refuse a branch rewrite that reverts newer origin/main changes (#3637)
5c6d0be488490863631e6b72867bbf2b949bafcc fix(messages): page the targeted-message audience past the row cap (MYK9-1692) (#3638)
50117b8fa7d3333111f62be6b6f9ba55ed67b75b fix: check-in chip name, dog Withdraw policy gate, own-premium readiness (MYK9-1618, MYK9-1615, MYK9-1622) (#3635)
07f00635dd72c3de8a77d2cdb08aaa34a11bd339 test(ringside): read class counts from the card footer (#3640)
6437f7471c926966e5077b6b043bd3bf275ed28a fix(show-store): switch stays on after save; isolated browser proof for This show uses switches (MYK9-1622) (#3641)
c4a60def7237c42be0ff82deaaac30c0dbb63a52 ci: one cached Playwright install for every workflow (MYK9-1715) (#3642)
966a75ae44e862c8ce6671267747c6e475183e48 feat(show-desk): one Filter button with a checkbox per day (MYK9-1719) (#3646)
829503f7f1d31cf854ff111eb31ad539f37a415b refactor(scoring): delete the unreachable pre-ringside scoresheets (MYK9-1720) (#3648)
0bc1bbe41c90b30b227303259b5c8ec24727d668 fix(show-store): a slower save no longer undoes a switch flipped after it (MYK9-1721) (#3647)
39b7872f8fadeb5af6d377e99e0063becfae446c ci(deploy): drop the [SENSITIVE] allowlist now that both vars are Config (MYK9-1699) (#3649)
7d38414e3ce57bead260cf3cab563b667815c1f2 chore(deps): Node floor 22.23.4 and Astro 7.4.7 (MYK9-1542) (#3650)
136f6d9cad6297a667c65ebbdb287f67b978f30f fix(ui): make Off switch track visible in light and dark (MYK9-1716) (#3644)
28a96b7f40ea94a474c9066779c3cfc37725b171 fix(scoring-ui): 56px thumb-sized Start/Stop on every timed scoresheet (MYK9-1718) (#3645)
e141984f962987f8f6db76bdca3c12cc9059ae7d fix(account): phones get a section list with Back instead of hidden sideways tabs (MYK9-1717) (#3643)
efab32716f5e821cb799c9f08ae646411f640def fix(scoring-ui): 80px Start/Stop so the bigger target is noticeable (MYK9-1718) (#3652)
5ced81a9ce910553267389d2dd8d23c9118cb236 fix(replication): an upload ack no longer overwrites a local write that lands during it (MYK9-1721) (#3653)
98f96a0fe0f2e76438c826dbf67fad07a9ef298b fix(labels): result labels open on 1-1/3" x 4" like armband labels (MYK9-1723) (#3654)
```
