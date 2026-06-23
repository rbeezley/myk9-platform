# Diagrams

> **Status:** Active

Source and exports for **user-facing** documentation diagrams (flowcharts of user workflows). Supports [`2026-06-12-user-documentation-support-plan.md`](../plans/2026-06-12-user-documentation-support-plan.md) Task 18a.

## What lives here

| File | Role |
|---|---|
| [`diagram-conventions.md`](diagram-conventions.md) | The visual-language rulebook — read this before drawing |
| `myk9-docs.json` | The shared draw.io style preset (source of truth; install with the command below) |
| `<workflow>.drawio` / `<workflow>.json` | Per-diagram **source** — edit these, never the export |
| `<workflow>.svg` | Exported diagram embedded in guides/KB/decks (SVG = crisp at any zoom, tiny files) |

## Setup (once per machine)

The draw.io desktop CLI must be installed (`brew install --cask drawio`; optional `brew install graphviz` for auto-layout). Then install the style preset:

```bash
cp docs/diagrams/myk9-docs.json ~/.drawio-skill/styles/myk9-docs.json
```

## Regenerating a diagram

Edit the source, then re-export to SVG. **Always** keep the source in the repo and re-export — never hand-edit an `.svg`.

```bash
# Hand-placed source (.drawio) → SVG (editable embedded XML)
drawio -x -f svg -e -o docs/diagrams/<workflow>.svg docs/diagrams/<workflow>.drawio

# Graph-described source (.json) → .drawio via Graphviz auto-layout, then → SVG
python3 ~/.claude/skills/drawio-skill/scripts/autolayout.py docs/diagrams/<workflow>.json -o docs/diagrams/<workflow>.drawio --mono
drawio -x -f svg -e -o docs/diagrams/<workflow>.svg docs/diagrams/<workflow>.drawio
```

When asking the draw.io skill to (re)build one, say **"use my `myk9-docs` style"** so it applies the shared preset.

## Diagram index

Status values match the plan: `qa-draft` (disposable, drawn during development), `draft-ready`, `verified` (gated like screenshots — flow stable, labels confirmed). One diagram = one task or question; keep each to ≤ ~12 nodes.

| Diagram | Audience | Serves | Source | Status |
|---|---|---|---|---|
| Exhibitor entry flow | Exhibitor | Exhibitor Guide § 1–4; KB: enter-a-show; Overview Deck slide 10; Exhibitor Deck slide 3 | `exhibitor-entry-flow.drawio` | `qa-draft` — candidate |
| Entry lifecycle | Exhibitor, Secretary | Exhibitor Guide § 5; Secretary Guide § 4; KB: entry-status; Exhibitor Deck slide 4 | `entry-lifecycle.drawio` | `qa-draft` — candidate |
| Secretary setup flow | Secretary | Secretary Guide § 2–3; Overview Deck slide 5; Secretary Deck slide 3 | `secretary-setup-flow.drawio` | `qa-draft` — candidate |
| Secretary show-day flow | Secretary | Secretary Guide § 7; Overview Deck slide 8; Secretary Deck slides 5–6 | `secretary-show-day-flow.drawio` | `qa-draft` — candidate |
| Payment flow | Exhibitor, Club | Club Admin Guide § 4–5; KB: payout-timing; Overview Deck slides 14–15; Club Deck slides 5–6 | `payment-flow.drawio` | `blocked: Stripe live-mode pending` |
| At-show access paths | Judge, Steward | Quickstart § 1; Overview Deck slide 12; Judge/Steward Deck slide 2 | `at-show-access-paths.drawio` | `qa-draft` — candidate (unblocked 2026-06-23: `unified_ringside_enabled` flag removed — see [`../plan-remove-unified-ringside-flag.md`](../plan-remove-unified-ringside-flag.md)) |
| Support triage flow | Support operator | Show-day triage outline; investigation cookbook | `support-triage-flow.drawio` | `qa-draft` — candidate |

## Rules (summary — full detail in `diagram-conventions.md`)

- User language only — no routes, stores, components, or flag names.
- Apply the `myk9-docs` preset; never rely on color alone (labels carry meaning).
- Draft early as a UX-audit instrument; finalize only when the flow is stable (Phase 0 gate).
- Public repo — no PII, secrets, or internal-only detail in any export.
