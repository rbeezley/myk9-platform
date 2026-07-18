# Interaction-state components

Tracking: [MYK9-16](https://linear.app/myk9-platform/issue/MYK9-16/define-reusable-interaction-state-components)

## Why

`packages/ui` has no hook for three of the five interaction states. `Button` encodes focus, disabled, and destructive, but has no `loading` prop; `Card` has no `selected` state. Callers route around the gap by hand: 175 `animate-spin` occurrences across 129 files, 279 focus/selected rings across 127 files in seven mutually inconsistent spellings, and 370 raw `red-NNN` classes across 135 files despite `destructive` being well adopted elsewhere (732 uses / 248 files).

This is not cosmetic. The `AlertDialog`-based destructive dialogs — `DeletePersonDialog`, `DeleteClassDialog`, `DeleteEntryDialog`, and their siblings — render a confirm action (`AlertDialogAction`, a Base UI `Close`) with no self-guard. When the caller's handler is async, the popup stays mounted until it resolves, so a second tap in that window re-fires an irreversible delete. Reproduced with a failing test (fired twice), then fixed by latching `AlertDialogAction` to one invocation per open — the guard lives in the primitive, so all ~107 call sites inherit it and no future caller can forget it. The separate `BaseEntityDialog` → `DialogFooterButtons` path is **not** vulnerable: it forwards `isSubmitting` to the confirm button's `disabled`, and its four `DeleteConfirmationDialog` consumers all pass a real pending flag.

Beyond that guard, callers still reinvent _pending display_ by hand, which is why the app carries fifteen names for the same state (`isLoading`, `isPending`, `isSubmitting`, `isSaving`, `isDeleting`, …). The naming spread is evidence of the missing display abstraction — a `loading` prop on `Button` — not of a second correctness bug.

Launch readiness (fall 2026): myK9Show is pre-launch and MYK9-13 gates on real-user validation with non-technical secretaries and exhibitors. Double-submitting a delete is a data-loss-adjacent failure that a novice user is more likely to trigger, not less. `docs/INTENT.md` sets the bar this audience needs — "never makes you feel stupid" — and state that is invisible or inconsistent is precisely what makes software feel unpredictable. Fixing the source is cheaper before launch than after.

## What Changes

- Add `loading?: boolean` to `packages/ui` `Button`. When set, the button disables itself and renders a CSS spinner. **Opt-in by design** — surfaces that deliberately show no spinner (judge scoring between entries; silent background sync) simply do not pass it.
- Add `selected?: boolean` and `interactive?: boolean` to `packages/ui` `Card`, rendering the ring from the existing `--ring` token.
- Introduce `--selected-*` and `--disabled-*` semantic tokens in `apps/myk9show/src/index.css` and add them to the `semantic-token-contrast.test.ts` matrix.
- Specify the three existing `--shadow-card` / `--shadow-ring` / `--shadow-card-hover` elevation tokens, which exist today but are unspecified and unverified.
- Adopt one canonical focus ring — `ring-2 ring-ring ring-offset-2` — replacing seven spellings. **BREAKING (visual):** `Button`'s current ring is `ring-2 ring-primary/30 ring-offset-1`, which matches almost nothing else in the app; every button's focus ring changes. `ring-ring` is chosen over `ring-primary/30` because `--ring` is the contrast-verified token per accent; `offset-2` is chosen because it is both the app plurality (56 uses) and more visible, which `docs/INTENT.md`'s accessibility-first rule favors.
- Thread `loading` through `DialogFooterButtons` and `BaseEntityDialog`, which already funnel `isSubmitting` into a `Button`. Adoption in this codebase follows the default path, not the available one — see Decision "Fan-out over opt-in" in `design.md`.
- Latch `AlertDialogAction` to one invocation per open, fixing the double-submittable destructive dialogs at the primitive. Reproduced with a failing test, fixed, and verified: the guard covers all ~107 `AlertDialogAction` sites, and every handler in the codebase is a one-shot commit, so "once per open" breaks nothing.
- Clean up `BaseEntityDialog`, which declares `submitDisabled` and `maxWidth` in `BaseEntityDialogProps` but **never destructures them** — both are accepted and silently dropped. This is _not_ a double-submit cause: `submitDisabled` has zero callers anywhere (a dead prop / latent footgun), and the one live drop is `maxWidth` — `DeleteConfirmationDialog` passes `max-w-md` and gets the default width, a cosmetic regression across four dialogs. Wire both through, or remove `submitDisabled` if no caller is planned.
- Replace `DialogFooterButtons`' destructive-variant inference, which string-matches the label (`saveLabel.toLowerCase().includes('delete')`). "Delete forever" works by luck; "Remove" and "Discard" silently render as `default`. Add an explicit `destructive?: boolean`.
- Migrate the 22 dialogs that hand-roll a spinner in the confirm button to the `Button` `loading` prop. (The double-submit half of this line is already handled by the `AlertDialogAction` latch above — the two were separate problems wearing the same costume.)
- Delete `apps/myk9show/src/components/base/FormDialog.tsx`. It has had zero callers since it arrived in the 1,688-file `35c3a1d4b` app import (2026-01-02) and is unusable by construction: it reads submissions with `new FormData(e.target)` + `Object.fromEntries`, which cannot serve the controlled-state forms this app writes. `DogFormDialog` was hand-rolled from scratch beside it rather than adopting it. Its `initialData` prop is destructured but never used. Nothing to salvage.
- Fold `enhanced-dialog.tsx`'s three class strings into `dialog.tsx` and remove the wrapper indirection. **This file is not dead** — `components/ui/dialog/index.ts` aliases `EnhancedDialogContent as DialogContent`, so ~88 files render it without knowing. It is a dark-mode theming shim (`bg-card`, `text-foreground`, `border-border`), never a pending-state abstraction. Deleting it outright would repoint the barrel at `dialog.tsx`'s `bg-background` and turn every dialog from white to ivory in light mode. Folding the classes down is the zero-visual-change path.
- Delete the shadow token layer `apps/myk9show/docs/style-guides/design-tokens.json` + `apps/myk9show/src/utils/designTokens.ts` and migrate its 8 consumers to the CSS custom properties. It duplicates `focusRing` / `disabled` / `errorColor` with no tests and no sync mechanism — drift by construction.
- Sweep 370 raw `red-NNN` classes to `destructive`, and collapse the 14 competing loading components — beginning with the two different files both named `SkeletonLoaders.tsx`.

## Capabilities

### New Capabilities

- `interaction-state-components`: the shared contract for how selected, disabled, loading, error, and focus states are expressed — which primitive owns each state, the token vocabulary behind them, elevation, the canonical focus ring, and the requirement that a destructive dialog action cannot be submitted twice.

### Modified Capabilities

- `motion-language`: its Purpose names loading as one of five motion categories, but the "Motion category rules" requirement enumerates only Appear, State-changed-in-place, Moved, and Celebration. No loading rule exists. Consolidating 14 loading treatments requires stating what loading motion means; this change adds that missing category rule.

## Impact

**Consumes, does not redefine.** Three live specs already own adjacent territory and this change is scoped to sit inside them:

- `contrast-token-system` — owns WCAG AA thresholds, dark mode, and the `--destructive` / `--ring` color values. New state tokens inherit its contrast obligations and extend its existing matrix test. This change does **not** re-audit color contrast.
- `motion-language` — owns duration/easing tokens and reduced-motion. State transitions must crossfade over `duration-state`, never bounce. `packages/ui` motion stays CSS-only; no framer-motion, no new animation library.
- `shell-interaction-integrity` — owns the 44×44px minimum for shared chrome. This change consumes that rule rather than restating it.

**Does this duplicate an existing surface?** No, and a link is not the alternative here — this is not a page. The nearest neighbor is `contrast-token-system`, which overlaps roughly 20% (focus color, error color, dark mode, readability), all of it in the consume direction: it made state colors _legible_, this makes state _exist and be consistent_. Its `design.md` Decision 5 rejected a new component family "unless implementation finds repeated local bypasses that cannot be corrected through existing shadcn/ui variants and tokens," and explicitly allowed one "if an existing shared component has a missing token hook that multiple callers need." A `loading` prop on `Button` is that hook; 129 files bypassing it is that evidence. `motion-language`'s consolidation requirement covers Framer entry-point primitives and the dead optimistic suite — a disjoint file set from the skeleton/spinner cluster here.

**Code:** `packages/ui/src/components/Button`, `packages/ui/src/components/Card`, `apps/myk9show/src/index.css`, ~200 call-site files across `apps/myk9show/src`.

**Deleted:** `components/base/FormDialog.tsx`, `components/ui/dialog/enhanced-dialog.tsx` (classes folded into `dialog.tsx` first — same pixels), `docs/style-guides/design-tokens.json`, `utils/designTokens.ts`, and the redundant loading modules.

**Modified in place:** `components/ui/alert-dialog/alert-dialog.tsx` (latch `AlertDialogAction` against double-submit — **done**, see the double-submit-fix PR), `components/base/BaseEntityDialog.tsx` (honor `maxWidth`; wire or remove the dead `submitDisabled`), `components/base/DialogFooterButtons.tsx` (explicit `destructive` prop; accept `loading`), `components/ui/dialog/dialog.tsx` (absorb the enhanced classes).

**Do not flatten:** 165 `// INTENT:` comments exist in `apps/myk9show/src`; six sit directly on interaction-state code and are deliberate — `ShowMapStructureTable.tsx:206` (roving tab stop: the tree owns one focus target), `ShowMapStructureTable.tsx:133` (reorder mode is modal; divergent state styling is intended), `ShowMapSortableEntryRow.tsx:95` (`touchAction: 'none'` for iOS Safari), `ShowMapRunOrderMenu.tsx:44` (trigger disabled at 0/1 entries — already meets the "clear rationale" bar), `ShowDeskAdaptiveHeader.tsx:377` (chip contrast/touch targets), `ReplicationSyncProvider.tsx:589,660` (persistent failure toasts by design).

## Non-Goals

- No wholesale component-library replacement. Base UI via shadcn/ui stays.
- No domain behavior changes made solely to render components uniformly.
- No renaming of the 15 pending-state variables. Once `loading={x}` is the call site, the name behind it stops mattering; a rename is churn with no user-visible effect.
- No re-audit of color contrast, no new theme picker, no new settings surface, no new pages or dialogs.
- No loading indicator added where its absence is deliberate. `docs/INTENT.md` lists "loading spinners between entries" as a judge anti-pattern and requires sync to be "background and silent — no progress bars, no 'syncing…' modals."
