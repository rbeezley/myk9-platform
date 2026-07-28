---
name: quality-finding-lifecycle
description: Standardizes finding identity, evidence, P0-P3 severity, deduplication, recurrence, closure proof, Linear drafts, and automation memory across myK9 audits. Use for scheduled audits, QA walks, security reviews, production-readiness reviews, test-coverage reviews, Supabase checks, and weekly findings consolidation.
---

# Quality Finding Lifecycle

Use one evidence contract across every detection and review task. This skill governs finding
handling; the calling audit still owns its domain methodology.

## Required sources

Read `AGENTS.md`, `docs/goals/fall-2026-launch-readiness-scorecard.md`,
`docs/qa/findings.md`, the calling automation's prior memory, relevant recent reports, and current
Linear issues when access is available. Treat secretary/show-day reliability as the tie-breaker.

## Reconcile before creating

Search by workflow, route, object, files, symptom, reproduction, and evidence—not title alone.
Reuse an existing QA, audit, or Linear ID. One underlying defect across roles or viewports is one
finding with a coverage matrix. Create a task-specific stable ID only after deduplication.

Use statuses `new`, `unchanged`, `resolved`, `duplicate`, `rejected`, or `blocked`. Keep product
defects, UX/accessibility findings, security findings, test/harness failures, environment/access
failures, enhancements, and inconclusive signals separate.

## Evidence record

Every finding must contain:

- stable ID, title, classification, status, and detecting task
- baseline SHA; first/last seen; consecutive-run count
- affected role, workflow, route/object/files, and viewport when relevant
- exact sanitized evidence and reproduction; expected versus observed behavior
- user/production impact, confidence, source severity, and canonical P0-P3 severity
- existing QA/Linear/report references, owner when known, next action, and closure proof

A skipped, blocked, or contaminated check is a coverage gap—not a pass. Never expose credentials,
tokens, PII, connection strings, or unsafe production details.

## Canonical launch severity

Assign impact using the scorecard, not the source label:

- **P0:** data loss, security exposure, payment failure, score/result corruption, or show-day outage.
- **P1:** a launch-scope golden path needs developer help or a brittle workaround to finish.
- **P2:** important friction, confusion, poor recovery, missing state, or incomplete verification.
- **P3:** polish, copy, speed, convenience, or post-launch improvement.

Preserve the source label separately. Do not mechanically map CRITICAL→P0 or High→P1. With
incomplete evidence, use the lowest supported severity, mark confidence low, and name the proof
that could change it.

## Recurrence and closure

Promote repeated confirmed evidence instead of reporting it as new. Highlight reproduction by two
tasks or two consecutive runs. A merge alone is not resolution: require the stated passing test and
the risk-appropriate browser, staging/live, SQL, exploit-path, or operational replay. Mark
`resolved` only when that proof passes; use `blocked` when the proof could not run.

## Linear gate

Prepare Linear-ready drafts for confirmed non-duplicate P0/P1 findings. Include problem, impact,
evidence, reproduction, expected behavior, acceptance criteria, verification, affected scope, and
suggested priority. Put recurring P2 findings in an optional-triage section; keep other P2/P3 items
report-only. Request one batch approval before any Linear create/update/close. Preserve unapproved
drafts in the report and memory.

## Output and memory

Report counts by status, canonical severity, and classification; ranked findings; transitions;
existing references; pending approvals; blocked coverage; and confidence. End memory with a compact
ledger, one finding per entry:

`ID | P# | source severity | status | first/last seen | runs | owner | evidence | next proof`

Example invocation: “Use `quality-finding-lifecycle` while performing the weekly test audit.”
