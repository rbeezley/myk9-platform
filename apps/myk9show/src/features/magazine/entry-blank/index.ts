/**
 * Magazine entry-blank barrel.
 *
 * `buildEntryBlankProps`, the `EntryBlankProps` types, and
 * `BuildEntryBlankOptions` are re-exported from the Heritage entry-blank
 * module per the plan ("Reuse, don't fork: this is the proven shared data
 * layer"). The Magazine-specific work happens entirely in the PDF
 * renderers under `./sections/`, which read the same props.
 */

export { MagazineEntryBlankDocument } from './MagazineEntryBlankDocument';
export { MagazineEntryBlankButton } from './MagazineEntryBlankButton';
export {
  buildEntryBlankProps,
  type BuildEntryBlankOptions,
} from '@/features/heritage/entry-blank';
export type { EntryBlankProps } from '@/features/heritage/entry-blank';
