import { EntryBlankDownloadControl } from '@/features/_shared/EntryBlankDownloadControl';
import type { BuildEntryBlankOptions } from '@/features/heritage/entry-blank/buildEntryBlankProps';
import { buildEntryBlankProps } from '@/features/heritage/entry-blank/buildEntryBlankProps';

interface Props extends BuildEntryBlankOptions {
  label?: string;
  filename?: string;
  className?: string;
}

export function HeadlineEntryBlankButton({
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
      .replace(/[^a-z0-9-]/g, '')}-headline-entry-blank.pdf`;

  return (
    <EntryBlankDownloadControl
      loadDocument={() =>
        import('./HeadlineEntryBlankDocument').then(m => m.HeadlineEntryBlankDocument)
      }
      dog={props.dog}
      documentProps={props}
      fileName={pdfFilename}
      label={label}
      className={className}
    />
  );
}
