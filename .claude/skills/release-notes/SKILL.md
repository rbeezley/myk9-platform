---
name: release-notes
description: "Use when asked to write a changelog, release notes, 'what shipped this week/month', a launch announcement digest, or an update post for the docs site covering recently merged work."
user-invocable: true
argument-hint: "[since-date | since-tag | last week]"
---

# Release Notes

Turn merged PRs into a human-readable changelog. Audience is dog-show secretaries, exhibitors, and judges — largely retired, non-technical. Write for them, not for engineers.

## Gather

```bash
gh pr list --state merged --base main --limit 200 \
  --json number,title,mergedAt,labels,url \
  --search "merged:>=<SINCE>"
```

Group by conventional-commit prefix in the title (`feat`, `fix`, `perf`, `docs`, `chore`). Drop `chore`, `ci`, internal `docs`, and refactors with no visible behavior change entirely — a shorter list users fully read beats a complete list they skim.

## Write

- One line per change, plain English, benefit-first: "You can now print armband labels from the class sheet" — not "feat(labels): add armband label mutation".
- Sections in this order: **New**, **Improved**, **Fixed**. No emojis (project policy; celebratory UI is the only exception and this isn't it).
- Name the role that benefits when it isn't obvious ("Secretaries: ...").
- Never call anything "battle-tested" or "proven" pre-launch — use "tested".
- Follow `writing-concisely`.

## Publish

- Save to `docs/releases/<YYYY-MM-DD>.md` and add a row to `docs/README.md`.
- If the docs site (`apps/docs`, Astro) has a changelog section, add the entry there too — same content, don't fork the wording.
- Docs-only commits may go direct to `main` per CLAUDE.md scope rules.
