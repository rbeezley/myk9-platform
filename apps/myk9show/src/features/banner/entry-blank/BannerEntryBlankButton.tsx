import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildEntryBlankProps,
  type BuildEntryBlankOptions,
} from '@/features/heritage/entry-blank/buildEntryBlankProps';
import { BannerEntryBlankDocument } from './BannerEntryBlankDocument';

interface Props extends BuildEntryBlankOptions {
  /** Per-club flag color hex from show.brand_color. */
  brandColor?: string | null;
  label?: string;
  filename?: string;
  className?: string;
}

/**
 * Banner-styled entry-blank PDF download button. Reuses Heritage's
 * `buildEntryBlankProps` data builder; only the rendered document carries
 * the Banner visual register + per-club flag color.
 */
export function BannerEntryBlankButton({
  brandColor,
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
      document={<BannerEntryBlankDocument {...props} brandColor={brandColor} />}
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
