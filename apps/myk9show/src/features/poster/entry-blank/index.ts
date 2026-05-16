export {
  PosterEntryBlankDocument,
  type PosterEntryBlankProps,
} from './PosterEntryBlankDocument';
export { PosterEntryBlankButton } from './PosterEntryBlankButton';
// Re-export Heritage's prop-assembly builder so Poster consumers can use
// `import { buildEntryBlankProps } from '@/features/poster/entry-blank'`
// without dipping into Heritage's feature folder directly.
export {
  buildEntryBlankProps,
  type BuildEntryBlankOptions,
} from '@/features/heritage/entry-blank/buildEntryBlankProps';
