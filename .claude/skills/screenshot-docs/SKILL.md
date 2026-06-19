---
name: screenshot-docs
description: Capture documentation screenshots and write or update user guides for myk9-platform. Use when the user wants to take screenshots, write a new user guide (judge, secretary, exhibitor, club admin), update an existing guide, regenerate stale images, or add shots to the shot list. Knows the guide structure, writing style rules, status lifecycle, seeded accounts, viewport sizes, and app-specific UI quirks.
---

# Documentation: Guides and Screenshots

## Two modes — pick the right starting point

| Task | Start here |
|---|---|
| Write a new guide from scratch | [references/guide-authoring.md](references/guide-authoring.md) |
| Capture missing or stale screenshots | [Quick start below](#screenshot-capture-quick-start) |
| Add shots to a guide already in progress | Both — authoring for placeholders, capture for the PNGs |

---

## Screenshot capture quick start

```
1. Read docs/training/screenshot-shot-list.md → find rows with status `ready`
2. Cross-check against docs/screenshots/ for missing PNGs
3. Write a Playwright Node.js script (use scripts/template.js as base)
4. Run: node /tmp/myk9-shots/<script>.js
5. Copy PNGs → docs/screenshots/<ID>.png
6. Update shot list status → `ready`
7. Embed in guide: ![alt](../screenshots/<ID>.png)
```

Commit (screenshots + guide updates = docs-only → direct to main):
```bash
git add docs/screenshots/<ID>.png docs/user-guides/<guide>.md docs/training/screenshot-shot-list.md
MYK9_ALLOW_PRIMARY_COMMIT=1 git commit -m "docs: add <ID> screenshot — <description>"
git push
```

## App-specific Playwright patterns

See [references/app-patterns.md](references/app-patterns.md) for:
- Sign-in (`#credential` → Enter → password — not `input[type="email"]`)
- Sidebar overlay workaround (`page.evaluate(el => el.click(), el)`)
- Add Member dialog (custom `fixed inset-0 z-50` div, input `#member-search`, filter "e2e")
- Post-navigation settle pattern

## Seeded accounts, viewports, show ID

See [references/shot-list.md](references/shot-list.md).

## Sensitive content rule

All screenshots must use seeded fixture accounts only. Filter member searches to "e2e" to avoid real-user PII. If staging shows any real account, re-seed before shooting.

## References

- [Guide authoring — anatomy, status, placeholders, registration](references/guide-authoring.md)
- [App patterns — sign-in, sidebar, dialogs](references/app-patterns.md)
- [Shot list — accounts, viewports, show ID](references/shot-list.md)
- [Base Playwright script template](scripts/template.js)
