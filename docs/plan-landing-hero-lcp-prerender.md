# Landing-page mobile LCP — prerender + hydrate the hero

> **Status:** Active

Follow-up captured 2026-06-19. Best timed for **launch preparation** (real marketing
traffic), not urgent now: the project is pre-launch with no real users, and desktop
LCP is already good. Recorded here so it is not lost.

## Problem

The public landing page (`/`, `apps/myk9show/src/pages/Home.tsx`) has a poor
**mobile LCP**. Measured 2026-06-19 with Lighthouse:

| Profile | Score | LCP | FCP | CLS |
| ------- | ----- | --- | --- | --- |
| Desktop | 86 | **1.8 s** ✅ | 1.1 s | low |
| Mobile (Moto G4, slow 4G, 4× CPU) | 57 | **14.8 s** ❌ | 6.7 s | ~0.08 |

The LCP element is the hero image (`/hero-ziva-tera.jpg`, rendered by
`HeroPhotoLed.tsx`). Phase breakdown on mobile:

```
TTFB 663ms · Load Delay 368ms · Load Time 1679ms · Render Delay 12,083ms
```

The image is already preloaded with `fetchpriority="high"` in `index.html` and its
CSS (`src/styles/landing.css`) is eager — so it *loads* fast. The 12 s is pure
**render delay**: this is a client-rendered SPA (`createRoot`, `src/main.tsx`), so the
`<img>` does not enter the DOM until the JS bundle downloads over slow 4G and React
mounts `<Home>` → `<HeroPhotoLed>`.

## What does NOT work (verified empirically 2026-06-19 — do not repeat)

**Putting a static copy of the hero markup inside `<div id="root">` in `index.html`.**
Built it, measured before/after locally (Lighthouse mobile, `vite preview`):

| | Before (empty `#root`) | After (static fold) |
| --- | --- | --- |
| LCP | 13.1 s | 14.7 s (no improvement) |
| LCP Render Delay | ~12 s | **12.8 s (unchanged)** |
| CLS | 0.076 | 0.088 (slightly worse) |

**Why it fails:** `createRoot()` *clears* `#root` and re-renders the hero from scratch
on mount. It destroys the static node and paints a fresh `<img>` at boot time, so the
browser records LCP at React's late paint and discards the early static paint. There is
**no cheap version of this with client-side `createRoot`** — the early paint only counts
if React *adopts* the existing node (`hydrateRoot`), which requires real prerendered
markup. That is Option A below.

## Option A — prerender the landing route + hydrate (the real fix)

1. **Prerender `/` at build time** into static HTML containing the full above-the-fold
   markup (hero `<img>`, header, h1). Scope the prerender to the **public landing route
   only** — a contained build step (e.g. a `vite` SSG/prerender plugin or a
   post-build Puppeteer pass over `/`). Do not attempt to prerender authed routes.
2. **Switch `createRoot` → `hydrateRoot`** for the prerendered entry so React adopts the
   existing hero DOM node instead of replacing it — the early paint then *is* the LCP.
3. **Handle client-only bits to avoid hydration mismatches:**
   - `ShowTodayBanner` (`src/features/show-today/ShowTodayBanner.tsx`) fetches data and
     returns `null` while loading — make sure server and first client render agree
     (render nothing on the server, gate the banner behind an effect/`useEffect` or a
     `useSyncExternalStore` that yields the same initial value).
   - Waitlist forms and anything reading `window`/`localStorage`/theme must guard for the
     prerender pass.
   - `theme-init.js` already runs before hydration — verify it does not cause a class
     mismatch on `<html>`.
4. **Keep CLS = 0:** the hero band already has a deterministic height
   (`min(56vh,520px)`, `min-height:380px`), so reserving space is not the issue;
   the risk is the sticky header and font swap. Prerendering the real header markup
   removes the header-height ambiguity.

## Verification

- Local before/after with Lighthouse mobile profile against `vite preview` (the harness
  used 2026-06-19): **build → `vite preview --port <p>` → `npx lighthouse <url>
  --form-factor=mobile`**. Target: LCP at ~FCP (low single digits), Render Delay
  collapses from ~12 s to ~hundreds of ms.
- **Guard CLS stays ≤ 0.1** and that there is no hydration-mismatch console error.
- Re-run against deployed staging after merge (PageSpeed Insights needs an API key — the
  anonymous quota is exhausted; or run `npx lighthouse` against the staging URL with
  system Chrome via `CHROME_PATH`).

## Risk / effort

Focused **1–2 days**. Real risk is hydration correctness across the landing's client-only
pieces. Reversible (the prerender step and `hydrateRoot` swap can be backed out). The
bundle/chunk work that helped the render-delay critical path already shipped in
[PR #854](https://github.com/rbeezley/myk9-platform/pull/854) (eager cold path
682 → 485 KB brotli, −29%).
