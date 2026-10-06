/**
 * Wait List queue section for the My Shows page. Extracted from `index.tsx`
 * (task 4.7) to keep the page shell under the 500-line ratchet.
 *
 * @module MyEntriesPage/modules/WaitListSection
 */

import React from 'react';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatOfferDeadline } from '@/lib/format/offerDeadline';
import type { WaitListEntry } from '@/types/waitlist-types';

interface WaitListSectionProps {
  entries: WaitListEntry[];
  isLoading: boolean;
  onWithdraw: (id: string) => void;
  isWithdrawing: boolean;
  onStartPayment: (entryId: string, waitlistEntryId: string) => void;
  onDecline: (id: string) => void;
  payingEntryId: string | null;
  decliningOfferId: string | null;
  paymentError: string | null;
  paymentErrorOfferId: string | null;
  declineError: string | null;
  declineErrorOfferId: string | null;
  focusedOfferId: string | null;
  autoFocusHandled?: boolean;
  onOfferDeadlineElapsed: () => void;
}

type OfferDisplayState =
  'waiting' | 'offered' | 'checking' | 'expired' | 'declined' | 'withdrawn' | 'reconciled';

function getOfferDisplayState(entry: WaitListEntry, now: Date): OfferDisplayState {
  if (entry.status === 'declined') return 'declined';
  if (entry.status === 'withdrawn') return 'withdrawn';
  if (entry.status === 'accepted') return 'reconciled';
  if (entry.status === 'expired') return 'expired';
  if (entry.status !== 'offered') return 'waiting';
  // Mail-in offers keep their stored timestamp but the expiry job never closes them.
  if (entry.joinedVia === 'mail_in') return 'offered';

  const offerDeadline = entry.offerExpiresAt ? Date.parse(entry.offerExpiresAt) : Number.NaN;
  if (Number.isFinite(offerDeadline) && offerDeadline <= now.getTime()) return 'checking';

  return 'offered';
}

/**
 * Mail-in offers have no automatic deadline. Online deadlines use the trial's
 * zone, matching the offer message and email ("claim it by <day, time>"). No
 * countdown: a ticking figure turns a calm offer into pressure. Invalid or
 * missing zones fall back to New York, like the server-side copy.
 */
function describeOfferTiming(entry: WaitListEntry): string {
  if (entry.joinedVia === 'mail_in') {
    return 'The club is holding this spot for you until they receive your payment. Pay the club directly or contact the show secretary.';
  }
  const when = formatOfferDeadline(entry.offerExpiresAt, entry.trialTimezone);
  return when ? `Claim by ${when}` : 'Claim it before the offer ends.';
}

export const WaitListSection: React.FC<WaitListSectionProps> = ({
  entries,
  isLoading,
  onWithdraw,
  isWithdrawing,
  onStartPayment,
  onDecline,
  payingEntryId,
  decliningOfferId,
  paymentError,
  paymentErrorOfferId,
  declineError,
  declineErrorOfferId,
  focusedOfferId,
  autoFocusHandled = false,
  onOfferDeadlineElapsed,
}) => {
  const [now, setNow] = React.useState(() => new Date());
  const focusedOfferIdScrolledRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (autoFocusHandled || !focusedOfferId || focusedOfferIdScrolledRef.current === focusedOfferId)
      return;
    const target = document.getElementById(`waitlist-offer-${focusedOfferId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
    focusedOfferIdScrolledRef.current = focusedOfferId;
  }, [entries, focusedOfferId, autoFocusHandled]);

  React.useEffect(() => {
    if (!entries.some(entry => getOfferDisplayState(entry, now) === 'checking')) return;

    onOfferDeadlineElapsed();
    const retry = window.setTimeout(onOfferDeadlineElapsed, 30_000);
    return () => window.clearTimeout(retry);
  }, [entries, now, onOfferDeadlineElapsed]);

  // No container/width wrapper of its own: the section now sits INSIDE the page
  // stack (it used to hang off the bottom of the page below the container), so
  // owning its own gutters here would double the page's padding and nest a
  // max-width inside a max-width.
  // A neutral card, not an amber one. Two reasons, one measured and one from
  // the design system. Measured: `text-muted-foreground` on a `bg-warning/10`
  // fill reaches only 3.70:1 in dark mode against a 4.5:1 floor — the 10% tint
  // lifts the surface just enough to break a token that passes everywhere else.
  // On a plain card the same text clears AA. Design: amber means caution, and a
  // wait-list position is not a problem — it is a normal queue state. Tinting
  // the whole container amber spent a status colour on chrome, then rendered a
  // green "Spot offered" badge inside it, which is what DESIGN.md's "The Status
  // Is Sacred" rule forbids. The time-sensitive signal now lives on the title
  // and the position chip, where it actually means something.
  return (
    <Card className="border border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-warning ">
          <Users className="h-4 w-4" />
          My Wait List Positions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active wait list positions.</p>
        ) : (
          <div className="space-y-3">
            {entries.map(entry => {
              const displayState = getOfferDisplayState(entry, now);
              const isFocused = entry.id === focusedOfferId;
              const isOfferActionable =
                displayState === 'offered' &&
                entry.joinedVia !== 'mail_in' &&
                entry.promotedEntryId;
              const isPayingOffer = payingEntryId === entry.promotedEntryId;
              const isDecliningOffer = decliningOfferId === entry.id;
              const hasPaymentError =
                entry.joinedVia !== 'mail_in' && paymentErrorOfferId === entry.id && !!paymentError;
              const hasDeclineError = declineErrorOfferId === entry.id && !!declineError;

              return (
                <section
                  key={entry.id}
                  id={`waitlist-offer-${entry.id}`}
                  role="region"
                  aria-label={`Waitlist offer for ${entry.dogName}`}
                  tabIndex={-1}
                  className={`rounded-lg border bg-background px-4 py-3 outline-none transition-colors ${
                    isFocused
                      ? 'border-primary ring-2 ring-ring ring-offset-2 ring-offset-background'
                      : 'border-border'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-warning/10 text-sm font-semibold text-warning">
                        #{entry.position}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{entry.dogName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {entry.className} <span aria-hidden="true">·</span> {entry.showName}
                        </p>
                        {displayState === 'offered' && (
                          <p className="mt-1 text-sm font-medium text-success">
                            {describeOfferTiming(entry)}
                          </p>
                        )}
                        {displayState === 'checking' && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Checking whether this offer is still available.
                          </p>
                        )}
                        {displayState === 'expired' && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            This offer has expired.
                          </p>
                        )}
                        {displayState === 'declined' && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            You declined this spot.
                          </p>
                        )}
                        {displayState === 'withdrawn' && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            The club withdrew this offer. Contact the show secretary with questions.
                          </p>
                        )}
                        {displayState === 'reconciled' && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Payment is being confirmed. Refresh My Entries shortly.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {displayState === 'offered' && (
                        <Badge variant="outline" className="border-success/50 text-success text-xs">
                          Spot offered
                        </Badge>
                      )}
                      {displayState === 'checking' && (
                        <Badge variant="outline" className="text-xs">
                          Checking offer
                        </Badge>
                      )}
                      {isOfferActionable ? (
                        <>
                          <button
                            onClick={() => onStartPayment(entry.promotedEntryId!, entry.id)}
                            disabled={isPayingOffer || isDecliningOffer}
                            className="inline-flex min-h-[44px] items-center justify-center rounded bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                          >
                            {isPayingOffer
                              ? 'Starting payment…'
                              : hasPaymentError
                                ? 'Try payment again'
                                : 'Complete payment'}
                          </button>
                          <button
                            onClick={() => onDecline(entry.id)}
                            disabled={isPayingOffer || isDecliningOffer}
                            className="inline-flex min-h-[44px] items-center justify-center rounded px-3 text-sm text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                          >
                            {isDecliningOffer ? 'Declining…' : 'Decline'}
                          </button>
                        </>
                      ) : displayState === 'waiting' ? (
                        <button
                          onClick={() => onWithdraw(entry.id)}
                          disabled={isWithdrawing}
                          className="inline-flex min-h-[44px] items-center rounded px-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                        >
                          Withdraw
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {displayState === 'offered' && hasPaymentError && (
                    <p className="mt-3 text-sm text-muted-foreground" role="status">
                      Your spot is still held. Please try payment again.
                    </p>
                  )}
                  {displayState === 'offered' && hasDeclineError && (
                    <p className="mt-3 text-sm text-muted-foreground" role="status">
                      We could not decline this spot. Please try again.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WaitListSection;
