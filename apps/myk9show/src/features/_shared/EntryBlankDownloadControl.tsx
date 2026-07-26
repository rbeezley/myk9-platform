import { useState, type ReactElement } from 'react';
import { PDFDownloadLink, type DocumentProps } from '@react-pdf/renderer';
import { Download, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MissingRegistrationNotice } from '@/features/heritage/entry-blank/MissingRegistrationNotice';
import type { EntryBlankProps } from '@/features/heritage/entry-blank/types';

interface EntryBlankDownloadControlProps {
  document: ReactElement<DocumentProps>;
  dog: Pick<EntryBlankProps['dog'], 'missingRegistration'>;
  fileName: string;
  label: string;
  className?: string | undefined;
}

function entryLabel(label: string): string {
  return label.replace(/^Download\s+/i, '');
}

/**
 * Shared temporal gate for every styled entry blank.
 *
 * React PDF starts generating as soon as PDFDownloadLink mounts. For a dog
 * missing the trial organization's registration, keep the link unmounted
 * until the operator has seen the warning and explicitly chooses to continue.
 */
export function EntryBlankDownloadControl({
  document,
  dog,
  fileName,
  label,
  className,
}: EntryBlankDownloadControlProps) {
  const [missingRegistrationAcknowledged, setMissingRegistrationAcknowledged] = useState(false);
  const requiresAcknowledgement = dog.missingRegistration && !missingRegistrationAcknowledged;

  return (
    <>
      <MissingRegistrationNotice dog={dog} />
      {requiresAcknowledgement ? (
        <Button
          type="button"
          variant="outline"
          className={className}
          onClick={() => setMissingRegistrationAcknowledged(true)}
          aria-label={`Generate partly filled form for ${entryLabel(label)}`}
        >
          <FileWarning className="mr-2 h-4 w-4" aria-hidden="true" />
          Generate partly filled form
        </Button>
      ) : (
        <PDFDownloadLink document={document} fileName={fileName} className="block">
          {({ loading }) => (
            <Button
              type="button"
              variant="outline"
              className={className}
              disabled={loading}
              aria-label={loading ? `Preparing ${entryLabel(label)}…` : label}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {loading ? 'Preparing…' : label}
            </Button>
          )}
        </PDFDownloadLink>
      )}
    </>
  );
}
