# UX Journey Synthesis Design

**Date:** 2026-06-14
**Status:** Approved for planning
**Scope:** Docs-only launch-gate synthesis for the June 2026 UX journey audit

## Purpose

Create `docs/audits/2026-06-ux-journeys/SUMMARY.md` as the decision layer above the existing journey audit evidence. The summary should help decide what blocks fall 2026 launch readiness, what can wait, and which remediation waves need user approval before product code changes begin.

This is not another UX audit pass and not a remediation implementation. It consolidates evidence that already exists in:

- `docs/audits/2026-06-ux-journeys/00-recon.md`
- `docs/audits/2026-06-ux-journeys/01-exhibitor-journey.md`
- `docs/audits/2026-06-ux-journeys/02-secretary-journey.md`
- `docs/audits/2026-06-ux-journeys/03-cross-role-seams.md`
- `docs/goals/fall-2026-launch-readiness-scorecard.md`
- `docs/INTENT.md`

## Design

The summary will use a launch-gate structure rather than a journey-by-journey narrative. Findings should be sorted by launch impact first, then role, because the human gate needs to answer "what must be fixed before launch?" more than "what did each page feel like?"

Required sections:

1. **Evidence Inventory** - Links to every source audit file and key artifact category.
2. **Launch-Gate Status** - Proposed current status for the Secretary and Exhibitor golden paths, with reasons tied to scorecard pass thresholds.
3. **Severity-Ordered Findings** - One table across exhibitor, secretary, and cross-role seams.
4. **Remediation Waves** - Cohesive fix clusters ordered by launch risk.
5. **Duplication And Consolidation Notes** - Explicit answer for each wave: does this duplicate an existing page, and if so why is duplication justified instead of a link?
6. **Human Gate** - A short approval checklist for selecting which remediation waves to execute.

## Finding Fields

Each finding row should include:

- ID
- Severity
- Role or seam
- Finding
- Golden-path step or seam
- INTENT violation
- Evidence link
- Recommended remediation
- Duplication answer
- Verification needed

Severity should use the launch-readiness scorecard definitions:

- `P0`: data loss, security exposure, payment failure, score/result corruption, or show-day outage
- `P1`: golden-path task cannot be completed without developer help or brittle workaround
- `P2`: important friction, confusion, missing state, poor recovery, or incomplete verification
- `P3`: polish, copy, speed, convenience, or post-launch enhancement

## Status Rules

Do not mark a golden path Green in the synthesis. The existing evidence contains unresolved P1/P2 findings and unverified seam mutations. The summary can propose Red or Yellow, but final Green requires remediation, re-walk, and scorecard evidence.

Blocked or unverified items should stay explicit:

- Shared Supabase mutation seams remain `Unverified` unless fixture-based or approved seed evidence exists.
- Stripe handoff and confirmation email remain `Unverified` if class selection blocks the registration path.
- Offline/reconnect behavior remains outside this summary's completion criteria unless Dynamic QA evidence is linked.

## Remediation Wave Shape

Recommended waves:

1. **Exhibitor entry and payment trust** - No-classes registration blocker, payment due recovery, class-fit clarity, confirmation path re-score.
2. **Exhibitor show-day and results clarity** - At-show role filtering, offline label, result-state explanations, completed/upcoming state normalization.
3. **Cross-role seam recovery** - Post-deadline pull/scratch path, blank exhibitor message route, message compose show preselection, withdrawn/refunded state agreement.
4. **Secretary closeout and routing polish** - Submit Results blocking/summary, legacy show-desk redirect, reports label cleanup.
5. **Fixture-backed seam completion** - Local or approved seed coverage for waitlist offer, scratch request, message thread, withdrawal/refund, and result publish latency/state agreement.

Each wave should prefer tightening or linking existing surfaces over adding new pages or duplicate workflows.

## Testing And Validation

This design produces docs only. Validation for the summary work:

- `git diff --check`
- `rg` checks for required section headings in `SUMMARY.md`
- Manual link check for referenced local audit files

Implementation/remediation waves are out of scope for this spec and will need their own tests when product code changes begin.

## Non-Goals

- Do not implement fixes.
- Do not mutate shared Supabase data.
- Do not create a new UX surface.
- Do not replace the existing journey audit files.
- Do not update scorecard rows to Green.

## Open Decision For User Review

Before implementation planning, the user should confirm whether the remediation waves above are the desired human-gate list or whether any wave should be split, dropped, or reordered.
