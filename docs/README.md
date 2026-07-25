# myK9 Documentation Index

This is the single index of **living** documentation. If a doc isn't listed here, it has been
retired to [`archive/`](archive/) (kept for history, not maintained).

## How docs are organized

- **🟡 Active** — a plan or audit whose work is still in progress or not yet started.
- **🔵 Reference** — a living doc meant to persist: ADRs, architecture, role definitions,
  runbooks, design-token source-of-truth, quality-system methodology.
- **`archive/`** — completed plans, dated point-in-time audits/handoffs, and superseded docs.
  Nothing is deleted; everything is recoverable via git history and stays browsable here.

## Anti-rot convention (read before adding a doc)

1. **New plans get a status line** under the title:
   `> **Status:** Active` (or `Complete` / `Abandoned`).
2. **When a plan's work merges**, flip its status to `Complete` and `git mv` it into
   `docs/archive/` (mirror its path), then update this index.
3. **This index is the source of truth** for what's live — add a row when you add a doc,
   remove the row when you archive one. Never let a shipped plan sit in `docs/` unlabeled.
4. **Reference docs stay** until the thing they describe is gone. Design-token READMEs are
   cited as source-of-truth in `apps/myk9show/src/features/*/tokens.ts` — do not archive
   those while the styles ship.

> Last full reconciliation: 2026-06-14 (see [`archive/plan-docs-cleanup-2026-06-14.md`](archive/plan-docs-cleanup-2026-06-14.md)).
> Reduced docs/ from 563 markdown files to 86 living docs (85 indexed below + this index); 484 retired to `archive/`.
> Second-pass triage 2026-06-14 archived 30 shipped/superseded plans (see [`plan-active-docs-triage-2026-06-14.md`](plan-active-docs-triage-2026-06-14.md)).
> (2026-06-14 follow-up: archived 4 more myK9Q-era reference docs — `SCHEMA-ANALYSIS`, `DATABASE-AUDIT`, `ONLINE-ENTRY-SYSTEM`, and the `2026-05-17-unify-myk9show-myk9q` plan — after the myK9Q app was removed.)
> (2026-07-12 status-column sweep: archived 4 shipped-but-unarchived plans whose bodies already read `Status: Complete` — `plan-dynamic-qa-infrastructure`, `plan-replication-occ-watermark-findings`, `plan-entry-management-layout`, `plan-motion-consistency` — and dropped their index rows.)

---

## Index

### Root — plans & playbooks

| Doc                                                                                                              | Status    | Title                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| [DEFERRED-WORK.md](DEFERRED-WORK.md)                                                                             | Reference | Deferred Work Items                                                          |
| [INTENT.md](INTENT.md)                                                                                           | Reference | myK9 Platform Intent Document                                                |
| [admin-mcp-local-setup.md](admin-mcp-local-setup.md)                                                             | Reference | Site-Admin MCP — local setup (read-only diagnostics)                         |
| [ai-ux-adaptation.md](ai-ux-adaptation.md)                                                                       | Reference | myK9 Adaptation Notes — "4 AI UX Prompts" Guide                              |
| [codex-review-playbook.md](codex-review-playbook.md)                                                             | Reference | Codex review playbook                                                        |
| [entitlement-operations.md](entitlement-operations.md)                                                           | Reference | Entitlement Operations                                                       |
| [feature-audit-2026.md](feature-audit-2026.md)                                                                   | Reference | Feature Audit — Fall 2026                                                    |
| [ia-review-entry-status-surfaces.md](ia-review-entry-status-surfaces.md)                                         | Active    | IA Review: Entry-Status Surfaces (cross-role)                                |
| [ia-review-secretary-entry-management.md](ia-review-secretary-entry-management.md)                               | Active    | IA Review: Secretary Entry Management (cognitive-load track)                 |
| [improve-audit-2026-06/README.md](improve-audit-2026-06/README.md)                                               | Active    | Improve Audit — June 2026 (remaining plans 003–006)                          |
| [improve-audit-2026-07/README.md](improve-audit-2026-07/README.md)                                               | Active    | Production-Readiness Bug Audit — July 2026 (5 plans; reconciled vs UX walk)  |
| [improve-audit-2026-07-11/README.md](improve-audit-2026-07-11/README.md)                                         | Active    | Codebase Health Audit — 2026-07-11 (6 executor plans + backlog)              |
| [improve-audit-2026-07-11/007-replication-core-split.md](improve-audit-2026-07-11/007-replication-core-split.md) | Active    | Plan 007 — Replication Core Split (tracked by OpenSpec)                      |
| [launch-milestone-qa-checklist.md](launch-milestone-qa-checklist.md)                                             | Reference | Launch-Milestone QA Checklist                                                |
| [launch/go-live-2026-07-11.md](launch/go-live-2026-07-11.md)                                                     | Active    | Go-Live Gate Review — 2026-07-11                                             |
| [plan-stripe-golive-enforcement.md](plan-stripe-golive-enforcement.md)                                           | Active    | Stripe Go-Live Enforcement — capacity gate + waitlist Phases 7/8             |
| [navigation-ia.md](navigation-ia.md)                                                                             | Reference | Navigation & IA Sketch — Fall 2026                                           |
| [plan-active-docs-triage-2026-06-14.md](plan-active-docs-triage-2026-06-14.md)                                   | Active    | Active-Docs Triage — 2026-06-14                                              |
| [plan-architecture-deepening.md](plan-architecture-deepening.md)                                                 | Active    | Architecture Deepening Plan                                                  |
| [plan-asca-level-c-classes.md](plan-asca-level-c-classes.md)                                                     | Active    | ASCA Level C — seed continuation classes into the wizard template            |
| [plan-askq-revival.md](plan-askq-revival.md)                                                                     | Active    | AskQ Revival & Simplification (select-then-bundle)                           |
| [plan-data-access-module-drift.md](plan-data-access-module-drift.md)                                             | Active    | Data Access Module Drift Plan                                                |
| [plan-entries-read-consolidation.md](plan-entries-read-consolidation.md)                                         | Active    | Entry-Read Module Consolidation (findings from Plan 004 spike)               |
| [plan-show-details-step-extraction/README.md](plan-show-details-step-extraction/README.md)                       | Active    | Show Details Step Extraction (ShowDetailsStep.tsx hotspot follow-up)         |
| [plan-entry-draw-lottery.md](plan-entry-draw-lottery.md)                                                         | Active    | Entry Draw / Lottery — random-draw intake (depends on payment plan)          |
| [plan-entry-payment-request.md](plan-entry-payment-request.md)                                                   | Active    | Entry Payment, Waitlist & Capacity (links, pay-to-claim, judge-day)          |
| [plan-exhibitor-early-checkin.md](plan-exhibitor-early-checkin.md)                                               | Active    | Exhibitor early check-in — toggle gate (P1 done) + /at-show fix (P2)         |
| [plan-label-print-calibration.md](plan-label-print-calibration.md)                                               | Active    | Label print calibration — offsets, shared panel, alignment test sheet        |
| [plan-landing-hero-lcp-prerender.md](plan-landing-hero-lcp-prerender.md)                                         | Active    | Landing-page mobile LCP — prerender + hydrate the hero                       |
| [plan-launch-execution-lanes.md](plan-launch-execution-lanes.md)                                                 | Active    | Plan: Fall Launch — Execution Lanes (canonical to-do)                        |
| [plan-myk9-64-secretary-show-desk-simplification.md](plan-myk9-64-secretary-show-desk-simplification.md)         | Active    | MYK9-64 — Secretary Show Desk simplification (dedupe routes, affordances)    |
| [plan-myk9-80-podium-completion-celebration.md](plan-myk9-80-podium-completion-celebration.md)                   | Active    | MYK9-80 — At-show podium + class completion celebration                      |
| [plan-myk9-84-authz-dead-letter.md](plan-myk9-84-authz-dead-letter.md)                                           | Active    | MYK9-84 — Permanent Authorization Dead-Letter Messaging                      |
| [plan-operator-docs-portal.md](plan-operator-docs-portal.md)                                                     | Deferred  | Gated Operator Docs Portal — searchable runbooks (deferred 2026-06-27)       |
| [plan-phase4-seam-render-only.md](plan-phase4-seam-render-only.md)                                               | Active    | Plan: Phase 4 seam render-only read strategy                                 |
| [plan-pull-management-split.md](plan-pull-management-split.md)                                                   | Active    | Pull Management — separate show-day pull state from refund accounting        |
| [plan-public-results-release-gate.md](plan-public-results-release-gate.md)                                       | Active    | Plan: Server-side gate for public/anon scored results                        |
| [plan-replication-insert-idempotency.md](plan-replication-insert-idempotency.md)                                 | Active    | Replication INSERT retry idempotency — investigation verdict (B)             |
| [plan-restore-ui-remediation.md](plan-restore-ui-remediation.md)                                                 | Active    | Plan: Fix the Deleted Entities (restore) UI                                  |
| [plan-result-reveal-share-card.md](plan-result-reveal-share-card.md)                                             | Active    | Plan: Result Reveal + Share Card                                             |
| [plan-site-admin-mcp-v1.md](plan-site-admin-mcp-v1.md)                                                           | Active    | Site Admin MCP V1 Implementation Plan                                        |
| [plan-soft-delete-person-rpc.md](plan-soft-delete-person-rpc.md)                                                 | Active    | Plan: Fix person soft-delete (RLS WITH-CHECK block)                          |
| [security-audit-2026-07/README.md](security-audit-2026-07/README.md)                                             | Active    | Security Audit Remediation — July 2026 (17 findings; 0 P0/P1; 6 plans)       |
| [plan-ux-journey-audit.md](plan-ux-journey-audit.md)                                                             | Active    | Plan: UX Journey Audit — Exhibitor & Secretary                               |
| [plan-ux-journey-phase6.md](plan-ux-journey-phase6.md)                                                           | Active    | Plan: UX Journey Audit — Phase 6 (Remediation Verification)                  |
| [plan-wave1-exhibitor-entry-payment-trust.md](plan-wave1-exhibitor-entry-payment-trust.md)                       | Active    | Wave 1 Exhibitor Entry And Payment Trust Implementation Plan                 |
| [plan-workflow-process-consolidation.md](plan-workflow-process-consolidation.md)                                 | Active    | Workflow & process consolidation — PLAYBOOK.md, CLAUDE.md slim, skills audit |
| [plan-wave3a-at-show-phone-polish.md](plan-wave3a-at-show-phone-polish.md)                                       | Active    | Wave 3A At-Show Phone Polish Plan                                            |
| [plan-wave3b-results-my-shows-clarity.md](plan-wave3b-results-my-shows-clarity.md)                               | Active    | Wave 3B Results and My Shows Clarity Plan                                    |
| [playbook-impeccable-page-improvements.md](playbook-impeccable-page-improvements.md)                             | Reference | Impeccable Page-Improvement Playbook                                         |
| [rulebooks/README.md](rulebooks/README.md)                                                                       | Reference | Sport & Registry Rulebooks — source reference library                        |

### plans/ — feature & phase plans

| Doc                                                                                                          | Status    | Title                                                         |
| ------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------- |
| [plans/2026-06-12-user-documentation-support-plan.md](plans/2026-06-12-user-documentation-support-plan.md)   | Active    | User Documentation and Support Materials Implementation Plan  |
| [plans/2026-07-16-nightly-review-fixes.md](plans/2026-07-16-nightly-review-fixes.md)                         | Active    | Nightly Review Fixes — 2026-07-16                             |
| [plans/design_handoff_premiums/README.md](plans/design_handoff_premiums/README.md)                           | Reference | Handoff: Premium List Designs (myK9Show)                      |
| [plans/qa/2026-05-12-nightly-e2e-repair-batches.md](plans/qa/2026-05-12-nightly-e2e-repair-batches.md)       | Active    | Nightly E2E Repair Batches                                    |
| [plans/qa/2026-05-12-proactive-quality-system-plan.md](plans/qa/2026-05-12-proactive-quality-system-plan.md) | Reference | Proactive Quality System Plan                                 |
| [plans/strategy/2026-04-11-north-star-fall-2026.md](plans/strategy/2026-04-11-north-star-fall-2026.md)       | Reference | Plan: Stabilize myK9 Platform Toward a Solid Fall 2026 Launch |

### adr/ — architecture decision records

| Doc                                                                                            | Status    | Title                                                                             |
| ---------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------- |
| [adr/001-monorepo-pnpm-turborepo.md](adr/001-monorepo-pnpm-turborepo.md)                       | Reference | ADR-001: Monorepo with pnpm and Turborepo                                         |
| [adr/002-base-ui-over-radix.md](adr/002-base-ui-over-radix.md)                                 | Reference | ADR-002: Base UI (via shadcn/ui) over Radix Primitives                            |
| [adr/003-zustand-state-management.md](adr/003-zustand-state-management.md)                     | Reference | ADR-003: Zustand for State Management                                             |
| [adr/004-offline-first-indexeddb.md](adr/004-offline-first-indexeddb.md)                       | Reference | ADR-004: Offline-First Architecture with IndexedDB                                |
| [adr/005-dual-ui-strategy.md](adr/005-dual-ui-strategy.md)                                     | Reference | ADR-005: Dual UI Strategy -- Tailwind/shadcn for myK9Show, Semantic CSS for myK9Q |
| [adr/006-package-boundaries.md](adr/006-package-boundaries.md)                                 | Reference | ADR-006: Package Boundaries and Dependency Graph                                  |
| [adr/007-supabase-backend.md](adr/007-supabase-backend.md)                                     | Reference | ADR-007: Supabase as Unified Backend                                              |
| [adr/008-entity-module-export-shape.md](adr/008-entity-module-export-shape.md)                 | Reference | ADR-008: Canonical Entity-Module Export Shape (Flat Named Functions)              |
| [adr/009-online-only-data-access-exceptions.md](adr/009-online-only-data-access-exceptions.md) | Reference | ADR-009: Online-Only Data Access Exceptions                                       |
| [adr/README.md](adr/README.md)                                                                 | Reference | Architecture Decision Records                                                     |

### architecture/ — system references

| Doc                                                                      | Status    | Title                                    |
| ------------------------------------------------------------------------ | --------- | ---------------------------------------- |
| [architecture/API.md](architecture/API.md)                               | Reference | API Reference -- Supabase Edge Functions |
| [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)             | Reference | Architecture                             |
| [architecture/PUSH-NOTIFICATIONS.md](architecture/PUSH-NOTIFICATIONS.md) | Reference | Push Notifications — Operations Guide    |
| [architecture/VERCEL-SETUP.md](architecture/VERCEL-SETUP.md)             | Reference | Vercel Deployment Setup                  |

### audits/ — active audits

| Doc                                                                                                              | Status    | Title                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [audits/2026-06-28-overnight-launch-readiness-sweep.md](audits/2026-06-28-overnight-launch-readiness-sweep.md)   | Active    | Overnight Launch-Readiness Sweep                                                                                                               |
| [audits/2026-07-01-show-creation-wizard-ux.md](audits/2026-07-01-show-creation-wizard-ux.md)                     | Active    | UX Findings — Show Creation Wizard                                                                                                             |
| [audits/2026-07-01-secretary-journey-ux-audit.md](audits/2026-07-01-secretary-journey-ux-audit.md)               | Active    | UX Audit — Secretary Journey Walkthrough                                                                                                       |
| [audits/2026-07-08-replication-offline-scoring.md](audits/2026-07-08-replication-offline-scoring.md)             | Active    | Replication Layer Audit — Offline Scoring Durability                                                                                           |
| [audits/2026-07-01-ui-verification-matrix.md](audits/2026-07-01-ui-verification-matrix.md)                       | Active    | UI Verification Matrix — Theme × Viewport × A11y (+ [icon-button appendix](audits/2026-07-01-ui-verification-matrix-appendix-icon-buttons.md)) |
| [audits/2026-06-code-quality/08-config-flag-debt.md](audits/2026-06-code-quality/08-config-flag-debt.md)         | Active    | 08 Config And Flag Debt                                                                                                                        |
| [audits/2026-06-code-quality/09-phase-2-verification.md](audits/2026-06-code-quality/09-phase-2-verification.md) | Active    | 09 Phase 2 Verification                                                                                                                        |
| [audits/2026-06-code-quality/README.md](audits/2026-06-code-quality/README.md)                                   | Reference | Code-Quality Audit Run                                                                                                                         |
| [audits/2026-06-code-quality/SUMMARY.md](audits/2026-06-code-quality/SUMMARY.md)                                 | Active    | Code-Quality Audit Summary                                                                                                                     |
| [audits/2026-06-proactive-qa/db-advisors.md](audits/2026-06-proactive-qa/db-advisors.md)                         | Active    | Database Drift Checks — 2026-06-12                                                                                                             |
| [audits/2026-06-ux-journeys/00-recon.md](audits/2026-06-ux-journeys/00-recon.md)                                 | Reference | UX Journey Audit Recon                                                                                                                         |
| [audits/2026-06-ux-journeys/01-exhibitor-journey.md](audits/2026-06-ux-journeys/01-exhibitor-journey.md)         | Active    | UX Audit: Exhibitor Journey                                                                                                                    |
| [audits/2026-06-ux-journeys/02-secretary-journey.md](audits/2026-06-ux-journeys/02-secretary-journey.md)         | Active    | UX Audit: Secretary Journey                                                                                                                    |
| [audits/2026-06-ux-journeys/03-cross-role-seams.md](audits/2026-06-ux-journeys/03-cross-role-seams.md)           | Active    | UX Audit: Cross-Role Seams                                                                                                                     |
| [audits/2026-06-ux-journeys/SUMMARY.md](audits/2026-06-ux-journeys/SUMMARY.md)                                   | Active    | UX Journey Audit Summary                                                                                                                       |
| [audits/REVIEW.md](audits/REVIEW.md)                                                                             | Reference | Code Review Guidelines                                                                                                                         |

### qa/ — quality system

| Doc                                                  | Status    | Title                 |
| ---------------------------------------------------- | --------- | --------------------- |
| [qa/assets.md](qa/assets.md)                         | Reference | QA Asset Inventory    |
| [qa/discovery-workflow.md](qa/discovery-workflow.md) | Reference | QA Discovery Workflow |
| [qa/e2e-suite-map.md](qa/e2e-suite-map.md)           | Reference | E2E Suite Map         |
| [qa/findings.md](qa/findings.md)                     | Active    | QA Findings Registry  |
| [qa/nightly-history.md](qa/nightly-history.md)       | Reference | Nightly QA History    |
| [qa/quality-score.md](qa/quality-score.md)           | Reference | myK9 Quality Score    |
| [qa/quality-scorecard.md](qa/quality-scorecard.md)   | Reference | QA Quality Scorecard  |

### design/ — design specs & handoffs

| Doc                                                                                                                                | Status    | Title                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------- |
| [design/claude_code_handoff/design_handoff_banner/README.md](design/claude_code_handoff/design_handoff_banner/README.md)           | Reference | Banner Style — Design Handoff             |
| [design/claude_code_handoff/design_handoff_field_guide/README.md](design/claude_code_handoff/design_handoff_field_guide/README.md) | Reference | Field Guide Style — Design Handoff        |
| [design/claude_code_handoff/design_handoff_gazette/README.md](design/claude_code_handoff/design_handoff_gazette/README.md)         | Reference | Gazette Style — Design Handoff            |
| [design/claude_code_handoff/design_handoff_magazine/README.md](design/claude_code_handoff/design_handoff_magazine/README.md)       | Reference | Magazine Style — Design Handoff           |
| [design/claude_code_handoff/design_handoff_monogram/README.md](design/claude_code_handoff/design_handoff_monogram/README.md)       | Reference | Monogram Style — Design Handoff           |
| [design/claude_code_handoff/design_handoff_poster/README.md](design/claude_code_handoff/design_handoff_poster/README.md)           | Reference | Poster Style — Design Handoff             |
| [design/specs/PRD.md](design/specs/PRD.md)                                                                                         | Reference | PRD: myK9 Platform                        |
| [design/specs/UX-spec.md](design/specs/UX-spec.md)                                                                                 | Reference | UX Specification: myK9 Platform           |
| [design/specs/crm-ux-inspiration.md](design/specs/crm-ux-inspiration.md)                                                           | Reference | CRM/SaaS UX Inspiration for myK9 Platform |
| [design/specs/premium-website-checklist.md](design/specs/premium-website-checklist.md)                                             | Reference | Premium Website Checklist                 |
| [design/specs/premium-website-how-to.md](design/specs/premium-website-how-to.md)                                                   | Reference | design/specs/premium-website-how-to.md    |

### design_handoff_heritage/

| Doc                                                                                                    | Status    | Title                                                   |
| ------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------- |
| [design_handoff_heritage/Multi-Registry Scoping.md](design_handoff_heritage/Multi-Registry Scoping.md) | Active    | Multi-Registry Support — Scoping Document               |
| [design_handoff_heritage/README.md](design_handoff_heritage/README.md)                                 | Reference | Handoff: Heritage Style — Public Trial Pages (myK9Show) |

### goals/ — launch readiness

| Doc                                                                                            | Status | Title                                |
| ---------------------------------------------------------------------------------------------- | ------ | ------------------------------------ |
| [goals/fall-2026-launch-readiness-scorecard.md](goals/fall-2026-launch-readiness-scorecard.md) | Active | Fall 2026 Launch Readiness Scorecard |
| [goals/fall-2026-launch-readiness.md](goals/fall-2026-launch-readiness.md)                     | Active | Fall 2026 Launch Readiness Goal      |

### handoffs/

| Doc | Status | Title |
| --- | ------ | ----- |

### roles/ — role definitions

| Doc                                                                                                        | Status    | Title                                         |
| ---------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------- |
| [roles/admin.md](roles/admin.md)                                                                           | Reference | Role: Site Admin                              |
| [roles/club-admin.md](roles/club-admin.md)                                                                 | Reference | Role: Club Admin                              |
| [roles/exhibitor.md](roles/exhibitor.md)                                                                   | Reference | Role: Exhibitor                               |
| [roles/judge.md](roles/judge.md)                                                                           | Reference | Role: Judge (stub — deferred for fall 2026)   |
| [roles/secretary.md](roles/secretary.md)                                                                   | Reference | Role: Secretary                               |
| [roles/secretary-responsibility-coverage.md](roles/secretary-responsibility-coverage.md)                   | Active    | Secretary Responsibility Coverage Matrix      |
| [roles/secretary-responsibility-verification-plan.md](roles/secretary-responsibility-verification-plan.md) | Active    | Secretary Responsibility Verification Plan    |
| [roles/judge-responsibility-coverage.md](roles/judge-responsibility-coverage.md)                           | Active    | Judge Responsibility Coverage Matrix          |
| [roles/judge-responsibility-verification-plan.md](roles/judge-responsibility-verification-plan.md)         | Active    | Judge Responsibility Verification Plan        |
| [roles/steward.md](roles/steward.md)                                                                       | Reference | Role: Steward (stub — deferred for fall 2026) |

### testing/ — golden-path checklists

| Doc                                                                                      | Status    | Title                            |
| ---------------------------------------------------------------------------------------- | --------- | -------------------------------- |
| [testing/exhibitor-golden-path-checklist.md](testing/exhibitor-golden-path-checklist.md) | Reference | Exhibitor Golden Path Checklist  |
| [testing/exhibitor-walk-seed.md](testing/exhibitor-walk-seed.md)                         | Reference | Exhibitor Walk — Test Seed State |
| [testing/secretary-golden-path-checklist.md](testing/secretary-golden-path-checklist.md) | Reference | Secretary Golden Path Checklist  |
| [testing/secretary-walk-seed.md](testing/secretary-walk-seed.md)                         | Reference | Secretary Walk — Test Seed State |

### journeys/ — role journeys

| Doc                                            | Status    | Title             |
| ---------------------------------------------- | --------- | ----------------- |
| [journeys/exhibitor.md](journeys/exhibitor.md) | Reference | Exhibitor Journey |
| [journeys/secretary.md](journeys/secretary.md) | Reference | Secretary Journey |

### operations/ — runbooks

| Doc                                                                                                      | Status    | Title                                                                              |
| -------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| [operations/START-HERE.md](operations/START-HERE.md)                                                     | Reference | START HERE — symptom-first router for operating + troubleshooting issues           |
| [operations/go-live-runbook.md](operations/go-live-runbook.md)                                           | Active    | Go-Live Runbook — the single ordered, gated launch-day document                    |
| [operations/edge-function-drift-audit-2026-07-12.md](operations/edge-function-drift-audit-2026-07-12.md) | Active    | Edge Function Drift Audit — deployed-source recovery and legacy-sender disposition |
| [operations/stripe-platform-setup.md](operations/stripe-platform-setup.md)                               | Reference | Stripe Platform Setup — Operator Runbook (Richard)                                 |
| [operations/stripe-treasurer-guide.md](operations/stripe-treasurer-guide.md)                             | Reference | Stripe Treasurer Guide — Club payout onboarding (share with treasurers)            |
| [operations/supabase-auth-email.md](operations/supabase-auth-email.md)                                   | Reference | Supabase Auth Email — Resend, Rate Limits & Manual Confirmation                    |

### future/ — parked backlog

| Doc                                                        | Status    | Title                               |
| ---------------------------------------------------------- | --------- | ----------------------------------- |
| [future/club-admin.md](future/club-admin.md)               | Reference | Parked: Club Admin Future Features  |
| [future/exhibitor-premium.md](future/exhibitor-premium.md) | Reference | Shipped: Exhibitor Premium Features |

### research/

| Doc                                                                | Status    | Title                                            |
| ------------------------------------------------------------------ | --------- | ------------------------------------------------ |
| [research/remotion-evaluation.md](research/remotion-evaluation.md) | Reference | Remotion Evaluation for myK9Show Tutorial Videos |

### designs/

| Doc                                                            | Status    | Title                                        |
| -------------------------------------------------------------- | --------- | -------------------------------------------- |
| [designs/claude-inspiration.md](designs/claude-inspiration.md) | Reference | Design System Inspired by Claude (Anthropic) |
