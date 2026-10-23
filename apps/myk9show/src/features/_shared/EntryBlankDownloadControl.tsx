import { createElement, useState, type ComponentType, type ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { loadReactPdf } from './loadReactPdf';
import { saveAs } from 'file-saver';
import { Download, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MissingRegistrationNotice } from '@/features/heritage/entry-blank/MissingRegistrationNotice';
import type { EntryBlankProps } from '@/features/heritage/entry-blank/types';

interface EntryBlankDownloadControlProps<P extends object> {
  /**
   * Resolves the style's `*EntryBlankDocument` component. Must be a dynamic
   * `import()` supplied by the style's button: a static import of the document
   * pulls `@react-pdf/renderer` (yoga, fontkit; ~1.2 MB) into every page that
   * mounts the button.
   */
  loadDocument: () => Promise<ComponentType<P>>;
  documentProps: P;
  dog: Pick<EntryBlankProps['dog'], 'missingRegistration'>;
  fileName: string;
  label: string;
  className?: string | undefined;
}

function entryLabel(label: string): string {
  return label.replace(/^Download\s+/i, '');
}

/**
 * Shared download control for every styled entry blank.
 *
 * Nothing PDF-related loads until the operator shows intent (hover or focus
 * warms the chunk) and nothing is generated until they click. The button
 * itself carries the preparing state; there is no dialog.
 *
 * A dog missing the trial organization's registration keeps the warning and
 * an explicit "Generate partly filled form" step: that click is the
 * acknowledgement and starts the download in the same gesture.
 */
export function EntryBlankDownloadControl<P extends object>({
  loadDocument,
  documentProps,
  dog,
  fileName,
  label,
  className,
}: EntryBlankDownloadControlProps<P>) {
  const [missingRegistrationAcknowledged, setMissingRegistrationAcknowledged] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);
  const requiresAcknowledgement = dog.missingRegistration && !missingRegistrationAcknowledged;

  const warm = () => {
    // Intent only: failures surface on the click that actually needs the PDF.
    void Promise.all([loadReactPdf(), loadDocument()]).catch(() => undefined);
  };

  const download = async () => {
    if (preparing) return;
    setPreparing(true);
    setFailed(false);
    try {
      const [{ pdf }, Document] = await Promise.all([loadReactPdf(), loadDocument()]);
      const blob = await pdf(
        createElement(Document, documentProps) as ReactElement<DocumentProps>
      ).toBlob();
      saveAs(blob, fileName);
    } catch {
      setFailed(true);
    } finally {
      setPreparing(false);
    }
  };

  return (
    <>
      <MissingRegistrationNotice dog={dog} />
      {requiresAcknowledgement ? (
        <Button
          type="button"
          variant="outline"
          className={className}
          onClick={() => {
            setMissingRegistrationAcknowledged(true);
            void download();
          }}
          onPointerEnter={warm}
          onFocus={warm}
          aria-label={`Generate partly filled form for ${entryLabel(label)}`}
        >
          <FileWarning className="mr-2 h-4 w-4" aria-hidden="true" />
          Generate partly filled form
        </Button>
      ) : (
        <div className="block">
          <Button
            type="button"
            variant="outline"
            className={className}
            disabled={preparing}
            onClick={() => void download()}
            onPointerEnter={warm}
            onFocus={warm}
            aria-label={preparing ? `Preparing ${entryLabel(label)}…` : label}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            {preparing ? 'Preparing…' : label}
          </Button>
          {failed ? (
            <p role="alert" className="mt-1 text-sm text-destructive">
              Couldn’t prepare {entryLabel(label)}. Check your connection and try again.
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
