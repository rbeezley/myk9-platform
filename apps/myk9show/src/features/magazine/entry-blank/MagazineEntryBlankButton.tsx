import { EntryBlankDownloadControl } from '@/features/_shared/EntryBlankDownloadControl';
import { MagazineEntryBlankDocument } from './MagazineEntryBlankDocument';
import { buildEntryBlankProps, type BuildEntryBlankOptions } from '@/features/heritage/entry-blank';

interface Props extends BuildEntryBlankOptions {
  /** Button label. Defaults to "Download Entry Blank". */
  label?: string;
  filename?: string;
  className?: string;
}

/**
 * Magazine entry-blank download button.
 *
 * Wraps `@react-pdf/renderer`'s `PDFDownloadLink` around a shadcn `Button`
 * to keep the button styling consistent with the rest of the wizard
 * surface.
 *
 * Reads `buildEntryBlankProps` from the Heritage entry-blank module
 * (re-exported via Magazine's barrel). The data shape is identical across
 * styles; only the renderer differs.
 */
export function MagazineEntryBlankButton({
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
      document={<MagazineEntryBlankDocument {...props} />}
      fileName={pdfFilename}
      label={label}
      className={className}
    />
  );
}
