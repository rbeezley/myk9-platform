import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <PDFDownloadLink
      document={<MonogramEntryBlankDocument {...props} />}
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
