# 005 — Publish the judge/steward guide to the docs site

> Written against commit `15897d862` (2026-07-11).

## Why this matters

The Astro docs site (`apps/docs`, separate Vercel project, Root=apps/docs) publishes only three role guides: `apps/docs/src/content/guides/{club-admin,exhibitor,secretary}-guide.md`. But a **written** judge/steward guide already exists at `docs/user-guides/judge-steward-quickstart.md` (with its outline sibling). Judges and stewards are the roles whose INTENT.md target is "invisible / in control" and who are least tolerant of confusing UI — and they currently have no published guide at all. This is the cheapest onboarding gap to close because the copy is already drafted.

## Steps

1. Read `docs/user-guides/judge-steward-quickstart.md` in full, plus one published guide (`apps/docs/src/content/guides/secretary-guide.md`) to learn the site's frontmatter shape, heading conventions, and image-path conventions. Also read `docs/user-guides/writing-style.md` and `documentation-qa-checklist.md` — they are the style authority.
2. Copy/adapt the quickstart into `apps/docs/src/content/guides/judge-steward-guide.md` with matching frontmatter. Adapt only what the site format requires (frontmatter, image paths, internal links); do not rewrite prose.
3. Check how guides are surfaced: grep `apps/docs/src` for how the three existing guides are listed/linked (content collection config, nav component, index page). Add the new guide everywhere its siblings appear — nav, index cards, sitemap — following the exact existing pattern.
4. Images: if the quickstart references screenshots that don't exist under `apps/docs`' asset convention, include the guide with the images it has and list missing shots in your report (the `screenshot-docs` skill owns capturing them — do NOT fabricate or reuse wrong-page screenshots).
5. Build check: `cd apps/docs && pnpm build` — must succeed with the new page emitted. If the site has a dev preview config, verify the page renders and nav link works.

## Out of scope

- Writing a site-admin guide (separate authoring effort — note it as still-missing in your report). Restyling existing guides. Screenshot capture.

## Done criteria

- `apps/docs/src/content/guides/judge-steward-guide.md` exists, follows sibling frontmatter, is reachable from the same nav/index surfaces as the other three guides.
- `cd apps/docs && pnpm build` green. Root `pnpm lint` green (if the docs app is lint-covered).

## Maintenance note

`docs/user-guides/` is the authoring source; `apps/docs/src/content/guides/` is the published copy — when either updates, the other must be synced (note the pair in your PR description so reviewers learn the convention).
