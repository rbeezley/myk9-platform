# Proposal

## User requests (verbatim)

Initial: “Start batch 2 and ship it through completion. Fix the next set of Linear issues in review, then verify and close them.”

Read-only preparation decision: “Prepare checks without shared-data writes.” Preparation shipped in #3047; no live proof or closure was claimed.

Current direction: **“Verify MYK9-1204 and MYK9-992 in an isolated test environment without changing shared data, then close them if all acceptance criteria pass.”**

Approved redesign decision (verbatim): **“Approve the simpler proof design (Recommended)”** — native loopback browser connections, row-scoped role assertions and proof runs preserved per source SHA.

## Why

The fixes for both issues are merged and deployed. The remaining browser/SQL evidence needs a mutable fixture, while shared data must remain unchanged. A disposable GitHub Actions Supabase instance supplies real auth, RLS, database, replication and browser behavior with no shared target.

## What Changes

- Add a dedicated manual verification suite/config/workflow using the existing isolated E2E lifecycle and canonical demo seed.
- Prove NULL/gapped positions and in-ring/pulled/completed controls across secretary, judge and cold exhibitor against actual SQL and replica rows.
- Keep a real judge browser offline for 61 minutes, confirm natural token expiry, then score and verify durable ownership/queue plus same-user re-auth/upload/readback.
- Record actual results and close each issue only if all criteria pass. Keep failure evidence and fix any reproduced defect through normal review gates.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: application behavior is unchanged; this is a manual verification harness and evidence. `skip_specs: true` remains appropriate unless a product correction changes behavior.

## Impact

Tracking: [MYK9-1204](https://linear.app/myk9-platform/issue/MYK9-1204), [MYK9-992](https://linear.app/myk9-platform/issue/MYK9-992). Existing fixes #3040/#2727/#2824; preparation #3047. New files stay in a dedicated test suite, configuration and manual workflow. This duplicates no product surface; verification reuses actual existing UI/mutation/replication paths. Non-goals: shared database writes, production deployment, payments, notifications, changing auth policy, replacing real time with a clock stub, or widening the ordinary scheduled regression run to include the hour-long proof.
