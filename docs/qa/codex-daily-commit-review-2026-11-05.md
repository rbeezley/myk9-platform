# Codex daily commit review — 2026-11-05

## Scope and result

source: codex. Reviewed baseline `da35e948408a416e61c4a6404b16b07dd896f54b`. Window: exclusive `5d62483f2846807707df13235994f326fbebca87` through inclusive `da35e948408a416e61c4a6404b16b07dd896f54b`; 2026-11-04T15:18:10Z–2026-11-05T04:04:10Z. No preceding coverage gap and no 24-hour fallback.

Inventory reconciliation: **31 total, 31 source-reviewed, 0 unreviewed**. This resumed the retained worktree after the initial incomplete run; that checkpoint is superseded. Current fetched main matched the frozen target during review. Source review is not deployed acceptance.

Report path: `docs/qa/codex-daily-commit-review-2026-11-05.md`. No application fixes or PRs created. The only repository changes are this report and its matching cursor, to publish together.

## Review coverage

- Show switches/readiness and Actions badges: default resolution, live replica overlays, hidden landing links, suggestions and task counts.
- Entry forms/check-in: per-entry eligibility reuse, dog bulk exclusions, refund preview advisory-only, refresh handoff, underway labels and pending protection.
- Security/database: forward-only revocation stamps/reactivation, recent-password hard-delete gate and retained manifest protections, atomic preference merges, admin paging/order, lunch ACL/RLS and push endpoint claims.
- Messaging: audience authorization, one-person isolation, inbox/push/email sequencing, batching/failures, history scoping and preview counts. The confirmed audience completeness defect is below.
- Ringside: single-menu class actions, fixed-parent return state, announcement subscription, scoresheet landmarks and responsive header changes. Phone measurements were not rerun.
- Reports/guides: hospitality grouping/readiness and UKC Handler Discrimination data/citations, guide route/copy updates and embedded AskQ asset; screenshots were not recaptured.
- Verification infrastructure: registry scoresheet matrix, snapshot/filter regression coverage, shared-mock reset, computed-style test cache cleanup, view/count scanners, review-gate lens parity and deployment placeholder refusal. Generated types checked against new table/RPC shapes.

## Checks run

| Check                                                                                | Result                              |
| ------------------------------------------------------------------------------------ | ----------------------------------- |
| Retained worktree bootstrap (initial run)                                            | PASS                                |
| App check-in, bulk status, lunch, push and composer                                  | 17 files / 151 tests PASS, 5.99s    |
| At-show, registry rules/notes, preference writes, admin roster and scanner selection | 156 files / 1483 tests PASS, 27.09s |
| Edge email/person targeting and QA gate/deploy/SQL launcher tests                    | 5 files / 157 tests PASS, 12.39s    |
| Ringside header/actions/filter/keyboard-drag selection                               | 4 files / 46 tests PASS, 1.09s      |
| Full-range git diff --check                                                          | PASS                                |

Logs: `.logs/ncr-focused.log`, `ncr-expanded.log`, `ncr-edge-qa.log`, `ncr-ringside.log` in the retained evidence. Total executed: 1837 tests, 182 file executions. No full-suite/typecheck claim. No fresh browser, live SQL, migration push, deployment, payment, refund, email or push send. SQL behavioral tests were inspected/registered, not executed locally. No issue closed from source changes alone.

## P0

None confirmed.

## P1

None confirmed.

## P2 / Medium

### MYK9-1692 — email audience silently capped at 1000 entry rows

Status **new finding within existing acceptance scope**; product delivery completeness; source Medium, canonical P2. First/last seen Nov 5, recurrence 1, high confidence on source proof. Owner Richard; Claude implementation unclaimed. Baseline as above. All viewports; secretary Message Center show/class/checked-in email audiences.

`supabase/functions/send-targeted-message/targeted-message-handler.ts:172–210` performs one unpaged entries read; `supabase/config.toml:9` caps responses at 1000. Only returned rows feed preview and email resolution. With 1001 matching entries and a unique email recipient beyond the first page, that person is absent from sender arguments and the missing-address result. Expected every matching person considered. The later 100-email delivery batches cannot repair the truncated input. This is deterministic query-contract evidence, not a live incident or a newly executed 1001-row test.

Archived-inclusive searches by path, workflow, symptom and pagination; full MYK9-1692/comments, parent MYK9-1609 and MYK9-1187 read. The latter is completed lifecycle-job pagination, not this path. Existing stable ID reused and In Progress restored. [Full execution contract and proof](https://linear.app/myk9-platform/issue/MYK9-1692#comment-750bafd6-ec66-4d2c-be2b-4e666f2534a7).

Next action: stable paged audience read with failure handling. Closure: hermetic handler regression above 1000 entries, duplicate contacts across pages, last-page email-only person and failed second page; red on baseline, green on fix; then existing authorized small-audience deployed delivery/history proof. No large broadcast required. Verifier gap: delivery fixtures tested sending batches, not capped input pages.

### MYK9-1690 — remaining check-in acceptance

Status unchanged; source Medium/canonical P2; first known Nov 3, reconciled Nov 5, no fresh defect recurrence. #3597/#3613 fix underway eligibility and exact labels; focused tests pass. Historical phone/live and browser-only In Ring evidence preserved. Richard still owns notification-safe live In Ring handoff, desktop cold reload and complete same-mounted desktop sequence, server readback and cleanup. In Review/verify:browser retained. [Reconciliation](https://linear.app/myk9-platform/issue/MYK9-1690#comment-1464e4b3-4968-4ade-aaa6-6a7654a5ab1f).

## P3 / Low

### MYK9-1660 — source pins repaired, artifact proof owed

Status unchanged acceptance gate; source Low/canonical P3; first Nov 1, reconciled Nov 5, no new delivery recurrence. #3598 pins all eight web-push imports to 3.6.7. Recorded Deno resolution and 89 fanout tests preserved. Richard owns authorized deployment and artifact readback; In Review/needs:operator retained. No repeat 500-send rehearsal. [Reconciliation](https://linear.app/myk9-platform/issue/MYK9-1660#comment-c505c7f2-2764-43fe-92e4-bc05f82d09bb).

## Counts and persistence

New 1; unchanged 2; resolved 0; duplicate 0; rejected 0; blocked findings 0. New Linear issues 0; existing issues modified/reconciled: MYK9-1692, MYK9-1690, MYK9-1660. No filing limitation. Verification limits listed separately above.

Fixes found in subsequent commits: #3597 and #3613 repair the prior check-in status cause; #3598 repairs source version ranges. Their remaining acceptance is not marked resolved. Earlier completed historical ledger scope is preserved.

## Boundary

`daily-commit-review`: `da35e948408a416e61c4a6404b16b07dd896f54b`; window end `2026-11-05T04:04:10Z`; runner `codex-daily-commit-review`; run date `2026-11-05`. Publication/readback commit SHA is recorded outside this commit.

## Reviewed commit inventory

```text
8d2d3ed76db7f1445490524ade2b0d58e90fbee4 MYK9-1686: show uses switches drive publish nudges, landing card and suggestions (#3595)
a28e5891e72ed0e9a36957b890f27eee123bf456 docs(qa): recover November 4 report and complete commit backlog review
05d2b09dd533b506fd17cfb6231a35f73680ba3b feat(entries): dog-level Pull and Withdraw on the entry form (MYK9-1688) (#3596)
59b430ed2bca30ab3e7da6161ee5dd6abb5b6e71 Check in from the entry form on show days (MYK9-1691) (#3597)
fe8671ccdf8a02b5b6d5f59b5b128da529ffb35b fix(push): pin web-push imports to 3.6.7 (MYK9-1660) (#3598)
4ff91db0d30dc23351be6870694a8d0a2e0b933f test(scoring): scoresheet checks cover AKC, UKC and ASCA, blank and cloned trial types (MYK9-1656) (#3604)
b3da8365e54b23055ef938128989a5884d11dfca fix(rbac): revoking a secretary or steward stamps deactivated_at (MYK9-1585) (#3601)
e5ec9825a01daab8f29ec7beb1bfc8913c3817f0 fix(security): hard_delete_show requires a recent password (MYK9-1588) (#3600)
2d84c2247444794aa4c6983fc14a25c7f293fa1e fix(preferences): merge one category atomically in the database (MYK9-1563) (#3602)
f7651206f054a5bd050e90d2dc9aa49fd911ae91 MYK9-1561: page the admin roster RPC past the 1000-row API cap (#3603)
31666f92df450cb561dafc5ce632d3e0cbe3959b feat(reports): UKC Handler Discrimination page on the judge setup cheat sheet (MYK9-1641) (#3606)
1c9b031729b1695a1c5d5e28565d751198963d09 feat(show-desk): Lunch orders list replaces the Judge hospitality tool (MYK9-1694) (#3607)
18bd28eb4a4ee039b9d723d690c114440128e7f1 feat(messages): Also send by email in the show message composer (MYK9-1692) (#3605)
7b3933947a66261b7fe207b1e76ceb4a249d3bcb fix(at-show): give the scoresheet a main landmark (#3609)
084ea0e71949653994d13d9276af45c240d10ae7 fix(check-in-desk): show At Gate / In Ring on underway runs (MYK9-1690) (#3613)
68b86ff7521844749a673b7afd6de6ec6fa6f590 fix(show-desk): Tasks and notes row carries its own Actions badge (MYK9-1597) (#3612)
0e33807635142246579c00305689f11f087d245f test(ringside): pin list snapshot restore and initialFilters (MYK9-1551) (#3610)
ebeb688d09aa8728dc63646d448b2966cb999e0f feat(reports): Hospitality plan report, per-day headcount and lunch orders (MYK9-1695) (#3611)
6bddaf0bd6598dc1eb6cc27c7ff4a2e5ee01d3b1 Email exhibitor opens the show message composer scoped to one person (#3614)
18cdff773b473e6368d413f15b2c1ecbcc77dd9f docs(user-guides): secretary guide matches this week's pages, fresh screenshots, AskQ assets (MYK9-1605) (#3615)
9e7864b8579b10123ad2cf51ed00af4b91343f98 fix(review-gate): poster refuses a body the gate would count different lenses in (MYK9-1696) (#3616)
a2abbe93dd62599c1d6048ea084de449235edcd8 feat(ringside): one top bar per screen, the list first on phones (MYK9-1697) (#3617)
9feb2a39089a76e88d7604f5c639ea85386f77f5 fix(push): show-eve reminder names no role the recipient may not hold (MYK9-1700) (#3618)
811c1ba00312ebdf3497a9de1c4518cc1a2fdf62 ci(deploy): refuse a production build whose VITE_* env pulled as [SENSITIVE] (MYK9-1699) (#3619)
0d1ca62f81523bcce256fdfad6511a7e07fe57c3 fix(push): push switch reflects the real subscription when settings open (MYK9-1698) (#3620)
7c2bf476f4a521a310bbd6fc1e3e00b20e20342e test(check-in-desk): reset the shared schedule mock in the underway block (MYK9-1703) (#3621)
235c38dc651743ebbca948c79988849fbd21a13b test(ringside): cache getComputedStyle in the keyboard-drag render-count test (MYK9-1702) (#3622)
497336aefdcf79d6b5b4cdd2b24bec56e0fba17c test(db): lint new view migrations for security_invoker and select-star (MYK9-1704) (#3624)
c1162c90f8feb9f6c111ec4ead95db857fb004bd test(ci): guard PostgREST counts against select('*') on column-allowlisted tables (MYK9-1705) (#3625)
67234cc1a5b7bcc742b783cf030d091f211fa03d fix(push): a second account on a shared device can claim the browser's push endpoint (MYK9-1701) (#3623)
da35e948408a416e61c4a6404b16b07dd896f54b chore(types): regenerate Supabase types after the MYK9-1701 push (#3626)
```
