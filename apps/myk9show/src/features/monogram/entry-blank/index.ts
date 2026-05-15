export { MonogramEntryBlankDocument } from './MonogramEntryBlankDocument';
export { MonogramEntryBlankButton } from './MonogramEntryBlankButton';
// Re-export Heritage's prop assembly + types — Monogram intentionally reuses
// them so the data layer stays a single source of truth.
export {
  buildEntryBlankProps,
  type BuildEntryBlankOptions,
} from '@/features/heritage/entry-blank/buildEntryBlankProps';
