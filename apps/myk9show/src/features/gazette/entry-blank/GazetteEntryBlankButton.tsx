import { EntryBlankDownloadControl } from '@/features/_shared/EntryBlankDownloadControl';
import { GazetteEntryBlankDocument } from './GazetteEntryBlankDocument';
import { buildEntryBlankProps, type BuildEntryBlankOptions } from './index';

interface Props extends BuildEntryBlankOptions {
  /** Button label. Defaults to "Download Entry Blank". */
  label?: string;
  filename?: string;
  className?: string;
}

/**
 * Drop-in button rendering a downloadable Gazette entry blank PDF. The
 * underlying `buildEntryBlankProps` is re-exported from Heritage —
 * Gazette's PDF is a different visual register of the same data, so
 * forking the assembler would only invite drift.
 */
export function GazetteEntryBlankButton({
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
      document={<GazetteEntryBlankDocument {...props} />}
      fileName={pdfFilename}
      label={label}
      className={className}
    />
  );
}
