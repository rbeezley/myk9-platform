# Impeccable — structural decision ledger

Append-only record of every **Phase 2.5** decision made by the
[Impeccable Page-Improvement Playbook](../playbook-impeccable-page-improvements.md).

## Why this file exists

The playbook's mechanical passes (`colorize`, `typeset`, `layout`, `polish`)
converge, because every one of them reads [`DESIGN.md`](../../DESIGN.md) first
and pulls each page toward the same tokens. Phase 2.5 does not converge on its
own: it is a structural judgment made by looking at one page in isolation, and
`DESIGN.md` has no layout or IA pattern vocabulary to conform to — its six
sections cover color, type, elevation, component styling, and do/don't, not
page structure.

Without a shared record, page 4 gets a two-column layout with actions in an
overflow menu and page 9, three weeks later, gets tabs with inline buttons.
Both are defensible in isolation, both get approved, and neither run ever sees
the other. This file is the memory that makes the second decision aware of the
first.

**Why not a `DESIGN.md` section 7.** `DESIGN.md` is a generated artifact — it
carries a large YAML frontmatter token block and has been regenerated wholesale
(PR #659). A section appended by hand would be wiped by the next regeneration,
and page-structure prose does not fit the token schema. Keeping the ledger as a
sibling also means appending to it is not the banned `document` / `extract`
work: those commands rewrite the design system, this file only accumulates
decisions about it.

---

## Patterns in force

The distilled rules. **This is the section Phase 2.5 step 13a reads** — a new
canvas conforms to these, not to twelve rows of history. Keep each entry to one
sentence plus the decision it came from.

| #                                                 | Pattern | Source |
| ------------------------------------------------- | ------- | ------ |
| _(none yet — first Phase 2.5 run populates this)_ |         |        |

**When a new decision contradicts a pattern in force, that is a stop-and-surface,
not a silent overwrite.** Either the new page is a genuine exception (record it
as one, with the reason) or the pattern was wrong and needs revising everywhere
it already shipped — which is a repo-wide task, not a page task. An agent must
never resolve that conflict on its own.

## Decision log

Append one row per Phase 2.5 run. Never edit or delete a row; supersede it with
a later row and note which one it replaces.

| Date      | Page | PR  | Structural finding | Pattern chosen | Alternatives rejected | Canvas |
| --------- | ---- | --- | ------------------ | -------------- | --------------------- | ------ |
| _(empty)_ |      |     |                    |                |                       |        |

Column notes:

- **Structural finding** — the finding from the merged Phase 1 table that
  triggered the gate, not a summary of the fix.
- **Pattern chosen** — which artboard won, described as a reusable rule rather
  than as "artboard 2".
- **Alternatives rejected** — including the mandatory subtractive option, and
  one clause on why it lost. A subtractive option that keeps losing for the same
  reason is itself a finding worth surfacing.
- **Canvas** — the published Artifact URL, so the next run can open the actual
  artboards rather than re-deriving them from prose.
