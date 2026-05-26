/**
 * Public surface for the ClassList page in @myk9/ringside.
 *
 * Re-exported from the package root (`packages/ringside/src/index.ts`) —
 * consumers should always import from `@myk9/ringside`, not from a
 * subpath. Internal organization is free to evolve without breaking
 * downstream importers.
 */

export type {
  ClassEntry,
  TrialInfo,
  ClassListData,
  ClassStatusValue,
} from './types';

export {
  shouldCombineAllSections,
  findPairedNoviceClass,
  findPairedSectionedClass,
  groupNoviceClasses,
  groupSectionedClasses,
  isCombinedNoviceEntry,
  isCombinedEntry,
  getClassIds,
} from './utils/noviceClassGrouping';
