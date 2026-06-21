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

---

## Index

### Root — plans & playbooks

| Doc                                                                                        | Status    | Title                                                                 |
| ------------------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------- |
| [DEFERRED-WORK.md](DEFERRED-WORK.md)                                                       | Reference | Deferred Work Items                                                   |
| [INTENT.md](INTENT.md)                                                                     | Reference | myK9 Platform Intent Document                                         |
| [ai-ux-adaptation.md](ai-ux-adaptation.md)                                                 | Reference | myK9 Adaptation Notes — "4 AI UX Prompts" Guide                       |
| [codex-review-playbook.md](codex-review-playbook.md)                                       | Reference | Codex review playbook                                                 |
| [feature-audit-2026.md](feature-audit-2026.md)                                             | Reference | Feature Audit — Fall 2026                                             |
| [ia-review-entry-status-surfaces.md](ia-review-entry-status-surfaces.md)                   | Active    | IA Review: Entry-Status Surfaces (cross-role)                         |
| [launch-milestone-qa-checklist.md](launch-milestone-qa-checklist.md)                       | Reference | Launch-Milestone QA Checklist                                         |
| [navigation-ia.md](navigation-ia.md)                                                       | Reference | Navigation & IA Sketch — Fall 2026                                    |
| [plan-active-docs-triage-2026-06-14.md](plan-active-docs-triage-2026-06-14.md)             | Active    | Active-Docs Triage — 2026-06-14                                       |
| [plan-admin-payout-ledger-platform-fee.md](plan-admin-payout-ledger-platform-fee.md)       | Active    | Admin Payout Ledger + Platform Fee Setting                            |
| [plan-architecture-deepening.md](plan-architecture-deepening.md)                           | Active    | Architecture Deepening Plan                                           |
| [plan-atshow-ringside-writes.md](plan-atshow-ringside-writes.md)                           | Active    | At-Show Ringside — wire deferred writes + judge/steward write authz   |
| [plan-block-person-delete-owns-dogs.md](plan-block-person-delete-owns-dogs.md)             | Active    | Block deleting a person who still owns dogs                           |
| [plan-class-status-auto-derivation.md](plan-class-status-auto-derivation.md)               | Active    | Plan — Class Status Auto-Derivation (Stub)                            |
| [plan-data-access-module-drift.md](plan-data-access-module-drift.md)                       | Active    | Data Access Module Drift Plan                                         |
| [plan-dynamic-qa-infrastructure.md](plan-dynamic-qa-infrastructure.md)                     | Complete  | Plan: Dynamic QA Infrastructure (follow-on to the Code-Quality Audit) |
| [plan-entry-management-layout.md](plan-entry-management-layout.md)                         | Active    | Entry Management Layout Plan                                          |
| [plan-entry-draw-lottery.md](plan-entry-draw-lottery.md)                                   | Active    | Entry Draw / Lottery — random-draw intake (depends on payment plan)   |
| [plan-entry-payment-request.md](plan-entry-payment-request.md)                             | Active    | Entry Payment, Waitlist & Capacity (links, pay-to-claim, judge-day)   |
| [plan-landing-hero-lcp-prerender.md](plan-landing-hero-lcp-prerender.md)                   | Active    | Landing-page mobile LCP — prerender + hydrate the hero                |
| [plan-lane-2-2-entry-multiselect.md](plan-lane-2-2-entry-multiselect.md)                   | Active    | Plan: Lane 2.2 — Entry Management checkbox multi-select               |
| [plan-launch-execution-lanes.md](plan-launch-execution-lanes.md)                           | Active    | Plan: Fall Launch — Execution Lanes (canonical to-do)                 |
| [plan-public-results-release-gate.md](plan-public-results-release-gate.md)                 | Active    | Plan: Server-side gate for public/anon scored results                 |
| [plan-restore-ui-remediation.md](plan-restore-ui-remediation.md)                           | Active    | Plan: Fix the Deleted Entities (restore) UI                           |
| [plan-result-reveal-share-card.md](plan-result-reveal-share-card.md)                       | Active    | Plan: Result Reveal + Share Card                                      |
| [plan-show-day-sequencing.md](plan-show-day-sequencing.md)                                 | Active    | Plan — Show-Day Workflow Sequencing                                   |
| [plan-soft-delete-person-rpc.md](plan-soft-delete-person-rpc.md)                           | Active    | Plan: Fix person soft-delete (RLS WITH-CHECK block)                   |
| [plan-ux-journey-audit.md](plan-ux-journey-audit.md)                                       | Active    | Plan: UX Journey Audit — Exhibitor & Secretary                        |
| [plan-ux-journey-phase6.md](plan-ux-journey-phase6.md)                                     | Active    | Plan: UX Journey Audit — Phase 6 (Remediation Verification)           |
| [plan-wave1-exhibitor-entry-payment-trust.md](plan-wave1-exhibitor-entry-payment-trust.md) | Active    | Wave 1 Exhibitor Entry And Payment Trust Implementation Plan          |
| [plan-wave3a-at-show-phone-polish.md](plan-wave3a-at-show-phone-polish.md)                 | Active    | Wave 3A At-Show Phone Polish Plan                                     |
| [plan-wave3b-results-my-shows-clarity.md](plan-wave3b-results-my-shows-clarity.md)         | Active    | Wave 3B Results and My Shows Clarity Plan                             |
| [playbook-impeccable-page-improvements.md](playbook-impeccable-page-improvements.md)       | Reference | Impeccable Page-Improvement Playbook                                  |

### plans/ — feature & phase plans

| Doc                                                                                                          | Status    | Title                                                         |
| ------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------- |
| [plans/2026-06-12-user-documentation-support-plan.md](plans/2026-06-12-user-documentation-support-plan.md)   | Active    | User Documentation and Support Materials Implementation Plan  |
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

| Doc                                                                                                              | Status    | Title                              |
| ---------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------- |
| [audits/2026-06-code-quality/08-config-flag-debt.md](audits/2026-06-code-quality/08-config-flag-debt.md)         | Active    | 08 Config And Flag Debt            |
| [audits/2026-06-code-quality/09-phase-2-verification.md](audits/2026-06-code-quality/09-phase-2-verification.md) | Active    | 09 Phase 2 Verification            |
| [audits/2026-06-code-quality/README.md](audits/2026-06-code-quality/README.md)                                   | Reference | Code-Quality Audit Run             |
| [audits/2026-06-code-quality/SUMMARY.md](audits/2026-06-code-quality/SUMMARY.md)                                 | Active    | Code-Quality Audit Summary         |
| [audits/2026-06-proactive-qa/db-advisors.md](audits/2026-06-proactive-qa/db-advisors.md)                         | Active    | Database Drift Checks — 2026-06-12 |
| [audits/2026-06-ux-journeys/00-recon.md](audits/2026-06-ux-journeys/00-recon.md)                                 | Reference | UX Journey Audit Recon             |
| [audits/2026-06-ux-journeys/01-exhibitor-journey.md](audits/2026-06-ux-journeys/01-exhibitor-journey.md)         | Active    | UX Audit: Exhibitor Journey        |
| [audits/2026-06-ux-journeys/02-secretary-journey.md](audits/2026-06-ux-journeys/02-secretary-journey.md)         | Active    | UX Audit: Secretary Journey        |
| [audits/2026-06-ux-journeys/03-cross-role-seams.md](audits/2026-06-ux-journeys/03-cross-role-seams.md)           | Active    | UX Audit: Cross-Role Seams         |
| [audits/2026-06-ux-journeys/SUMMARY.md](audits/2026-06-ux-journeys/SUMMARY.md)                                   | Active    | UX Journey Audit Summary           |
| [audits/REVIEW.md](audits/REVIEW.md)                                                                             | Reference | Code Review Guidelines             |

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

| Doc                                        | Status    | Title                                         |
| ------------------------------------------ | --------- | --------------------------------------------- |
| [roles/admin.md](roles/admin.md)           | Reference | Role: Site Admin                              |
| [roles/club-admin.md](roles/club-admin.md) | Reference | Role: Club Admin                              |
| [roles/exhibitor.md](roles/exhibitor.md)   | Reference | Role: Exhibitor                               |
| [roles/judge.md](roles/judge.md)           | Reference | Role: Judge (stub — deferred for fall 2026)   |
| [roles/secretary.md](roles/secretary.md)   | Reference | Role: Secretary                               |
| [roles/steward.md](roles/steward.md)       | Reference | Role: Steward (stub — deferred for fall 2026) |

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

| Doc                                                                          | Status    | Title                                                                   |
| ---------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| [operations/stripe-platform-setup.md](operations/stripe-platform-setup.md)   | Reference | Stripe Platform Setup — Operator Runbook (Richard)                      |
| [operations/stripe-treasurer-guide.md](operations/stripe-treasurer-guide.md) | Reference | Stripe Treasurer Guide — Club payout onboarding (share with treasurers) |
| [operations/supabase-auth-email.md](operations/supabase-auth-email.md)       | Reference | Supabase Auth Email — Resend, Rate Limits & Manual Confirmation         |

### future/ — parked backlog

| Doc                                                        | Status    | Title                              |
| ---------------------------------------------------------- | --------- | ---------------------------------- |
| [future/club-admin.md](future/club-admin.md)               | Reference | Parked: Club Admin Future Features |
| [future/exhibitor-premium.md](future/exhibitor-premium.md) | Reference | Parked: Exhibitor Premium Features |

### research/

| Doc                                                                | Status    | Title                                            |
| ------------------------------------------------------------------ | --------- | ------------------------------------------------ |
| [research/remotion-evaluation.md](research/remotion-evaluation.md) | Reference | Remotion Evaluation for myK9Show Tutorial Videos |

### designs/

| Doc                                                            | Status    | Title                                        |
| -------------------------------------------------------------- | --------- | -------------------------------------------- |
| [designs/claude-inspiration.md](designs/claude-inspiration.md) | Reference | Design System Inspired by Claude (Anthropic) |
