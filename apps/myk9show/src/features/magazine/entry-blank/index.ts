/**
 * Magazine entry-blank barrel.
 *
 * Cross-feature coupling — intentional:
 *  `buildEntryBlankProps`, `EntryBlankProps`, and `BuildEntryBlankOptions`
 *  are re-exported from `@/features/heritage/entry-blank` rather than
 *  forked. The plan (`docs/plan-magazine-style.md` §"Reuse, don't fork")
 *  explicitly endorses this: the entry-blank *data layer* is style-agnostic
 *  — it transforms DB rows into the same props regardless of which
 *  premium style ends up rendering them. Only the *PDF renderers* under
 *  `./sections/` differ between Magazine and Heritage.
 *
 * Implications for future refactors:
 *  - Changing the shape of `EntryBlankProps` in Heritage breaks Magazine.
 *    The two test suites should both fail in that case, but a wider
 *    refactor (e.g. moving the data layer to `features/_shared/entry-blank/`)
 *    is the better long-term home once a third style takes the same dep.
 *  - WorkflowStepContent dispatches through the shared entry-blank registry
 *    using the `ShowStyle` resolved by `getShowStyle(show)` from `shows.style`;
 *    Heritage and Magazine both pull from the same `buildEntryBlankProps` factory.
 */

export { MagazineEntryBlankDocument } from './MagazineEntryBlankDocument';
export { MagazineEntryBlankButton } from './MagazineEntryBlankButton';
export {
  buildEntryBlankProps,
  type BuildEntryBlankOptions,
} from '@/features/heritage/entry-blank';
export type { EntryBlankProps } from '@/features/heritage/entry-blank';
