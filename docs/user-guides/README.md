# User Guides

Index of all customer-facing guides and their current status. Every guide listed here maps to one or more workflows in [`workflow-source-map.md`](workflow-source-map.md).

**Status values:** `planned` → `source-mapped` → `qa-draft` → `walkthrough-needed` → `draft-ready` → `drafted` → `verified` → `published`

`qa-draft` marks a disposable draft written during development as a testing instrument — it never ships directly to customers. When drafting reveals friction, the **app** changes and the draft is cheerfully rewritten. The arrow always points from app → doc, never the reverse. See the plan's [QA-Draft Mode](../plans/2026-06-12-user-documentation-support-plan.md#qa-draft-mode-documentation-as-a-testing-instrument) section.

**Phase 0 readiness gate** applies to final customer-facing guides with screenshots. Support-operations docs (in `../support/`) are NOT gated here — they depend on the support workflow, not UI stability.

---

## Planned Guides

| Title | Audience | Status | Priority | Notes |
|---|---|---|---|---|
| [Secretary Guide](secretary-guide.md) | Trial secretaries | `qa-draft` | high | Phase 0 gate met (2026-06-19); screenshots pending; § 11 Closeout stub (feature not built) |
| [Exhibitor Guide](exhibitor-guide.md) | Dog exhibitors | `planned` | high | Create after outline passes Phase 0 gate |
| [Ringside Quickstart](judge-steward-quickstart.md) | Judges, stewards | `planned` | medium | Printable; keep short enough to hand out at the gate |
| [Club Admin & Treasurer Guide](club-admin-guide.md) | Club admins, treasurers | `planned` | medium | Gate payment screenshots until sandbox walkthrough is fresh |

## Planned Outlines (safe to draft now — gate only blocks publication with screenshots)

| Title | Status | Source file |
|---|---|---|
| [Secretary Guide Outline](secretary-guide-outline.md) | `qa-draft` | `docs/journeys/secretary.md`, golden path checklist |
| [Exhibitor Guide Outline](exhibitor-guide-outline.md) | `qa-draft` | `docs/journeys/exhibitor.md`, golden path checklist |
| [Ringside Quickstart Outline](judge-steward-quickstart-outline.md) | `qa-draft` | Secretary golden path § Part 6; gated on flag removal |
| [Club Admin Guide Outline](club-admin-guide-outline.md) | `qa-draft` | `docs/roles/club-admin.md`, stripe-treasurer-guide.md |

## Supporting Files

| File | Purpose |
|---|---|
| [workflow-source-map.md](workflow-source-map.md) | Maps user workflows → canonical routes (layered on `pageDirectory.ts`) |
| [writing-style.md](writing-style.md) | Style, tone, and structure rules for all customer-facing docs |
| [documentation-qa-checklist.md](documentation-qa-checklist.md) | Verification checklist for final guides before `verified` status |

---

## Do Not Document Yet

Workflows that are unstable, ungated, or not ready for customer-facing documentation. Do not write final guides for these until they pass the Phase 0 gate.

| Workflow | Reason |
|---|---|
| Stripe live-mode onboarding | Sandbox only; live mode not yet activated |
| Judge scoring / ringside (myK9Show `/at-show`) | At-show exhibitor flow is stable; judge/steward scoring still maturing |
| Public results release (pre-release visibility) | RLS fix for exhibitor self-read of withheld results still open |
| AKC/UKC judge pre-load | Directory not yet imported |

---

## Secretary Role Priority

Per the plan, secretary/show-day documentation is the highest-priority customer-facing track. A first-time secretary should be able to run a complete show using only the secretary guide + the support library. Draft the secretary guide outline first, walk it against the live app, and file every friction finding before moving to the exhibitor guide.
