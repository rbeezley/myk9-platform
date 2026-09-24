---
name: UX-Audit
description: "Required methodology for UX and Information Architecture reviews of existing UI. Default mode is a 6-pass diagnostic (mental model, IA, affordances, cognitive load, state coverage, flow integrity); `--ia` is a deeper structural audit of navigation, routes, tabs and panels that ends in a phased remediation plan. Both write a severity-rated findings document. You MUST read and follow this skill before any UX audit, UX review, IA review, usability analysis, or UI evaluation. Trigger words: 'review the UX', 'audit this page', 'UX issues', 'usability check', 'what's wrong with this UI', 'this feels off', 'users are confused', 'check edge cases', 'prepare for user testing', 'IA review', 'audit the IA', 'this section feels spread out', 'feels disconnected', 'why are there 3 places to do this', 'navigation feels off', 'consolidate routes', 'route audit'."
argument-hint: '[--ia] <feature, page, or role surface>'
---

# UX Audit for Existing Projects

Evaluate an existing UI against UX foundations and write the findings to a file. Two modes, each with its full procedure, scoring and output template in `references/`:

| Mode               | Question it answers                                                                                                                      | Reference                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| six-pass (default) | What UX debt does this feature or page carry? Six passes: mental model, IA, affordances, cognitive load, state coverage, flow integrity. | `references/six-pass.md`  |
| `--ia`             | Why does this surface feel spread out? Route audit, task walk, mental-model check, duplication scan, scoring, phased remediation plan.   | `references/ia-review.md` |

**Core principle:** don't assume existing UI is "fine because it works." Surface hidden UX debt before it compounds.

## Choosing a mode

- The ask names a page or feature, or says "feels off", "users are confused", "check edge cases" → six-pass.
- The ask says "spread out", "disconnected", "where do I do X", "3 places to do this", or names routes/tabs/navigation → `--ia`.
- Unsure → run six-pass. If its Pass 2 surfaces 3+ IA findings or any Critical/High IA issue, follow up with `--ia` on the same surface.

Read the matching reference in full before starting. Do not blend the two procedures in one document; the IA review's remediation plan is its own artifact.

## Before you begin (both modes)

1. **Read intent.** Read `docs/INTENT.md` and any `// INTENT:` comments in the code under review. A finding that contradicts a deliberate choice is noise — mark it "intentional per INTENT.md", not an issue.
2. **Scope it.** One feature, page or role surface. A deep audit of one flow beats a shallow audit of everything.
3. **Gather sources.** Code (file paths, route definitions, nav config), screenshots, and a live walk when flows matter (`qa-feature` or `playwright-cli`). Combining code and screenshots catches more than either alone.
4. **Write to a file, not the conversation.** `{feature-name}-ux-audit.md` / `{page-name}-ux-audit.md` for six-pass; the IA reference names its own output paths.

## Related skills

| Situation                                                                | Use                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------- |
| One role's end-to-end journey, multi-viewport, diffed against prior runs | `role-journey-ux-audit`                         |
| Console/network errors or broken UI found during the audit               | `audit-pages`                                   |
| Fixing bugs mid-walk and leaving a Playwright spec behind                | `qa-feature`                                    |
| Implementing an approved finding or remediation phase                    | normal flow → `simplify` → `commit` → `ship-pr` |

## Tips

- **Audit as a new user.** If you use the surface a lot, you have compensated for its debt.
- **Say what you see before judging.** "4 tabs, 3 with a Settings section" surfaces redundancy faster than "this feels wrong."
- **Check real data and the sad path.** Empty states, errors and edge cases hide the most.
- **Question "obvious" things.** Obvious to developers is not obvious to users.
