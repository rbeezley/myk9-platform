# Codex daily commit review — 2026-09-11

> **Status:** Reference

## Window and outcome

- Source: codex; automation `nightly-commit-review`; methodology `quality-finding-lifecycle`.
- Starting SHA, exclusive: `550ef046306721363459572086453b4e5817f803`.
- Reviewed all **15 first-parent commits** through frozen `origin/main` `c660131f5d091fe5f7e5972edf5493b2af44bc6d`. Final fetch matched this tip.
- Continuous window: **2026-09-10T12:46:13Z–2026-09-11T10:12:28Z**. No fallback or SHA/time coverage gap. This report's documentation commit remains outside the cursor for the next run.
- **One new P2 test-coverage defect confirmed; no new product or security regression confirmed.** Updated two existing canonical Linear descriptions automatically under this automation's authorization. No duplicate issue created, priorities changed, workflow states changed, or issues closed.
- MYK9-452 is resolved with recorded applied SQL and persisted-entry proof. MYK9-423's remaining original acceptance evidence is incomplete; its successful payment proof is now recorded.

| Lifecycle     | Count |
| ------------- | ----: |
| New           |     1 |
| Unchanged     |     0 |
| Resolved      |     1 |
| Blocked proof |     1 |
| Duplicate     |     0 |
| Rejected      |     0 |

Outstanding observations in this run: **P0 0 / P1 0 / P2 2 / P3 0**. Classification: one confirmed SQL test gap, one payment integration coverage gap, and one resolved product defect. These are scoped audit observations, not a census of all open launch work.

## Ranked findings

## Codex daily commit review — 2026-09-11: visibility inheritance coverage gap

**Stable finding:** NCR-2026-09-11-01; canonical owner issue MYK9-126. **source: codex**; detecting task nightly-commit-review. Classification: concrete high-risk SQL test coverage gap, not a confirmed product/security regression. Lifecycle new. Canonical **P2 / Medium** for incomplete verification; preserve this parent issue's existing priority and all G9 acceptance criteria. Owner Richard Beezley. First/last seen 2026-09-11; one run. Baseline **c660131f5d091fe5f7e5972edf5493b2af44bc6d**; introduced by [PR #2169](https://github.com/rbeezley/myk9-platform/pull/2169). Confidence high from actual local PostgreSQL 18 execution.

#### Observed versus expected

The new [parity test, lines 173–246](https://github.com/rbeezley/myk9-platform/blob/c660131f5d091fe5f7e5972edf5493b2af44bc6d/supabase/tests/myk9_126_class_result_visibility_parity_test.sql#L173) always inserts a non-null trial preset before comparing the synthetic classes. That preset replaces all four show defaults. The show timing loop therefore never tests inheritance from show settings or the no-settings fallback. Pass 1 explicitly skips on migrations-only CI, so existing data cannot supply that missing proof. Class and trial presets also always share the same value, leaving competing preset precedence untested.

Expected: the security-sensitive cascade test rejects a wrong show default, both with no overrides and with null/partial overrides; count only cases actually exercising each inheritance arm. This concerns secretary result-release settings and exhibitor results visibility. A future regression could hide or reveal results incorrectly while the claimed whole-cascade parity gate stays green. No current disclosure or authorization failure is asserted.

#### Sanitized executable proof

Disposable local PostgreSQL 18; no remote database, credentials, shared fixtures, or application source modified. Loaded minimal synthetic tables matching the referenced column types, the unchanged two helper functions, unchanged public resolver, and exact new private view. A stub public view existed solely for the test's reloptions assertion; this is targeted cascade proof, not a full migrated integration replay.

1. Run the complete unchanged supabase/tests/myk9_126_class_result_visibility_parity_test.sql: exit 0, pass 1 skips, pass 2 reports 18 combinations / 108 comparisons, pass 3 and pass 4 pass.
2. Replace only COALESCE(s.qualification_timing, 'immediate') in the private view with 'manual_release'::text (scratch database only).
3. Run the same complete test: **exit 0 again, all 108 comparisons pass**.
4. Add a separate synthetic upcoming class with a trial/show and no settings or overrides. Read private view and unchanged public resolver together: **mutated qualification_visible=false, oracle=true**. This proves the surviving mutation changes supported behavior.
5. Scratch fixture/control transactions roll back.

#### Next action and acceptance criteria

- Extend this existing behavioral SQL packet with self-contained no-show-settings, explicit-show-settings/no-overrides, null-preset partial trial override, and class-only override cases.
- Add differing trial versus class presets and explicit per-field overrides so precedence is observable instead of masked by identical presets.
- Include known expected values for the fallback/selected precedence cases alongside oracle equality.
- Count compared result rows rather than only source fixture rows where an empty function/join could otherwise remove comparisons.
- Preserve the production implementation and all existing G9 criteria unless a failing case demonstrates a product defect.

**Exact closure proof:** unmodified full migrated CI SQL packet passes; the deliberate wrong-show-default mutation above fails a named assertion; a trial/class precedence mutation fails a named assertion; restore the real view and rerun green. Record those outputs here. A merge, 108 existing comparisons, live view existence/ACLs, or an unrelated load run alone does not close this coverage finding.

Reconciliation: archived-inclusive searches for class_result_visibility, parity, show default, current registry and prior memory; full MYK9-126 description and comments inspected. The existing parent already owns this migration/proof, so this is added here without a duplicate issue. Previously recorded application/ACL evidence and remaining G9 work are preserved.

### P2 blocked proof — MYK9-423

- **Classification/status:** remaining original payment integration acceptance evidence; lifecycle blocked. Linear is Done and remains Done; no new runtime/financial defect is asserted.
- **Source:** codex; source severity High historically, current canonical P2 for incomplete verification. Owner Richard Beezley. First seen September 6; last seen September 11; fifth detailed daily observation (September 10 did not reconcile this item). Baseline is the frozen SHA above.
- **Scope:** exhibitor fee-card CTA, `/cart`, `/exhibitor/payments`, `/exhibitor/entries`; viewport not re-exercised.
- **New closure evidence accepted:** September 9's canonical issue records successful sandbox payment for the same three existing entry IDs, matching receipt, $90 fees plus $6.30 service fee, and $0 outstanding on `/exhibitor/payments`. The previous claim that successful same-entry payment was absent is superseded.
- **Remaining gap:** original AC4 requires actual fee-card CTA through real cart hydration with matching items/total. `apps/myk9show/src/pages/__tests__/CartPage.hydration.test.tsx` still mocks `loadActiveCart` and the cart store; the last test proves arguments on a direct URL, not that composition. Explicit second fee-card balance readback on `/exhibitor/entries` is not in the reviewed closure evidence.
- **Expected/observed:** expected end-to-end regression proof plus both balance readbacks; observed successful payment/one balance and isolated mocked hydration-argument proof. Confidence high about test isolation, limited to available records about browser proof.
- **Next action/closure:** attach any existing original CTA and second-balance evidence first. Add a scoped composition test that exercises real hydration and fails an empty-hydration negative control. If evidence is absent, perform the remaining authorized sandbox/browser proof; do not repeat payment merely to recreate existing evidence.
- Updated the full [canonical MYK9-423 description](https://linear.app/myk9-platform/issue/MYK9-423) with this narrower remaining contract, preserving its current workflow state.

### P1 resolved — NCR-2026-09-09-01 / MYK9-452

- **Classification:** self-check-in SQL product defect; registry fixed, lifecycle resolved. Source severity High; source codex. Owner Richard Beezley. First/last observation September 9/11; third daily observation.
- The forward migration `20260909174329` fixes the illegal UPDATE-target join. The full canonical issue and September 9–10 comments now record applied function-body/grant verification, **69 passing SQL assertions** including owner/co-owner/handler positives and authorization negatives, and an authenticated REST replay that persisted the owned entry from no-status to checked-in and restored it through the same RPC. Both requests returned 204 and versions incremented.
- Current-range commit `402c896b0` records that applied proof. This satisfies the original behavioral SQL plus persisted exhibitor closure gate; resolution is not inferred from merge alone.
- [MYK9-452](https://linear.app/myk9-platform/issue/MYK9-452) was already Done. No state change or new shared-database replay was performed by this audit.

## Other reviewed changes

- Sign-in/passcode screens, diagnostic timeout, person-detail layout and scoped management gates preserve the established flows. Person dog data remains supplied through the existing dog-store hook after redundant direct queries are removed. Judge selection uses qualification data rather than presentation role labels.
- MYK9-457 replaces broad raw role-table visibility with self/site-admin access and bounded presentation RPCs. The later `20260910210000` migration removes the global judge exception from both visible-person RPCs; that earlier concern is already repaired in the reviewed range. Existing global-gate cleanup is tracked by MYK9-464.
- MYK9-455's withdrawal dialog/hook/shared policy/server path now makes refund suggestions reviewable and keeps the authoritative server policy checks. Relevant policy, component and data-flow tests pass.
- MYK9-126 preserves the public resolver contract through a set-based private view. The issue records applied migration, live catalog/ACL and owner-run view evidence. This audit did not perform authenticated result replay or measure performance; remaining G9 performance/operational gates stay with MYK9-126/MYK9-453.
- Dependency updates installed from the exact frozen lockfile; all 12 workspace package builds and app typecheck pass. Dead-role-module references are gone.
- Reviewed load write telemetry/redaction, inflight output ceiling, scoped-gate source guard, and browser-walk instruction changes. No additional actionable defect confirmed.

## Verification and limits

| Executed check                                                    | Result                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Changed app tests selected from the reviewed diff                 | 503 tests / 29 files passed                                                                 |
| Two cwd-dependent changed app files, rerun from the app directory | 15 tests / 2 files passed                                                                   |
| Focused root inflight and SQL-harness tests                       | 63 tests / 2 files passed                                                                   |
| **Unique focused test total**                                     | **581 tests / 33 files passed**                                                             |
| `pnpm exec tsc --noEmit -p tsconfig.app.json` from the app        | Exit 0, no diagnostics                                                                      |
| Frozen-lockfile install and bootstrap                             | Install succeeded; all 12 package builds passed                                             |
| Unchanged SQL parity packet on disposable PostgreSQL 18           | 18 combinations / 108 comparisons pass                                                      |
| Same SQL packet after wrong-show-default mutation                 | Still passes; separate control returns false versus oracle true, confirming the test defect |
| Reviewed-range `git diff --check`                                 | Passed                                                                                      |

The first audit config accidentally inherited the whole test glob; it was stopped without a verdict and narrowed. The scoped run's two collection failures were caused by launching cwd-dependent tests from the root; both passed when rerun from the correct app directory. No unresolved focused-test failure remains. The initial stalled dependency install was stopped; exact online lockfile installation and bootstrap then succeeded.

Read-only GitHub evidence: [main CI run 34554873559](https://github.com/rbeezley/myk9-platform/actions/runs/34554873559) succeeded, including SQL, all six app shards, coverage gates, packages, build and quality. PR smoke-build/E2E/accessibility jobs were skipped on the SQL-only tip; those skips are not passes.

The local SQL experiment loaded minimal synthetic tables, unchanged resolver/helpers and the exact private view. Its public-view stub only satisfies the reloptions check; it does **not** prove the full migrated schema, public result-view integration or real-role access. The scratch PostgreSQL server was stopped after the probe. Reproduction inputs are the exact migrations named above; the sole view mutation and control are recorded in MYK9-126.

No application code was edited. No full local app suite, new browser/E2E replay, live SQL/RLS replay, deployment, payment, backup operation, load rehearsal or shared-fixture mutation was performed. Primary checkout work was preserved: the existing withdrawal-policy blank line and untracked `.agents/skills/impeccable/`. Review and docs changes used an isolated worktree at the frozen remote tip.

## Reviewed commit inventory

| Commit      | Scope                                                            |
| ----------- | ---------------------------------------------------------------- |
| `a54b6773d` | Prior daily audit report/cursor                                  |
| `fa3d9d004` | Prior boundary timestamp correction                              |
| `402c896b0` | Applied self-check-in proof                                      |
| `46f04e060` | #2160: sign-in/person layout and scoped management               |
| `41e3a10ca` | #2104: Supabase dependency updates                               |
| `3500e9116` | #2162: remove dead role hook                                     |
| `d8bdde61d` | #2163: inflight output ceiling                                   |
| `1030fba41` | #2164: person-role visibility/RLS                                |
| `14bc4e394` | Load telemetry redaction label                                   |
| `798f69b3f` | #2166: bounded sign-in diagnostics                               |
| `df81e0a8b` | #2168: scoped-gate guard and walk instructions                   |
| `02843f072` | Bounded write telemetry                                          |
| `56128426f` | #2165: reviewable withdrawal policy and tighter judge-role scope |
| `f070cd4ad` | #2161: dependency updates                                        |
| `c660131f5` | #2169: set-based result visibility and parity packet             |
