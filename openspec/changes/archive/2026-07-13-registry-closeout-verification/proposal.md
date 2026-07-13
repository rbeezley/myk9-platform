## Why

Secretary responsibility rows S7.1, S7.2, S7.3, and S7.5 are launch-critical because the secretary must produce registry-specific closeout packets and preserve submission artifacts without manually rebuilding paperwork from scratch. AKC forms are now wired, but UKC and ASCA status was still too coarse in the coverage matrix.

This supports fall 2026 launch readiness by replacing the broad "UKC/ASCA gap" language with verified source, code, test, and remediation evidence.

## What Changes

- Add `docs/roles/secretary-registry-closeout-verification.md` for the S7 registry closeout batch.
- Inventory official AKC, UKC, and ASCA closeout/report/form/submission sources.
- Compare official sources to current local PDFs, Reports page surfaces, organization-form mappings, and electronic submission code.
- Update the secretary coverage and verification plan docs with the newly verified S7 state.
- Keep implementation follow-ups scoped separately so we do not add duplicate report surfaces or overbuild registry workflows before the evidence is clear.

This does not duplicate an existing product surface. It audits and routes future work through the existing Reports and Submit Results surfaces before any new UI is proposed.

## Capabilities

### New Capabilities

- `registry-closeout-verification`: Tracks registry-specific closeout source evidence, current myK9 coverage, and remediation plans for AKC, UKC, and ASCA scent sport submission artifacts.

### Modified Capabilities

- None.

## Impact

- Affected docs: `docs/roles/secretary-registry-closeout-verification.md`, `docs/roles/secretary-responsibility-coverage.md`, and `docs/roles/secretary-responsibility-verification-plan.md`.
- Affected OpenSpec artifacts: `openspec/changes/registry-closeout-verification/`.
- No app routes, database schema, APIs, or UI behavior change in this verification slice.
