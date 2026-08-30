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

| #   | Pattern                                                                                                                                                                                                                                               | Source                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | **A repeated fact is hoisted, not printed per row.** When every row in a list agrees on a fact (trial date, trial number, handler), state it once above the list; a row prints its own copy only when it differs from the group.                      | 2026-08-29 My Shows card |
| 2   | **A disclosure toggle is named for its contents and carries their count** (`Entered Classes (3)`), never a generic "Show details". The count in the label replaces any separate counter inside the panel.                                             | 2026-08-29 My Shows card |
| 3   | **On a card grouping several subjects, each subject's identity appears exactly once**, in the always-visible band — expanding adds actions and detail, never a second copy of the name/armband.                                                       | 2026-08-29 My Shows card |
| 4   | **A card states its status once.** One badge carries it; no title icon restating the same status, and no prose line that only repeats the badge's word. A status line earns its place only by adding a count, a date, or a duration the badge cannot. | 2026-08-29 My Shows card |

**When a new decision contradicts a pattern in force, that is a stop-and-surface,
not a silent overwrite.** Either the new page is a genuine exception (record it
as one, with the reason) or the pattern was wrong and needs revising everywhere
it already shipped — which is a repo-wide task, not a page task. An agent must
never resolve that conflict on its own.

## Decision log

Append one row per Phase 2.5 run. Never edit or delete a row; supersede it with
a later row and note which one it replaces.

| Date       | Page                                     | PR  | Structural finding                                                                                                                                                                                                                             | Pattern chosen                                                                                                                                                                                                                                                                                                                                | Alternatives rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Canvas                                                                         |
| ---------- | ---------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 2026-08-29 | My Shows entry card `/exhibitor/entries` | [#1862](https://github.com/rbeezley/myk9-platform/pull/1862) | Critique #4/#5/#6/#7/#11 — a single-dog, single-trial, 3-class order renders the trial date 4×, the trial number 3×, the handler 3×, and the class count twice before listing the classes; multi-dog orders print each armband and name twice. | **Option B — "Classes on the face."** The always-visible band gains one line per dog naming that dog's classes, so "what is my dog entered in?" is answered without opening anything; the panel stays collapsed by default and is labelled `Entered Classes (N)`. Repeated per-row facts hoist to one line; each dog's identity appears once. | **Option A (hoisted facts only)** — same de-duplication but classes stay behind a click; rejected because the dispatcher's stated need was to _see_ the classes per dog. **Option C (subtractive)** — card cut to identity + one action, roughly half the resting height; rejected because it moves venue and entry deadline behind a click, and an exhibitor scanning to decide where to drive on Saturday needs those on the face. Density lost to information the exhibitor actually reads. | [Canvas](https://claude.ai/code/artifact/9dba1ee2-2722-46e7-90e7-5526a278248b) |

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
