import { EntryBlankDownloadControl } from '@/features/_shared/EntryBlankDownloadControl';
import {
  buildEntryBlankProps,
  type BuildEntryBlankOptions,
} from '@/features/heritage/entry-blank/buildEntryBlankProps';

interface Props extends BuildEntryBlankOptions {
  label?: string;
  filename?: string;
  className?: string;
}

/**
 * Poster-styled entry-blank PDF download button. Reuses Heritage's
 * `buildEntryBlankProps` data builder; only the rendered document carries
 * the Poster visual register.
 */
export function PosterEntryBlankButton({
  label = 'Download Entry Blank',
  filename,
  className,
  ...opts
}: Props) {
  const props = buildEntryBlankProps(opts);
  const pdfFilename =
    filename ??
    `${opts.show.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')}-entry-blank.pdf`;

  return (
    <EntryBlankDownloadControl
      loadDocument={() =>
        import('./PosterEntryBlankDocument').then(m => m.PosterEntryBlankDocument)
      }
      dog={props.dog}
      documentProps={props}
      fileName={pdfFilename}
      label={label}
      className={className}
    />
  );
}
