/**
 * Gazette entry-blank — public API.
 *
 * The data-assembly function `buildEntryBlankProps` is re-exported from
 * Heritage. Both styles render the same input data with different visual
 * registers, so forking the assembler would only create drift.
 */

export { GazetteEntryBlankDocument } from './GazetteEntryBlankDocument';
export { GazetteEntryBlankButton } from './GazetteEntryBlankButton';
export { buildEntryBlankProps } from '@/features/heritage/entry-blank/buildEntryBlankProps';
export type { BuildEntryBlankOptions } from '@/features/heritage/entry-blank/buildEntryBlankProps';
export type { EntryBlankProps } from './types';
