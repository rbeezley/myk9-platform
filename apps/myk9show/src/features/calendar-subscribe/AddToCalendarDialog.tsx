import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Copy, Check, Download, Link2Off, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notifications } from '@/lib/notifications';
import { useCalendarFeed } from './useCalendarFeed';
import { buildIcsFilename } from './calendarFeedUrls';

interface AddToCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showId: string;
  showName: string | null;
}

/**
 * Two ways to get a show's runs into a calendar, and they are not the same
 * thing — the copy here has to make that difference obvious, because choosing
 * wrong is invisible until show day:
 *
 *   Subscribe — the calendar re-fetches, so times move when judging runs ahead
 *               or behind. This is the one exhibitors actually want.
 *   Download  — a snapshot. Correct at the moment of download and never again.
 */
export function AddToCalendarDialog({
  open,
  onOpenChange,
  showId,
  showName,
}: AddToCalendarDialogProps) {
  const { urls, loading, error, issue, revoke, configured } = useCalendarFeed();
  const [copied, setCopied] = useState(false);
  const requestedRef = useRef(false);

  // Issue on first open so the link is ready without an extra click. Guarded so
  // a re-render cannot rotate the token behind the exhibitor's back — rotation
  // invalidates the URL they may have just added to their phone.
  useEffect(() => {
    if (!open || !configured || requestedRef.current) return;
    requestedRef.current = true;
    void issue(showId);
  }, [open, configured, issue, showId]);

  // Reset on close in the handler rather than an effect — a synchronous
  // setState inside an effect cascades renders (and the repo lints against it).
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      requestedRef.current = false;
      setCopied(false);
    }
    onOpenChange(next);
  };

  const handleCopy = async () => {
    if (!urls) return;
    try {
      await navigator.clipboard.writeText(urls.displayUrl);
      setCopied(true);
      notifications.success('Calendar link copied.');
    } catch {
      // Clipboard permissions vary; the link is on screen to copy by hand.
      notifications.error('Could not copy automatically. Select the link below.');
    }
  };

  const handleRevoke = async () => {
    if (await revoke(showId)) {
      requestedRef.current = false;
      notifications.success('Calendar link turned off. Any calendar using it will stop updating.');
      handleOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" />
            Add to calendar
          </DialogTitle>
          <DialogDescription>
            {showName
              ? `Put your runs for ${showName} in the calendar app you already use.`
              : 'Put your runs in the calendar app you already use.'}
          </DialogDescription>
        </DialogHeader>

        {!configured && (
          <p className="text-sm text-muted-foreground">
            Calendar links aren&apos;t available yet. Please check back.
          </p>
        )}

        {configured && loading && !urls && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing your link…
          </div>
        )}

        {configured && error && !urls && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {configured && urls && (
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Subscribe — stays up to date</h3>
              <p className="text-xs text-muted-foreground">
                Your calendar re-checks this link, so run times update as the day runs ahead or
                behind. Recommended.
              </p>
              <Button asChild className="w-full">
                {/* Not a fetch: webcal:// hands off to the OS calendar app. */}
                <a href={urls.subscribeUrl}>Subscribe in my calendar</a>
              </Button>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">
                  {urls.displayUrl}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopy} aria-label="Copy link">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </section>

            <section className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold">Download — a snapshot</h3>
              <p className="text-xs text-muted-foreground">
                A one-time file. It won&apos;t update if the schedule changes.
              </p>
              <Button asChild variant="outline" className="w-full">
                <a href={urls.downloadUrl} download={buildIcsFilename(showName)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download .ics
                </a>
              </Button>
            </section>

            <section className="border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRevoke}
                disabled={loading}
                className="text-muted-foreground"
              >
                <Link2Off className="mr-2 h-4 w-4" />
                Turn off this link
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                Use this if you shared the link by mistake. You can create a new one any time.
              </p>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
