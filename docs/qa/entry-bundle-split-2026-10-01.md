# Entry bundle split — before and after (MYK9-844)

Scope: the shared entry chunk that every cold load transfers. The per-route request and data-fetch work in [`perf-baseline-2026-09-28.md`](perf-baseline-2026-09-28.md) is untouched here.

## Result

Static import closure of `index.html` (entry chunk plus the `modulepreload`ed vendor chunks), esbuild-minified production build, `apps/myk9show`:

| Measure                       |      Before |       After | Change |
| ----------------------------- | ----------: | ----------: | -----: |
| Entry chunk, raw              | 3,563,929 B | 1,856,555 B |  −48 % |
| Entry chunk, gzip             | 1,140,462 B |   566,715 B |  −50 % |
| Entry closure (3 files), raw  | 4,223,300 B | 2,515,926 B |  −40 % |
| Entry closure (3 files), gzip | 1,333,323 B |   759,576 B |  −43 % |

The gzip entry figure before (1,140,462 B) matches the 1,126,264 B the 2026-09-28 baseline saw on the wire, so the after figure is comparable to it. These are bundle-size numbers from a build, not a rerun of the MYK9-843 browser benchmark; LCP and time-to-usable are not re-measured here.

## What moved out of the entry

1. **PDF publishing.** `App → AppHeader → HeaderActions → useCurrentActions → usePremiumPublishControl → … → premiumPublishCoordinator → publishExperience → publishPremium → @react-pdf/renderer` pulled fontkit, pdfkit, yoga and the react-pdf reconciler (about 1.5 MB raw) into every page. `premiumPublishCoordinator` now loads `publishExperience` with a shared dynamic import when a publish actually runs.
2. **Ringside UI.** `App → useNotificationMonitor → … → showEntryRunQueue` imported three pure helpers from the `@myk9/ringside` barrel, which dragged in dnd-kit, scoring-ui and confetti. `@myk9/ringside` now has a `./run-queue` subpath export (extra tsup entry) and `showEntryRunQueue` imports from it.
3. **Dog detail page.** `publicRoutes` imported `DogDetailPage` statically, which brought the dog details tree and the registration dialogs into the entry. It is now `lazy()` like its sibling routes.

## Still in the entry (follow-ups, not done here)

Largest remaining contributors by rendered size: `@base-ui/react` 468 KB, `motion-dom`/`framer-motion` 380 KB, `zod` 258 KB, `react-router` 232 KB, `src/services/database` 191 KB, `src/services/replication` 181 KB, `@myk9/replication` 175 KB.

- `zod` reaches the entry only through `premiumPublishSchema`, which is parsed synchronously by `hydrateAttempts`; removing it needs that path made async.
- `PageTransition` pulls all of `framer-motion` into the entry; a `LazyMotion` conversion would shrink it.
- Replication and database layers are legitimately eager for offline-first startup and were left alone.

## Reproduce

```bash
cd apps/myk9show
pnpm exec vite build --minify esbuild --outDir /tmp/dist-x   # also writes dist/stats.html
```

Then walk the static `import` graph from the `<script type="module">` in `index.html` and sum raw and gzip sizes.

Note: the default terser build on this machine's Node 22.22 emitted an entry chunk that `node --check` rejects (`Export 'ACTIVE_JUDGE_ASSIGNMENT_STATUSES' is not defined`) on unmodified `main`, so the numbers above use esbuild minification. CI builds with Node 22.12; this is flagged for a separate look, not diagnosed.
