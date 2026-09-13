# Archive summary: registration-wizard-option-b

**Outcome:** implemented and merged; archived 2026-09-13 with specs promoted.

- Linear: MYK9-483.
- PR: https://github.com/rbeezley/myk9-platform/pull/2210, squash-merged to `main` as `187940adc` at 2026-09-13 22:43 UTC.
- Review gate: Codex, 12 rounds. Rounds 1–8 covered the structural batches; a cart-expiry notice with a cart-mutating "start again" control drew four P1 rounds on one path and was removed from the change entirely rather than patched again (the convergence rule in `docs/agents/shared-rules.md`, tightened by #2214). Rounds 9–11 were one P2 each: class-label disambiguation scoped per trial instead of across the cart; the browser walks remove the class they added, anchored by chip id, in a `finally`; the entries panel labels classes from replication first. Round 12 recorded `Review gate: codex reviewed 1d5b20dc3..9a051cda4 — no findings` on the merged head.
- CI: all 23 required checks green on `9a051cda4`.
- Local: typecheck, lint, `qa:code-quality-ratchet` EXIT=0 on every push; whole app suite shuffled green on the final tree (2053 files, 19836 tests); the two entries-panel browser walks pass on chromium against staging.
- Specs: `entry-wizard-guidance` updated (three requirements added; the cart-expiry requirement was removed before archive); `entry-wizard-running-total` and `wizard-progress-indicator` created.
- Follow-ups listed in the PR and not part of this change: the app shell's `main` scroll container makes `position: sticky` inert for other pages; the dead `show-creation-wizard-detailed.spec.ts` suite; `secretary_existing` in the parallel workflow config; `verify-e2e-auth-preflight.ts` not loading `.env`; walk findings (reload drops to step 1, judge-day "Full" has no reason, `in_progress` classes are enterable); the toast covering the phone bottom navigation; exhibitor step titles truncating at 390px.
