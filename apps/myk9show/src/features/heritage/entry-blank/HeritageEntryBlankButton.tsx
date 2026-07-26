import { EntryBlankDownloadControl } from '@/features/_shared/EntryBlankDownloadControl';
import { HeritageEntryBlankDocument } from './HeritageEntryBlankDocument';
import type { BuildEntryBlankOptions } from './buildEntryBlankProps';
import { buildEntryBlankProps } from './buildEntryBlankProps';

interface Props extends BuildEntryBlankOptions {
  /** Button label. Defaults to "Download Entry Blank". */
  label?: string;
  filename?: string;
  className?: string;
}

export function HeritageEntryBlankButton({
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
      document={<HeritageEntryBlankDocument {...props} />}
      fileName={pdfFilename}
      label={label}
      className={className}
    />
  );
}
