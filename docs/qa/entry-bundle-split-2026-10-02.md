# Entry bundle split — before and after (MYK9-844)

Scope: the shared entry chunk that every cold load transfers. The per-route request and data-fetch work in [`perf-baseline-2026-09-28.md`](perf-baseline-2026-09-28.md) is untouched here.

## Result

Static import closure of `index.html` (entry chunk plus the `modulepreload`ed vendor chunks), esbuild-minified production build of `apps/myk9show`. Before is `origin/main` at `b37e7a36c`; after is the same commit with this change. All numbers in this document were measured on 2026-10-02, after merging main into the branch.

| Measure                       |      Before |       After | Change |
| ----------------------------- | ----------: | ----------: | -----: |
| Entry chunk, raw              | 3,564,301 B | 1,856,680 B |  −48 % |
| Entry chunk, gzip             | 1,140,577 B |   566,746 B |  −50 % |
| Entry closure (3 files), raw  | 4,223,672 B | 2,516,051 B |  −40 % |
| Entry closure (3 files), gzip | 1,333,438 B |   759,607 B |  −43 % |

The gzip entry figure before matches the 1,126,264 B the 2026-09-28 baseline saw on the wire, so the after figure is comparable to it.

## New lazy chunks

Chunks that now load on demand instead of with every page (raw / gzip):

| Chunk                |         Raw |      Gzip | Loads when                                                |
| -------------------- | ----------: | --------: | --------------------------------------------------------- |
| `pdfTokens`          | 1,234,055 B | 448,760 B | a premium publish runs (fontkit, pdfkit, yoga, react-pdf) |
| `DogDetailPage`      |    67,384 B |  19,117 B | the `/dogs/:id` route                                     |
| `sortable.esm`       |    45,907 B |  15,317 B | a ringside surface using dnd-kit sortable                 |
| `UKCPremiumTemplate` |    43,900 B |   9,170 B | a premium publish runs                                    |
| `confetti.module`    |    10,670 B |   4,320 B | a ringside surface using confetti                         |
| `publishExperience`  |     2,838 B |   1,270 B | a premium publish runs                                    |

Rollup also split about 50 small shared helpers and icon modules into their own chunks (each under 30 KB; names such as `useRoleBasedData`, `useEntriesDatabase`, `registrationNameHint`, `validation`). They are listed by diffing the chunk names of the two builds.

## Load time, as measured

Lab measurement, not field data. Same machine, same Chromium (headless, Playwright's bundled build), cold context per run, HTTP cache disabled, service worker blocked, 390×844 viewport, Slow 4G (150 ms latency, 1.6 Mbps down, 0.75 Mbps up) and 4× CPU slowdown through CDP. Each build was served with `vite preview` and loaded at `/`, five runs each, medians reported.

| Median, ms             | Before | After | Change |
| ---------------------- | -----: | ----: | -----: |
| First contentful paint | 14,224 | 8,640 |  −39 % |
| Page content visible   | 13,481 | 8,459 |  −37 % |
| `load` event           | 13,240 | 8,275 |  −38 % |

Every run was within about ±1 s of its median (before 13.5–14.9 s FCP, after 8.6–10.1 s).

Limits: the builds were made with a dummy `VITE_SUPABASE_URL`, so backend calls fail immediately and this isolates script delivery and parse for the landing page, not the data waterfall that dominates the signed-in routes in the 2026-09-28 baseline. LCP was not reported by headless Chromium here. The MYK9-843 benchmark (`pnpm performance:baseline`) was not rerun; its routes need the seeded backend.

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

Then walk the static `import` graph from the `<script type="module">` in `index.html` and sum raw and gzip sizes. For load time, build with any placeholder `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, serve with `vite preview --outDir`, and load `/` in Chromium with the CDP throttling above.

## Known issue: terser builds on this machine fail `node --check`

Observed while measuring, not diagnosed, and not caused by this change. The `vite build` default (terser) entry chunk fails `node --check` with `SyntaxError: Export '<name>' is not defined in module`: `ACTIVE_JUDGE_ASSIGNMENT_STATUSES` on unmodified `origin/main`, `ACTIVE_COMPOSITE_ITEM` on this branch. It reproduced with `NODE_ENV` unset and `NODE_ENV=production`, and with sourcemaps on and off, so the exported name varies but the failure does not. The terser entry chunk is also far smaller than the esbuild one (about 359 KB versus 1.86 MB on this branch), which suggests terser is dropping declarations that Rollup's trailing `export { … }` list still names.

Environment: Node 22.22.0 here (CI pins 22.12.0), terser 5.51.2, vite 7.3.6, 4 CPUs. Whether the Node version is involved is unknown. The 2026-09-28 baseline saw a 3.54 MB entry from a CI-style build, so a build elsewhere does not show this.

All numbers above use `--minify esbuild` for that reason; they are comparable with each other and with the baseline's chunk sizes, but they are not the bytes a terser build would ship. Next step for whoever picks this up: run `node --check` on a terser-built entry chunk in CI (or the deployed one) and, if it passes there, bisect the `terserOptions` in `apps/myk9show/vite.config.ts` (`unused`, `hoist_vars`, `collapse_vars`, `pure_getters`) on this machine.
