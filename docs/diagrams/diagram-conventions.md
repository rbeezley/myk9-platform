# Diagram Conventions (draw.io)

> **Status:** Active

The single visual language for **user-facing** diagrams in the myK9Show documentation set. Every flowchart in a guide, KB article, or training deck follows these rules so the whole library reads as one product. Authored for the draw.io skill; supports [`2026-06-12-user-documentation-support-plan.md`](../plans/2026-06-12-user-documentation-support-plan.md) Task 18a.

## The one rule that matters most

**Never reuse an engineering diagram as a user diagram.** They are different documents for different readers:

| | Engineering diagram | User diagram |
|---|---|---|
| Speaks in | `setGrant()`, `/at-show/:showId`, `hasPermission('canScore')` | "Enter your passcode → Confirm the show → You're in the ring" |
| Reader | A developer tracing code | A secretary, exhibitor, or volunteer |
| Altitude | Functions, routes, stores, gates | What the person does and sees |

A user diagram obeys the documentation writing-style rules (`docs/user-guides/writing-style.md` — planned in the user-documentation plan, Task 3; not yet written) and [`../INTENT.md`](../INTENT.md) tone **exactly as the prose does**. If a label names a route, a Zustand store, a component, or a feature flag, it is wrong — rewrite it in the words the user would use.

## Labeling rules

- **Steps are verbs the user performs:** "Choose your show", "Add your dog", "Pay the entry fee" — not "POST /entries" or "EntryWizard step 3".
- **Use the exact on-screen names** the user sees (button labels, page titles). If a label can't be used in a plain sentence, that's a product/naming finding — file it to the backlog (per QA-Draft Mode), don't paper over it in the diagram.
- **Decisions are questions:** "Already have an account?", "Paid online?" — phrased so the branches are obvious.
- **Every decision branch is labeled** — "Yes"/"No", or the actual choice ("Pay now" / "Pay at the show").
- **No jargon, no internals:** no schema/table names, route paths, store names, flag names, or HTTP verbs. No `<angle brackets>` in labels (draw.io's `html=1` strips them — use `{curly}` or plain words).
- **Keep it short.** A node label is a phrase, not a sentence. If it needs a sentence, the step is too big — split it.

## Node meanings (myk9-docs palette)

The `myk9-docs` preset maps semantic roles to a warm, calm, brand-aligned palette (clay primary, teal accent, warm neutrals — derived from the app's design tokens). For a **user flowchart**, use these meanings:

| Meaning in a user diagram | Preset role | Look | Shape |
|---|---|---|---|
| Start / end of the flow | `success` | soft green | oval (`ellipse`) |
| A step the user does | `service` (primary) | clay tint | rounded rectangle |
| A decision / question | `warning` | amber | diamond (`rhombus`) |
| A choice of path / handoff to another surface | `gateway` (accent) | teal | rounded rectangle |
| A "can't / blocked / error" state | `error` (danger) | warm red | rounded rectangle |
| A note, or something the system does for them | `external`/`neutral` | warm grey | rounded rectangle (dashed if optional) |
| A sensitive/account step (sign-in, payment identity) | `security` (secondary) | muted plum | rounded rectangle |

Avoid the database cylinder and other engineering shapes in user diagrams — users don't think in databases.

## Layout & size

- **Top-to-bottom (`TB`)** by default; decisions branch left/right and merge back.
- **One diagram = one question or one task.** A user diagram should fit on a screen — aim for **≤ ~12 nodes**. If it sprawls past that, the *workflow* is probably too complex: split the diagram, and file the complexity as a UX finding.
- Always label every branch; keep arrowhead runs ≥ 20px so arrows don't look broken.
- Optional/alternate paths render **dashed** (the preset's `dashedFor` covers `optional`/`alternate`) — label the edge `optional` or `alternate`.

## Accessibility

- **Never rely on color alone** — the label always carries the meaning (a colorblind reader must follow the flow from text). Color is reinforcement, not the signal.
- The palette uses soft fills with strong strokes for high text contrast; keep body font ≥ 13px (the preset default).

## How to apply the preset

The preset lives in the repo as the source of truth and is installed into the draw.io skill's local preset directory.

```bash
# Install / update the preset (run after pulling changes to it)
cp docs/diagrams/myk9-docs.json ~/.drawio-skill/styles/myk9-docs.json
```

Then ask the draw.io skill to use it explicitly — say **"use my `myk9-docs` style"** when requesting a diagram. The preset is intentionally **not** the global default, so engineering/architecture diagrams are unaffected; user-doc diagrams opt in by name.

## Workflow (per the plan)

- **Draft early as a QA instrument.** Drawing a flow you can't draw cleanly *is* the UX audit — file the friction, don't smooth it over. Drafts are `qa-draft` and disposable.
- **Gate the final like a screenshot.** Don't finalize a workflow diagram until that flow's labels and routing are stable (Phase 0 readiness gate).
- **Source in repo, regenerate, never hand-edit an export.** Keep the `.drawio`/JSON next to its `.svg`; if the flow changes, edit the source and re-export. See [`README.md`](README.md) for per-diagram regeneration commands.
- **Public-repo safe.** Exported diagrams are world-readable on merge — no PII, secrets, or internal-only detail (Sensitive Content Rules in the plan).
