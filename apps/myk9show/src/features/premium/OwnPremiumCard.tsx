import { useRef, useState } from 'react';
import { ExternalLink, FileText, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { notifications } from '@/lib/notifications';
import { PREMIUM_CARD_ANCHOR } from '@/features/show-workbench/publishReadiness';
import { openPublishedPremium, usePublishInfo } from './usePublishInfo';
import {
  normalizePremiumLink,
  OWN_PREMIUM_BAD_LINK,
  OWN_PREMIUM_SAVE_FAILED,
  saveOwnPremiumFile,
  saveOwnPremiumLink,
  useOwnPremiumLink,
  useRefreshPremiumState,
  validateOwnPremiumFile,
} from './ownPremium';
import { UnpublishPremiumButton } from './UnpublishPremiumButton';

interface OwnPremiumCardProps {
  showId: string;
  canManageShow: boolean;
  /** Entries made so far, for the unpublish confirmation. */
  entryCount?: number | null | undefined;
}

/**
 * MYK9-2054: the Premium List card for a club that ticks "We publish our own premium list". It
 * replaces "Generate & publish" (the club is never nudged to generate one) with the two ways to
 * hand myK9 its own document: upload the PDF, or paste a link. The public page's "Download
 * premium" then points at it. One card, one home: it sits where the generated premium's card sits.
 */
export function OwnPremiumCard({ showId, canManageShow, entryCount }: OwnPremiumCardProps) {
  const infoQuery = usePublishInfo(showId, canManageShow);
  const linkQuery = useOwnPremiumLink(showId, canManageShow);
  const info = infoQuery.data;
  const link = linkQuery.data ?? null;
  const unreadable = infoQuery.isError || linkQuery.isError;
  const [downloadFailed, setDownloadFailed] = useState(false);
  const refresh = useRefreshPremiumState(showId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasFile = Boolean(info?.hasPublishedPremium);
  const announced = info?.experienceIsPublished === true;
  // Unknown (a read failed) keeps Unpublish on offer: a live document must never look absent.
  const published = hasFile || Boolean(link) || announced || unreadable;

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
      notifications.success(success);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '';
      setError(
        message === 'Choose a PDF file.' || message.startsWith('That PDF')
          ? message
          : OWN_PREMIUM_SAVE_FAILED
      );
    } finally {
      setBusy(false);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const invalid = validateOwnPremiumFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    void run(() => saveOwnPremiumFile(showId, file), 'Premium list uploaded');
  };

  const onSaveLink = () => {
    const normalized = normalizePremiumLink(draft);
    if (!normalized) {
      setError(OWN_PREMIUM_BAD_LINK);
      return;
    }
    void run(async () => {
      await saveOwnPremiumLink(showId, normalized);
      setDraft('');
    }, 'Premium link saved');
  };

  const publishedAt = info?.publishedAt
    ? new Date(info.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';
  const status = unreadable
    ? 'Could not check what is published right now.'
    : hasFile
      ? `Your premium PDF was uploaded ${publishedAt}`.trim()
      : link
        ? 'Your premium list is shared as a link'
        : announced
          ? 'The public announcement is live, but no premium list is attached'
          : 'Upload your premium PDF or paste a link to it';

  return (
    <Card id={PREMIUM_CARD_ANCHOR} className="scroll-mt-20 space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={
            published
              ? 'rounded-md bg-primary/10 p-3 text-primary'
              : 'rounded-md bg-muted p-3 text-muted-foreground'
          }
        >
          <FileText className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Premium List (your club's own)</h3>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">{status}</p>
          {link && <p className="mt-0.5 break-all text-xs text-muted-foreground">{link}</p>}
        </div>
        {hasFile && (
          <Button
            type="button"
            size="touch"
            variant="outline"
            onClick={() => {
              setDownloadFailed(false);
              void openPublishedPremium(showId).then(opened => setDownloadFailed(!opened));
            }}
          >
            Download PDF
          </Button>
        )}
        {link && (
          <Button type="button" size="touch" variant="outline" asChild>
            <a href={link} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open link
            </a>
          </Button>
        )}
        {unreadable && (
          <Button
            type="button"
            size="touch"
            variant="outline"
            onClick={() => {
              void infoQuery.refetch();
              void linkQuery.refetch();
            }}
          >
            Try again
          </Button>
        )}
        {published && (
          <UnpublishPremiumButton showId={showId} entryCount={entryCount} disabled={busy} />
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor={`own-premium-link-${showId}`} className="text-sm font-medium">
            Link to your premium list
          </label>
          <Input
            id={`own-premium-link-${showId}`}
            type="url"
            inputMode="url"
            placeholder="https://yourclub.org/premium.pdf"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            disabled={busy}
          />
        </div>
        <Button type="button" size="touch" onClick={onSaveLink} disabled={busy || !draft.trim()}>
          Save link
        </Button>
        <Button
          type="button"
          size="touch"
          variant="outline"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          <Upload className="mr-2 h-4 w-4" />
          {hasFile ? 'Replace PDF' : 'Upload PDF'}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-label="Premium list PDF"
          tabIndex={-1}
          onChange={event => {
            onFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      {downloadFailed && (
        <p role="alert" className="text-sm text-destructive">
          Couldn't prepare the premium PDF. Allow pop-ups for this site, or try again.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}
