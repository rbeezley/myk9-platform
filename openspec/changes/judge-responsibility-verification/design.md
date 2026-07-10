## Context

Judges are deliberately not a primary fall 2026 role: no login or dashboard; they score inside the ringside `/at-show` passcode experience. Verification must therefore audit the ringside surface (access gate, class/entry lists, scoresheet, OCC writes, offline durability) plus judge-adjacent secretary artifacts (assignments, schedule reports, official forms) — and nothing more.

## Goals / Non-Goals

**Goals:**

- A coverage matrix and verification plan mirroring the proven secretary pattern.
- J1.2 (judge write permissions via ringside claim) verified before all other rows.
- Shared long-lead gates (offline rehearsal, print hardware) planned as combined secretary+judge events.

**Non-Goals:**

- Any judge portal, notifications, or self-service features (deferred post-fall).
- Steward-specific tooling (volunteer roster covers fall).
- Remediation work — later scoped changes own that.

## Decisions

- **Mirror the secretary artifacts rather than invent a new format.** The two-doc pattern (coverage matrix + verification plan) plus a planning-only OpenSpec change worked end to end; reviewers already know how to read it.
- **Scope rows to fall reality.** 21 rows across 6 sections instead of the secretary's 44 across 9 — the judge's fall surface is genuinely smaller, and padding the matrix would dilute the P0 signal (J1.2).
- **Order J1.2 first.** The historical judge/steward silent RLS write failure is the one row that would be a show-day P0 if still present; the passcode claim authz migration (2026-06-24) plausibly fixed it, but nothing has verified that explicitly.

## Risks / Trade-offs

- [Matrix seeded from stubs and memories may misstate current code] → statuses start conservative (Evidence partial / Potential gap); the inventory sweep corrects them before any remediation is planned.
- [Shared rehearsals could slip if treated as two separate events] → the plan names them as combined secretary+judge gates explicitly.
