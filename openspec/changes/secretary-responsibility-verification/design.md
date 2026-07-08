## Context

`docs/roles/secretary-responsibility-coverage.md` is the current responsibility matrix for the fall 2026 secretary role. It intentionally says that many rows are not a fresh code audit. The next step is to convert that snapshot into a repeatable verification and remediation plan.

The plan must protect the current consolidation phase: first find the canonical route, helper, report, mutation, or replicated data path that already exists. Only after that evidence pass should we propose new surfaces.

## Goals / Non-Goals

**Goals:**

- Create a saved plan that verifies every secretary responsibility row against the actual codebase and current workflow evidence.
- Define a consistent evidence standard for routes, reports, tests, data paths, offline behavior, print behavior, and manual/rehearsal proof.
- Prioritize remediation by fall 2026 secretary/show-day risk.
- Keep AKC Scent Work row 7 as completed implementation evidence while still tracking launch verification.
- Make later implementation slices small enough to ship through focused OpenSpec changes or PRs.

**Non-Goals:**

- Do not build new UX, reports, migrations, or registry integrations in this planning change.
- Do not duplicate existing routes just to create faster secretary access; prefer links, deep links, or consolidation when remediation is later needed.
- Do not mark rows Covered because a route exists without workflow, test, or operator evidence.
- Do not audit club-admin, treasurer, site-admin, or post-fall multi-secretary duties beyond the secretary scope already defined.

## Decisions

- Use row IDs in the verification plan.
  - Rationale: stable IDs let future PRs, tests, and OpenSpec changes cite `S7.1` or `S9.2` without rephrasing the responsibility.
  - Alternative considered: use only section titles and prose. That is easier to write, but harder to track through remediation.

- Treat verification and remediation as separate states.
  - Rationale: a row can be code-complete but still lack printer evidence, offline rehearsal, or real-user proof.
  - Alternative considered: collapse everything into Covered/Partial/Gap. That hides the difference between an implementation gap and an evidence gap.

- Require each verification batch to answer the duplication question before proposing UI.
  - Rationale: the repo is in consolidate-first mode, and secretary reliability improves when existing surfaces become clearer rather than multiplying.
  - Alternative considered: build missing controls wherever the row is discovered. That risks fragmenting the secretary workflow.

- Preserve offline-first scrutiny for show-day responsibilities.
  - Rationale: show-day desk, move-ups, late entries, scoring, and recovery must survive unreliable venue internet.
  - Alternative considered: rely on happy-path online route evidence. That is insufficient for fall launch.

## Risks / Trade-offs

- Plan becomes too broad to execute -> Mitigation: group rows into small verification batches and turn only proven gaps into scoped remediation plans.
- Code search finds route names but not workflow truth -> Mitigation: require focused tests, walkthroughs, seeded fixtures, or manual evidence before marking Covered.
- Registry paperwork changes before launch -> Mitigation: keep registry-specific form verification as launch evidence even when implementation is currently wired.
- Later remediation adds duplicate surfaces -> Mitigation: every remediation slice must answer whether it duplicates an existing page and why a link is not enough.
