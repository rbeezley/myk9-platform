---
name: launch-readiness-triage
description: Converts myK9 audit findings into daily P0/P1 response, Friday P0-P3 consolidation, remediation priorities, and evidence-based stability decisions. Use for daily critical-finding review, the Friday Weekly Quality Findings Review, scorecard reconciliation, or launch-readiness decisions.
---

# Launch Readiness Triage

Use `quality-finding-lifecycle` as the finding contract. This skill coordinates existing evidence;
it does not rerun every audit or manufacture backlog.

## Sources

Read `AGENTS.md`, the fall-2026 goal and scorecard, the go-live runbook, `docs/qa/findings.md`,
current Linear issues, current main history, and every detection automation's current memory.
Record missing, partial, failed, and stale inputs.

Read Linear with `includeArchived: true`. Closure proof and duplicate-merge both depend on seeing
issues that are already Done, and on the free tier those are archived and absent from a default
`list_issues` result — an unflagged query silently narrows the evidence base to open work only
(`docs/agents/issue-tracker.md` § Querying).

## Daily mode

1. Reconcile each new serious signal with existing findings and issues.
2. Validate the evidence and assign canonical P0-P3 impact.
3. Treat a credible P0 as stop-the-line: contain exposure and begin remediation immediately.
4. Triage a credible P1 the same day; give it an owner, next proof, and next implementation slot.
5. Reject or merge false positives and duplicates with evidence.
6. Do not wait for Friday to address P0/P1 findings.

“Address” means validate, classify, contain when necessary, assign ownership, and start the
response. It does not require every P1 fix to finish that day.

## Friday mode

1. Merge duplicate findings across tasks while preserving every source.
2. Preserve source severity and translate demonstrated impact into P0-P3.
3. Reconcile new, recurring, resolved, rejected, duplicate, and blocked findings.
4. Prepare one approval inbox: P0/P1 creates or updates, recurring P2 optional triage, and proven
   closure candidates.
5. Select roughly one to three highest-impact, PR-sized remediation slices. Use Linear as the
   execution contract; use OPSX for non-trivial or coherent multi-finding changes.
6. Reconcile each scorecard dimension and all nine go-live gates against current evidence.

Do not let P3 polish displace launch risk. Do not treat a passing test alone as production
readiness or a code merge alone as closure.

## Stability decision

The stability window passes after four consecutive Friday cycles with:

- no new or reopened confirmed P0/P1
- every critical check completed; no critical blocked or unknown coverage
- prior P0/P1 closure proof still passing
- every remaining P2 understood, owned, scheduled, or explicitly accepted
- the serious-finding backlog not growing

An audit can be clean while reporting bounded P2/P3 opportunities. A significant payment, auth,
RLS, replication/offline, scoring, or results change restarts the window for the affected
scorecard dimension, not automatically the whole product.

## Shared-system gate

Request one batch approval before creating, updating, or closing Linear issues. Do not modify code,
open PRs, or mutate other shared systems during triage.

## Output

Return: pilot confidence and trend; P0-P3 dashboard; P0/P1 details; transitions; severity-translation
table; approval inbox; stale/unowned work; automation coverage; scorecard/gate state; top actions;
stability-window count; and verification limits. Save the reconciled baseline in automation memory.

Example invocation: “Use `launch-readiness-triage` in Friday mode.”
