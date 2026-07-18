# Interaction-state components — design

## Context

`packages/ui` is the canonical primitive layer; `apps/myk9show/src/components/ui/*/index.ts` are thin re-export shims over it for Button, Card, Input, Dialog, and Tabs. `packages/ui/src/components/Button/buttonVariants.ts` is the only primitive with a real state contract — `focus-visible:ring-2 ring-primary/30 ring-offset-1`, `disabled:pointer-events-none disabled:opacity-50`, and a `destructive` variant. It has no `loading`. `Card` takes `variant` only.

Three live specs already own adjacent ground and this change is scoped to sit inside them rather than beside them: `contrast-token-system` (WCAG thresholds, dark mode, `--destructive` / `--ring` values, enforced by `apps/myk9show/src/styles/__tests__/semantic-token-contrast.test.ts`), `motion-language` (duration/easing tokens, reduced-motion, CSS-only motion in shared packages), and `shell-interaction-integrity` (44×44px minimum for shared chrome).

The dialog layer is four deep: `FormDialog → BaseEntityDialog → StandardDialog → ui/dialog → Base UI`. `StandardDialog` (33 importers) and `DialogFooterButtons` are what the app actually uses; `DialogFooterButtons` already funnels `isSubmitting` into a `Button`.

`docs/INTENT.md` §5 describes this change's own failure mode: "the software gets functionally better but emotionally flatter, one perfectly reasonable change at a time." Consolidating state styling is exactly the shape of change that erodes intent, which is why MYK9-16's own non-goals forbid behavior changes made for uniformity's sake.

## Goals / Non-Goals

**Goals:**

- One hook per interaction state, owned by the shared primitive, so callers stop hand-rolling.
- Destructive dialog actions cannot be dispatched twice.
- One focus-ring spelling, one token layer, one loading vocabulary.
- Adoption that survives the PR that introduces it.

**Non-Goals:**

- No component-library replacement; Base UI via shadcn/ui stays.
- No domain behavior changed to make components uniform.
- No renaming of the 15 pending-state variables — once `loading={x}` is the call site, the name behind it stops mattering.
- No re-audit of color contrast; `contrast-token-system` owns it.
- No loading indicator where absence is deliberate.

## Decisions

### Fan-out over opt-in

**Decision:** thread `loading` through `DialogFooterButtons` and `BaseEntityDialog` in the same PR that adds the prop, and convert the 34 known dialog call sites with it. Do not ship the prop alone.

**Rationale — this is the load-bearing decision, and the codebase already ran the experiment.** `FormDialog.tsx` and `enhanced-dialog.tsx` both arrived in the same commit (`35c3a1d4b`, 2026-01-02). FormDialog was opt-in behind a new import path and has **zero callers to this day**; `DogFormDialog` was hand-rolled from scratch beside it rather than adopting it. enhanced-dialog was aliased into the barrel `components/ui/dialog/index.ts` as `DialogContent` and has **~88 callers**, none of whom know they use it.

| | FormDialog | enhanced-dialog |
|---|---|---|
| Adoption mechanism | opt-in, new import path | aliased into the path callers already used |
| Callers | 0 | ~88 |

The same pattern repeats elsewhere: `buildClasses` sits at 8 consumers while everyone else writes Tailwind directly, and two different files are both named `SkeletonLoaders.tsx`. In this codebase an available-but-optional abstraction is ignored; a default-path abstraction is universal for free.

**Alternative considered:** ship `loading` on `Button`, migrate call sites in a follow-up PR. **Rejected** — that is precisely FormDialog's trajectory. A prop with 2 converted call sites is a dead abstraction with good intentions. 34 on day one is a beachhead; `DialogFooterButtons` and `BaseEntityDialog` are the barrel-equivalent that carries it further without persuasion.

### `loading` is opt-in at the call site, even though the abstraction is not

**Decision:** `Button` renders no pending affordance unless `loading` is passed.

**Rationale:** `docs/INTENT.md` names "loading spinners between entries" as a judge anti-pattern and requires sync to be "background and silent — no progress bars, no 'syncing…' modals." An inferred or automatic pending state would violate both by default. Opt-in means the quiet surfaces stay quiet **by construction rather than by reviewer vigilance** — a surface that wants silence simply says nothing. This is the one place where opt-in is correct, and it does not conflict with the fan-out decision: the *plumbing* is default-path, the *display* is explicit.

**Alternative considered:** infer pending from a mutation hook. **Rejected** — it would put a spinner on judge scoring and replication sync, which is an intent regression the `motion-language` delta now forbids in spec.

### Canonical focus ring: `ring-2 ring-ring ring-offset-2`

**Decision:** one spelling, deriving color from `--ring`.

**Rationale:** seven spellings exist (`ring-primary/30`, `/20`, `/50`, `/40`, `ring-blue-500/30`, `ring-blue-500`, plus offsets `1/2/4/0/background`). `ring-ring` is chosen over `ring-primary/30` because `--ring` is the contrast-verified token per accent — `ring-primary/30` is not, and two spellings bypass the token layer entirely. `offset-2` is chosen because it is the plurality (56 uses vs. 3 for `offset-1`) and more visible, which INTENT's accessibility-first rule favors for an audience that is largely retired and using tablets outdoors.

**Trade-off:** `Button`'s own ring is currently `/30 offset-1`, so **every button's focus ring changes**. Accepted deliberately: Button is the outlier, and leaving it divergent would mean shipping a "canonical" ring that the most-used primitive does not follow.

### Fold `enhanced-dialog` down rather than delete it

**Decision:** move its three class strings into `dialog.tsx`, then remove the wrapper file and the barrel alias.

**Rationale:** it is not dead code — the barrel aliases `EnhancedDialogContent as DialogContent`, so ~88 files render it unknowingly. It is a theming shim, never a pending-state abstraction. `dialog.tsx`'s `DialogContent` uses `bg-background` (`--background: #faf7f2`, ivory) while the enhanced version overrides to `bg-card` (`#ffffff`, white) and adds `text-foreground`. Because `cn` is twMerge, `bg-card` wins today. Deleting the file and repointing the barrel would turn every dialog in the app from white to ivory in light mode and drop `text-foreground` — a wide visual regression disguised as dead-code removal. Folding the classes down removes the indirection with zero pixel change and stops `index.ts` lying about which component you get.

**Alternative considered:** delete and accept the ivory dialogs. **Rejected** — that is a deliberate visual redesign, and it is a non-goal.

### Delete `FormDialog` outright

**Decision:** delete; salvage nothing.

**Rationale:** zero callers since arrival, and its contract is wrong for this codebase — `new FormData(e.target)` + `Object.fromEntries` only serves uncontrolled inputs with `name` attributes. Controlled state, non-native `Select`, checkboxes (unchecked boxes silently dropped), and numbers (everything becomes a string) all break, and its `T` generic is an unchecked cast. Its `initialData` prop is destructured but never used; `submitDisabled`/`maxWidth` are forwarded to a parent that drops them. Its one good idea — a form-wrapping dialog with a pending-aware footer — is already better served by `DialogFooterButtons`.

### Fix the dropped-props bug as part of this change, not after it

**Decision:** `BaseEntityDialog` must honor `submitDisabled` and `maxWidth`; `DialogFooterButtons` gets an explicit `destructive?: boolean`.

**Rationale:** `BaseEntityDialog` declares both props and never destructures them — they are accepted and silently discarded, and `DeleteConfirmationDialog` is a live caller. A dialog that passes `submitDisabled` today is **not disabled**. That is not adjacent to the double-submit bug this change exists to fix; it is plausibly a cause of it. Separately, `DialogFooterButtons` infers the destructive variant by string-matching the label (`saveLabel.toLowerCase().includes('delete')`), so "Delete forever" works by luck while "Remove" and "Discard" silently render as `default`. Both live in the files this change already opens; leaving them would mean threading `loading` through a component that ignores its own props.

## Risks / Trade-offs

- **Every button's focus ring changes visually** → Accepted and called out in the proposal as BREAKING (visual). Verified by the `semantic-token-contrast` matrix and the existing axe smoke gate; no contrast regression is possible without failing CI.
- **The `red-NNN → destructive` sweep is 370 hits across 135 files and mechanical changes hide real ones** → Sweep lands in its own PR, after the shadow-token deletion so the 8 shadow consumers are not touched twice. Reviewer reads it as a mechanical diff, not mixed with behavior.
- **Consolidation flattens deliberate divergence (intent erosion)** → 165 `// INTENT:` comments exist; six sit on interaction-state code and are enumerated in the proposal. The spec makes preservation a requirement with scenarios, not a convention.
- **Folding `enhanced-dialog` silently changes ~88 dialogs if done wrong** → The spec requires zero pixel change (`bg-card`/`text-foreground`/`border-border` preserved). This is the highest-blast-radius step in the change and lands in its own PR.
- **A `loading` prop that lands alone dies like FormDialog** → Mitigated by the fan-out decision. If PR 1 cannot also convert the 34 call sites, that is a signal the prop's shape is wrong, not a reason to defer migration.
- **`Button` is in `packages/ui`; app tests run against built `dist`** → Rebuild `pnpm --filter @myk9/ui build` before running app tests, or the app suite silently tests the old primitive.

## Offline-first and replication impact

**None to data flow, by construction.** This change touches presentation only: no query, mutation, replication, or offline path changes. `@myk9/replication` and the durable-write path are untouched; no component gains or loses a data dependency.

The one adjacency is presentational and is protected rather than modified: `providers/ReplicationSyncProvider.tsx:589,660` marks its persistent failure and conflict toasts `// INTENT:` — those are deliberate and are enumerated as do-not-flatten. INTENT's "Offline Is Normal, Not Broken" rule ("sync is background and silent — no progress bars") is the reason the `motion-language` delta forbids adding an indicator to background work; this change makes that constraint enforceable in spec rather than remembered.

## Migration Plan

Five sequential PRs, each independently reviewable and revertable:

1. **`packages/ui` state contract + fan-out.** `Button.loading`, `Card.selected`/`interactive`, canonical ring, `--selected-*`/`--disabled-*` tokens in the contrast matrix, `loading` threaded through `DialogFooterButtons` + `BaseEntityDialog`, `BaseEntityDialog` dropped-props fix, explicit `destructive` prop, and the 34 dialog call sites converted — including the ~12 double-submittable deletes. This PR carries the correctness fix; it ships first and alone if anything slips.
2. **Fold `enhanced-dialog` into `dialog.tsx`**, remove wrapper + barrel alias. Zero pixel change.
3. **Delete the shadow token layer** — `design-tokens.json`, `utils/designTokens.ts`, migrate the 8 consumers. Lands before the color sweep so those files are not touched twice. `FormDialog` is deleted here (it is one of the 8).
4. **Ring unification** — 279 hits / 127 files, honoring the six `// INTENT:` sites.
5. **`red-NNN → destructive` sweep + loading collapse** — 370 hits / 135 files, and the two same-named `SkeletonLoaders.tsx` resolved first.

**Rollback:** each PR is independently revertable. PR 1 is the only one carrying behavior change; PRs 2–5 are consolidation and revert cleanly. Nothing here touches the database, edge functions, or deployment, so rollback is a git revert with no state to unwind.

## Open Questions

None blocking. Two to resolve during PR 1:

- Whether `Card.interactive` is needed distinctly from `selected`, or whether `selected` alone covers every current caller. Resolve by converting the ring call sites and seeing if a second axis is ever used; drop `interactive` if not (YAGNI).
- Whether folding `enhanced-dialog` (PR 2) is better sequenced before PR 1, since PR 1 touches the same dialog surface. Current order assumes not — PR 1 changes actions, PR 2 changes the container — but if PR 1's diff collides, swap them.
