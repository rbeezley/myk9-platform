export {
  FieldGuideEntryBlankDocument,
  type FieldGuideEntryBlankProps,
} from './FieldGuideEntryBlankDocument';
export { FieldGuideEntryBlankButton } from './FieldGuideEntryBlankButton';
// Re-export Heritage's prop-assembly builder so Field Guide consumers can
// use `import { buildEntryBlankProps } from '@/features/fieldGuide/entry-blank'`
// without dipping into Heritage's feature folder directly.
export {
  buildEntryBlankProps,
  type BuildEntryBlankOptions,
} from '@/features/heritage/entry-blank/buildEntryBlankProps';
