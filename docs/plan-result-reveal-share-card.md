# Plan: Result Reveal + Share Card

Turn the qualifying result — the emotional peak of the exhibitor's weekend — from a row
state into a moment: a celebratory reveal when results release, and a shareable card image
the exhibitor posts to their dog-sport circles. The card is also the growth loop: every
share puts the show name and a quiet myK9Show mark in front of exactly our market.

**INTENT alignment (docs/INTENT.md, Exhibitor › Viewing results: "There it is"):** results
appear quickly, easy to find their dog, *shareable*. This is the explicit celebratory-UI
exception to the no-emoji/calm-over-clever defaults (cf. podium medals precedent) — the
reveal may celebrate; everything around it stays calm.

## Duplication check (required by CLAUDE.md)

Does this duplicate an existing surface? **No.** Results are *displayed* today on
MyEntriesPage and ClassResultsTable; nothing *celebrates or exports* them. The reveal is a
modal moment layered on the existing results data path, and the share card is an artifact
renderer, not a page. The "results posted" push already exists (`buildResultsPostedPayload`)
— the reveal becomes what that push opens into, replacing nothing.

## Existing pieces (verified 2026-06-12)

| Piece | Location | Status |
| --- | --- | --- |
| Result fields | `entries`: `result_status`, `final_placement`, `search_time_seconds`, `total_faults`, `is_scored` | Live. All card facts exist; no migration. |
| Release gating | `classes.results_released_at` / `is_scoring_finalized`; `deriveClassState()` in `useVisibleResultFields.ts` | Live. The card MUST flow through this — no leaks pre-release. |
| Field visibility | `getVisibleResultFields()` (`@myk9/secretary`): `showPlacement` / `showQualification` / `showTime` / `showFaults` per class state + role | Live. Card builder consumes its output verbatim. |
| Dog photo | `dogs.image_url` (nullable); `DogPhotoSection.tsx` with `/placeholder-dog.png` fallback | Live. Card uses the same fallback chain. |
| Results push | `buildResultsPostedPayload` (`packages/notifications/src/handlers.ts:79`); `actionUrl=/classes/:classId` set in `useNotificationMonitor.ts` | Live. Phase 2 retargets the actionUrl for own-entry results. |
| Share plumbing | `shareOrCopy()` (`apps/myk9show/src/utils/share.ts`) — `navigator.share` + clipboard fallback | Live but text/url-only; Phase 3 adds a file-share variant. |
| Celebration | `canvas-confetti` already a dependency (used by ShowCreationWizardPage) | Live. |
| Exhibitor results view | `MyEntriesPage` (`useMyEntriesData.ts:160` loads result fields); `ResultBadge.tsx` label mapping | Live. Reveal entry points hang off these. |
| Judge name | NOT denormalized onto entries — `judge_assignments` → `people` join | Gap. Card shows judge only when cheaply available (class detail already resolves it); never blocks on it. |

## Design decisions

1. **One card model, many moments.** A pure `ResultCardModel` (dog, handler, result,
   placement, time, class, show, date, judge?, photoUrl?) built by one function from
   entry + class + show + visibility flags. The reveal screen, the shared image, and every
   future variant (title card, season recap) render this same model. The builder is where
   gating lives; renderers never re-derive permissions.
2. **Visibility gating is non-negotiable.** The builder takes `getVisibleResultFields()`
   output: no placement on the card unless `showPlacement`, no Q badge unless
   `showQualification`, and no card at all before the class state is `released` (or
   `completed` per the existing cascade). A secretary's release decision is the publish
   button.
3. **Own entries only.** Reveal + share are offered for entries the account owns — reuse
   the `get_account_today_entries` ownership semantics (handler/owner/co-owner). Anyone can
   *see* released results where they already can today; the celebration/share affordance is
   personal.
4. **Hand-drawn canvas renderer, not html2canvas.** The share image is a fixed-layout
   1080×1350 (4:5, the social sweet spot) drawn directly with Canvas 2D — deterministic
   output, no flaky DOM-snapshot dependency, testable by asserting draw calls. The DOM
   reveal card and the canvas renderer share the model, not markup.
5. **Native share with graceful fallbacks.** `navigator.share({ files })` where supported
   (mobile PWA — the primary case) → `canShare` probe; fallback = download the PNG +
   `shareOrCopy()` text. Never auto-post anywhere.
6. **Celebrate proportionally.** Q = confetti burst + ribbon-colored accent (placement
   colors: 1st blue, 2nd red, 3rd yellow, 4th white — the AKC ribbon convention exhibitors
   feel in their gut). NQ/ABS/EX entries get a quiet, dignified card with no celebration and
   no share prompt by default (still shareable from the card if the user chooses — their
   data, their call).

## Phases

### Phase 1 — Card model + DOM card component

- `apps/myk9show/src/features/result-card/resultCardModel.ts`: `buildResultCardModel(
  entry, cls, show, visibility, dog)` → `ResultCardModel | null` (null when not released /
  not scored / nothing visible). Pure.
- `ResultCard.tsx`: the on-screen card (shadcn/ui, both themes), ribbon accent by
  placement, photo fallback chain (`image_url` → placeholder).
- **Tests:** builder gating matrix (released × showPlacement × showQualification ×
  result_status), null pre-release, NQ renders without placement row, photo fallback;
  component renders each result state.

### Phase 2 — The reveal moment

- Reveal modal/route (e.g. `/my-entries/result/:entryId` or modal state on MyEntriesPage):
  full-card presentation, confetti on Q (respect `prefers-reduced-motion`), entry points:
  (a) tapping a newly-released own result on MyEntriesPage, (b) the results-posted push —
  retarget `actionUrl` to the reveal for own entries (one-line change in
  `useNotificationMonitor.ts`), keep `/classes/:classId` for class-level fallback.
- Seen-state (localStorage per entry id) so the full-screen reveal fires once; afterwards
  the card is reachable from the entry row without ceremony.
- **Tests:** reveal gating (own entry + released only), seen-state once-only, reduced-motion
  skips confetti, push actionUrl assertion (`toHaveBeenCalledWith` — value-sensitive).

### Phase 3 — Share: canvas render + native share

- `renderResultCardImage(model): Promise<Blob>` — Canvas 2D, 1080×1350, fixed layout,
  loads the dog photo with CORS-safe fallback to the placeholder; myK9Show wordmark + show
  name footer.
- Extend `utils/share.ts` with `shareFile(blob, { title, text })`: `navigator.canShare({
  files })` → share sheet; else object-URL download + existing `shareOrCopy` for the text.
- Share button on the reveal card and on the entry row's card view.
- **Tests:** renderer draw-call assertions against a mocked 2D context (text content,
  ribbon color by placement, no placement text when `showPlacement=false`), photo-load
  failure falls back without rejecting, `shareFile` branch matrix (canShare true/false).

### Phase 4 — Verification & hygiene

- `pnpm typecheck && pnpm lint`; full myK9Show suite.
- Manual: phone PWA — push → reveal → share sheet → posted image looks right in light/dark
  source themes; desktop fallback downloads.
- Update `OPEN-TODOS.md`.

## Future (same renderer, separate plans)

- **Title-completion card** ("Ditto earned her SCN!") — needs title-progress derivation;
  bigger emotional stakes, same `ResultCardModel` extension.
- **Season recap** — multi-card year-in-review, Wrapped-style. Post-launch.

## Out of scope (explicitly)

- Auto-posting to any social platform (user shares via their own share sheet only).
- OG-image/server-side rendering — client canvas is sufficient and offline-friendly.
- Judge-name denormalization migration — card omits judge when not already resolved.
- Any new top-level page or nav entry. The reveal is a moment, not a destination.
