# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary (entities, terminology: Entry, Trial, Class, etc.). Single-context repo; there is no `CONTEXT-MAP.md`.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`docs/INTENT.md`** — required before any UX-facing change (new page, sheet, dialog, affordance, or edit to existing user-facing flow). Defines the emotional intent per role (secretary "that was easy", judge "invisible technology", etc.), design guardrails, and the `// INTENT:` comment convention. If code carries an `// INTENT:` comment, do not remove or change the described behavior without explicit approval.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront.

## File structure

```
/
├── CONTEXT.md          ← domain glossary (entities, terminology)
├── docs/
│   ├── INTENT.md       ← emotional/UX intent per role, design guardrails
│   └── adr/
│       ├── 0001-....md
│       └── 0002-....md
└── src/ (apps/, packages/)
```

This is a pnpm monorepo (`apps/*`, `packages/*`) but domain docs stay single-context at the root — the glossary and intent doc apply platform-wide, not per-package.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## Flag INTENT conflicts

If your output would change behavior described in `docs/INTENT.md` or remove/alter code behind an `// INTENT:` comment, surface it explicitly and get approval first — don't silently "improve" it away.
