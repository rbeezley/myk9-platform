import { EntryBlankDownloadControl } from '@/features/_shared/EntryBlankDownloadControl';
import {
  buildEntryBlankProps,
  type BuildEntryBlankOptions,
} from '@/features/heritage/entry-blank/buildEntryBlankProps';

interface Props extends BuildEntryBlankOptions {
  /** Button label. Defaults to "Download Entry Blank". */
  label?: string;
  filename?: string;
  className?: string;
}

/**
 * Magazine entry-blank download button.
 *
 * Renders `EntryBlankDownloadControl`, which loads the PDF renderer and this
 * style's document only when the button is used.
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
      loadDocument={() =>
        import('./MagazineEntryBlankDocument').then(m => m.MagazineEntryBlankDocument)
      }
      dog={props.dog}
      documentProps={props}
      fileName={pdfFilename}
      label={label}
      className={className}
    />
  );
}
