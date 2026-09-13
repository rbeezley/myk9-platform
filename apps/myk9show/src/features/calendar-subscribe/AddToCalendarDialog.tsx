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
 *   Add     — the calendar re-reads the link on its own, so later schedule
 *             changes arrive. NOT live: the feed asks to be re-read every 30
 *             minutes, but that is a hint. Apple honours a short interval;
 *             Google refreshes subscribed calendars on its own schedule,
 *             often only a few times a day. The copy must not promise the
 *             ring's live running order.
 *   Save    — a one-time file. Correct at the moment it is saved, never again.
 *
 * The copy link is not a nicety. `webcal://` is registered by iOS, macOS and
 * Outlook, but NOT by Android, and the Google Calendar app adds no handler —
 * so for an Android or Google Calendar exhibitor, copying the link into
 * "Other calendars → From URL" is the ONLY path that works. It says so.
 *
 * Audience: exhibitors are largely retired and not confident with computers.
 * Say what a control does and who it is for, in plain words. No jargon
 * ("subscribe", "feed", "URL", "iCal"), no unexplained file extensions.
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
      notifications.success('Link copied.');
    } catch {
      // Clipboard permissions vary; the link is on screen to copy by hand.
      notifications.error('Could not copy it for you. Select the link below and copy it yourself.');
    }
  };

  const handleRevoke = async () => {
    if (await revoke(showId)) {
      requestedRef.current = false;
      notifications.success('Link turned off. Any calendar using it will stop updating.');
      handleOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" />
            Add to calendar
          </DialogTitle>
          <DialogDescription>
            {showName
              ? `Put your runs for ${showName} in the calendar you already use.`
              : 'Put your runs in the calendar you already use.'}
          </DialogDescription>
        </DialogHeader>

        {!configured && (
          <p className="text-sm text-muted-foreground">
            This isn&apos;t ready yet. Please check back later.
          </p>
        )}

        {configured && loading && !urls && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Getting your link ready…
          </div>
        )}

        {configured && error && !urls && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {configured && urls && (
          <div className="min-w-0 space-y-4">
            <div className="space-y-1.5">
              <Button asChild className="min-h-[44px] w-full">
                {/* Not a fetch: webcal:// hands off to the OS calendar app. */}
                <a href={urls.subscribeUrl}>Add to my calendar</a>
              </Button>
              <p className="text-sm text-muted-foreground">Works on iPhone, iPad and Mac.</p>
            </div>

            <div className="space-y-1.5 border-t pt-3">
              <p className="text-sm font-medium">Using Android or Google Calendar?</p>
              {/* INTENT: the Google Calendar phone app cannot add a calendar by
                  link at all — "Other calendars → From URL" exists only in the
                  desktop site. Saying "in Google Calendar" sends this audience
                  hunting for a control that is not there, so name the computer
                  explicitly and promise the phone will catch up. */}
              <p className="text-sm text-muted-foreground">
                This one needs a computer. Copy the link below, go to calendar.google.com, and
                choose Other calendars, then From URL. Your phone will show it soon after.
              </p>
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-2 text-xs">
                  {urls.displayUrl}
                </code>
                <Button
                  variant="outline"
                  onClick={handleCopy}
                  aria-label="Copy the calendar link"
                  className="min-h-[44px] shrink-0"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="ml-2">{copied ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            </div>

            {/* INTENT: never promise live times. A subscribed calendar decides
                its own refresh schedule — Google's is often only a few times a
                day — so an exhibitor at the ring must be sent to the show page,
                not left trusting a stale entry on their phone. */}
            <p className="rounded bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              Your calendar looks for changes on its own, usually a few times a day. It will not
              keep up with last-minute ring changes, so check the show page on the day.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
              <p className="min-w-0 text-sm text-muted-foreground">
                Or save your runs once. They will not update later.
              </p>
              <Button asChild variant="outline" size="sm" className="min-h-[44px] shrink-0">
                <a href={urls.downloadUrl} download={buildIcsFilename(showName)}>
                  <Download className="mr-2 h-4 w-4" />
                  Save a copy
                </a>
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
              <p className="min-w-0 text-sm text-muted-foreground">
                Anyone who has this link can see your schedule.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRevoke}
                disabled={loading}
                className="min-h-[44px] shrink-0 text-muted-foreground"
              >
                <Link2Off className="mr-2 h-4 w-4" />
                Turn off this link
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
