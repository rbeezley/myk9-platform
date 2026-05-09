import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BuildEntryBlankOptions } from '@/features/heritage/entry-blank/buildEntryBlankProps';
import { buildEntryBlankProps } from '@/features/heritage/entry-blank/buildEntryBlankProps';
import { HeadlineEntryBlankDocument } from './HeadlineEntryBlankDocument';

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
    <PDFDownloadLink
      document={<HeadlineEntryBlankDocument {...props} />}
      fileName={pdfFilename}
      className="block"
    >
      {({ loading }) => (
        <Button
          variant="outline"
          className={className}
          disabled={loading}
          aria-label={loading ? 'Preparing entry blank...' : label}
        >
          <Download className="mr-2 h-4 w-4" />
          {loading ? 'Preparing...' : label}
        </Button>
      )}
    </PDFDownloadLink>
  );
}
