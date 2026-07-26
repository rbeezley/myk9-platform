import { EntryBlankDownloadControl } from '@/features/_shared/EntryBlankDownloadControl';
import {
  buildEntryBlankProps,
  type BuildEntryBlankOptions,
} from '@/features/heritage/entry-blank/buildEntryBlankProps';
import { MonogramEntryBlankDocument } from './MonogramEntryBlankDocument';

interface Props extends BuildEntryBlankOptions {
  /** Button label. Defaults to "Download Entry Blank". */
  label?: string;
  filename?: string;
  className?: string;
}

/**
 * Monogram-styled download button. Reuses Heritage's `buildEntryBlankProps`
 * — the prop-assembly logic is pure data and identical across visual
 * registers. Only the rendered `MonogramEntryBlankDocument` carries the
 * style-specific look.
 */
export function MonogramEntryBlankButton({
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
      dog={props.dog}
      document={<MonogramEntryBlankDocument {...props} />}
      fileName={pdfFilename}
      label={label}
      className={className}
    />
  );
}
