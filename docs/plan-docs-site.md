# Plan: myK9Show Guides — public docs site

> **Status:** Active

A beautiful, branded, public-facing documentation site that renders the existing
role guides (`docs/user-guides/*-guide.md`) and screenshots (`docs/screenshots/`)
so a non-author reviewer — and eventually customers — can read them on the web.

## Goals
- Render the three ready guides (exhibitor, secretary, club-admin) in the warm
  myK9Show brand (terracotta / cream / sage), matching the approved prototypes.
- Source of truth stays `docs/user-guides/*.md` — editing words never touches design.
- Static site, hosted on the existing Vercel account (no new cost).
- Mobile responsive.

## Stack
- **Astro** (static output) — content-driven, markdown-native, free, Vercel-friendly.
- Lives at `apps/docs` in the monorepo (workspace already globs `apps/*`).

## Architecture
- **Prebuild step** (`scripts/prepare-content.mjs`): copies `docs/user-guides/*-guide.md`
  → `src/content/guides/` (rewriting `../screenshots/` → `/screenshots/` and stripping
  internal "Screenshot Checklist" sections), and `docs/screenshots/*` → `public/screenshots/`.
  Both copy targets are gitignored build artifacts; `docs/` remains the source of truth.
- **Content collection** reads `src/content/guides/`.
- **Pages**: `index.astro` (landing + role cards), `guides/[...slug].astro` (one page per
  guide, left section nav + content + right on-this-page TOC).
- **Design**: `styles/global.css` ports the approved prototype (Fraunces display + Inter body).

## Phases
1. Scaffold Astro app + config + prebuild. ✅ in progress
2. Design system (global.css) + BaseLayout + GuideLayout.
3. Landing page + guide template wired to the collection.
4. Screenshots rendering; responsive pass.
5. **Tests**: a build smoke test (the site compiles + all three guides emit pages with
   their screenshots resolving) — `astro build` in CI / a vitest that asserts output.
6. Vercel config + deploy (user connects the project on their account).

## Deferred (v2)
- Client-side search (prototype shows a search bar; wire it with Pagefind).
- Split each `## Section` into its own page with prev/next (v1 = one page per guide, anchored).
- Judge/steward guide (blocked on the ringside flag).
- Dark mode.
