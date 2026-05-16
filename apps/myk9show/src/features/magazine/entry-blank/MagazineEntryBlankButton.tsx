import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MagazineEntryBlankDocument } from './MagazineEntryBlankDocument';
import {
  buildEntryBlankProps,
  type BuildEntryBlankOptions,
} from '@/features/heritage/entry-blank';

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
 * surface. The PDF is generated lazily by react-pdf when the user clicks
 * the link — no upfront render cost.
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
    <PDFDownloadLink
      document={<MagazineEntryBlankDocument {...props} />}
      fileName={pdfFilename}
      className="block"
    >
      {({ loading }) => (
        <Button
          variant="outline"
          className={className}
          disabled={loading}
          aria-label={loading ? 'Preparing entry blank…' : label}
        >
          <Download className="mr-2 h-4 w-4" />
          {loading ? 'Preparing…' : label}
        </Button>
      )}
    </PDFDownloadLink>
  );
}
