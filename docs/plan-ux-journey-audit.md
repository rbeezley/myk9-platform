# Plan: UX Journey Audit — Exhibitor & Secretary

**Created:** 2026-06-12 · **Status:** Draft — not started
**Goal:** Audit the two highest-stakes role experiences as *end-to-end journeys*, not pages. The April 2026 sprint audited 11 pages in isolation (Tier 1 exhibitor + Tier 2 secretary, `docs/ux-audits/phase-1-summary.md` / `phase-2-summary.md`); since then the surfaces changed underneath it — myK9Q was absorbed into `/at-show`, the workbench collapse landed, and the secretary show-day consolidation plan reshaped day-of flows. This audit scores the *current* app against INTENT.md's role feelings: Exhibitor "This respects my time", Secretary "That was easy".

**Methodology:** the `/UX-Audit` skill's 6-pass rubric (mental model, IA, affordances, cognitive load, state coverage, flow integrity) is mandatory per project rules — but applied per journey *segment*, with cross-segment flow integrity as the connecting thread. `/IA-Review` is the escalation path if a journey reveals structural fragmentation as the root cause.

## Validation Profile

- Risk: low (audit phases are read-only); medium for remediation waves
- Validation: findings are evidence-linked (screenshot or spec step); remediation waves carry tests per CLAUDE.md
- Rationale: the audit itself mutates nothing; fixes go through the standard PR workflow.

## Relationship to other plans

| Plan | Relationship |
| --- | --- |
| `docs/goals/fall-2026-launch-readiness-scorecard.md` | **The contract this audit serves.** Its Golden Path Criteria (Secretary: 11 numbered steps; Exhibitor: 8) are the canonical journey definitions — Phase 1's journey maps adopt them verbatim as segment lists. Both golden path scorecard rows are currently `Unknown`; this audit's walks are the "browser walkthrough with realistic show data" the scorecard names as their verification method. A finding that blocks a golden path step is automatically P0/P1 (launch-blocking), not a UX nit. |
| `plan-code-quality-audit.md` | Run this audit **after Waves A–C land** — no point auditing pages about to be consolidated or deleted. Independent of Wave D. |
| `plan-dynamic-qa-infrastructure.md` | Independent. Its Phase 4 (error boundaries) shares the INTENT-fallback concern; cross-reference findings, don't duplicate. |
| April 2026 UX sprint (`docs/ux-audits/`) | This **continues** that thread (its Phases 3–5 were never run). Phase 1 below dispositions every prior finding before any new auditing starts. |
| `plan-secretary-show-day-ux-consolidation.md`, `plan-show-map-workbench-collapse.md` | Treat as the *intended* design. A finding that contradicts these plans is a question for the user, not a defect. |

## The two journeys

The canonical segment lists are the scorecard's Golden Path Criteria — Secretary steps 1–11, Exhibitor steps 1–8 in `docs/goals/fall-2026-launch-readiness-scorecard.md`. In narrative form:

**Exhibitor:** discover show → show details/premium → register dog(s) → cart/pay → confirmation email → pre-show prep (entries, armbands, schedule) → `/at-show` day (check-in, dogs-ahead, conflicts, results) → post-show results/share.

**Secretary:** create show (or clone) → setup (trials, classes, judges, fees) → entries management (approve, waitlist, armbands) → pre-show prep (catalogs, labels, reports) → show day (check-in oversight, scratches, move-ups, scoring oversight) → wrap-up (results, reports, sanctioning-body submission).

If Phase 1 finds a divergence between this narrative and the scorecard's numbered steps, the scorecard wins.

---

## Phase 0 — Setup and safety

1. Worktree check before any write; no shared-system mutations (the audit is read-only; remediation PRs confirm separately).
2. Read in full before auditing: `docs/INTENT.md` (role feelings + guardrails are the scoring rubric), `docs/ux-audits/phase-1-summary.md`, `phase-2-summary.md`, `ux-audit-priority.md`, and the two consolidation plans.
3. Live walks use a dev server started *in this worktree* on a unique port — the Preview MCP serves the main checkout, not the worktree (known footgun), and concurrent agents may hold the default port.
4. Findings live in `docs/audits/2026-06-ux-journeys/` (one file per journey + one for seams + `SUMMARY.md`), same structure as the code-quality audit directory.

## Phase 1 — Recon: prior-finding disposition + journey maps

1. **Disposition every April finding** before new auditing: for each item in the phase 1/2 summaries, mark `fixed` (link the PR), `still-open` (carries into this audit pre-confirmed), or `obsolete` (surface deleted/replaced). Known candidates to check: scratch/move-up tap counts and 32px touch targets, Pipeline Dashboard dead controls (`is_scoring_finalized` hardcoded false, Send Email no-op), missing clone-from-previous-show, show-selector not auto-selecting today's show.
2. **Map each journey against the current router** — list the actual route/component per segment (the April docs reference `/exhibitor/show-day`, which no longer matches the `/at-show` reality). The map is the audit's table of contents; segments with no surface at all are findings in themselves.
3. Output: `00-recon.md` with the disposition table and both journey maps.

## Phase 2 — Exhibitor journey audit

Walk the full journey in a real browser (playwright-cli) with a test exhibitor account, applying the 6-pass rubric per segment plus three journey-specific passes:

1. **Cold-start walk:** a fresh agent (no conversation context) drives the journey from the landing page with only the goal "enter your dog in this weekend's show." Every hesitation, dead end, or wrong turn is a finding. This proxies the first-time exhibitor the page-scoped audit structurally couldn't see.
2. **Phone-at-ringside pass for `/at-show`:** 380px viewport, one-handed reach, glanceability of dogs-ahead count, tap targets ≥44px (INTENT guardrail), behavior mid-sync and offline (INTENT: "Offline Is Normal, Not Broken"). The exhibitor-awareness features (own-dog highlight, dogs-ahead, conflict chips, PR #639) get their first UX scoring here.
3. **State-coverage sweep on the money path:** registration/cart/payment in empty, loading, error, offline, and partial states — pre-launch, no real user has ever hit these. Include the wizard→Stripe handoff (PR #640 area) and confirmation-email expectations.
4. **Time-to-task baselines**, measured during the walk: clicks/screens/seconds for the ~8 most frequent exhibitor tasks (enter a dog, check armband number, find ring/start time, scratch request, view results, share a result). Recorded as a table — this becomes the regression baseline for consolidation work.

Output: `01-exhibitor-journey.md` with severity-rated findings tables per the UX-Audit skill format.

## Phase 3 — Secretary journey audit

Same structure with a secretary account:

1. **Cold-start walk:** goal "set up your club's October trial and open entries" — proxies the secretary migrating from paper or another platform.
2. **Show-day pressure pass:** the secretary's worst hour (entries arriving, scratches, a judge question). Score scratch/move-up tap counts against INTENT's one-tap target, verify "surfaces problems, not data" (the April cross-cutting failure) on the current workbench, and check that the day's show auto-selects.
3. **State coverage:** bulk operations mid-failure (partial approve, failed armband assign), waitlist edge states, wrap-up with incomplete results.
4. **Time-to-task baselines:** approve 20 entries, scratch a dog day-of, move-up, print armband labels, send a day-of announcement, produce the sanctioning-body report.

Output: `02-secretary-journey.md`.

## Phase 4 — Cross-role seams

Audit each exhibitor↔secretary intersection as one continuous flow, both sides observed in the same session (two browser contexts):

| Seam | Flow to walk |
| --- | --- |
| Scratch request | Exhibitor requests → what the secretary sees → exhibitor confirmation |
| Waitlist offer | Secretary offers → exhibitor notification → acceptance → entry state both sides |
| Entry question | Exhibitor messages → secretary reply → thread visibility |
| Refund/withdrawal | Exhibitor withdraws → secretary accounting view |
| Results publish | Secretary publishes → exhibitor reveal experience |

For each: latency of visibility (does the other side see it without refresh?), state agreement (do both sides show the same entry status?), and tone (INTENT: calm over clever). Output: `03-cross-role-seams.md`.

## Phase 5 — Synthesis and remediation plan

1. Compile `SUMMARY.md`: single severity-ordered findings table across all four docs, each finding tagged with the INTENT feeling it violates and its golden-path step (scorecard numbering).
2. **Update the launch-readiness scorecard:** the secretary and exhibitor golden path rows are currently `Unknown`. Using the walk evidence, set each to its earned status against the scorecard's own pass thresholds (no dead ends, no duplicate implementations, no developer-only recovery, no P0/P1). The final flip to green happens only at the post-remediation re-walk (Phase 6), but the initial evidence-based status lands here.
3. For any finding proposing new UI, answer the duplication question explicitly (CLAUDE.md consolidation rule) — the default remedy at this phase is a link, a deletion, or a tightening, not a new surface.
4. Human gate: user approves the remediation list before any fix work starts.
5. Remediation waves mirror the code-audit pattern: one PR per cohesive cluster, highest-severity exhibitor money-path items first.

## Phase 6 — Testing (required)

- **Audit byproducts:** cold-start and seam walks that surface real bugs get fixed at root cause with a committed Playwright spec (the `/qa-feature` pattern) in the same PR.
- **Per remediation wave:** unit tests for changed components/hooks (CLAUDE.md: phase isn't complete until tests pass); `pnpm typecheck` + `pnpm lint` + affected tests green.
- **Baseline re-measure:** after remediation waves, re-run the time-to-task measurements and record the delta in `SUMMARY.md` — the audit's success metric is those numbers moving, not findings counted.
- **Golden path sign-off:** re-walk both golden paths end-to-end against the scorecard's pass thresholds and update the secretary/exhibitor rows in `docs/goals/fall-2026-launch-readiness-scorecard.md` with the earned status and evidence link. This is the audit's exit criterion.
- **INTENT regression:** any remediation touching a surface with `// INTENT:` comments preserves the documented behavior or stops for explicit approval.
