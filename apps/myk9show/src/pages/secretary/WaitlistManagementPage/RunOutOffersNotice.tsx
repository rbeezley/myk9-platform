/**
 * Offers that ran out and whose spot nobody has been offered since (MYK9-1988), class by class.
 * One line per offer: these are the rows the run-out count counts (`findRunOutOffers`, read by
 * `getWaitlistOffersByClass`), so a count of them equals what this list shows.
 */

import { Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatOfferDeadline } from '@/lib/format/offerDeadline';
import { formatTrialLabel } from './trialLabel';
import type { WaitlistOffer } from './types';

interface RunOutOffersNoticeProps {
  /** Oldest offer first. */
  offers: WaitlistOffer[];
}

interface ClassRunOut {
  key: string;
  title: string;
  offers: WaitlistOffer[];
}

function groupByClass(offers: WaitlistOffer[]): ClassRunOut[] {
  const groups = new Map<string, ClassRunOut>();
  for (const offer of offers) {
    const group = groups.get(offer.class_id);
    if (group) {
      group.offers.push(offer);
      continue;
    }
    const trial = formatTrialLabel({ name: offer.trial_name, date: offer.trial_date });
    const className = offer.class?.name ?? 'a class';
    groups.set(offer.class_id, {
      key: offer.class_id,
      title: trial ? `${className} (${trial})` : className,
      offers: [offer],
    });
  }
  return [...groups.values()];
}

export function runOutHeadline(count: number, className: string): string {
  return count === 1
    ? `1 offer has run out in ${className}.`
    : `${count} offers have run out in ${className}.`;
}

export function RunOutOffersNotice({ offers }: RunOutOffersNoticeProps) {
  if (offers.length === 0) return null;
  return (
    <Card data-testid="waitlist-run-out-offers">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5" />
          Offers that ran out
        </CardTitle>
        <CardDescription>
          Not paid in time, and no other dog has been offered these spots yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groupByClass(offers).map(group => (
          <div key={group.key} data-testid="waitlist-run-out-class">
            <p className="font-medium">{runOutHeadline(group.offers.length, group.title)}</p>
            <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
              {group.offers.map(offer => {
                const offered = formatOfferDeadline(offer.offered_at, offer.trial_timezone);
                const ranOut = formatOfferDeadline(offer.offer_expires_at, offer.trial_timezone);
                return (
                  <li key={offer.id} data-testid="waitlist-run-out-offer">
                    <span className="font-medium text-foreground">
                      {offer.dog?.call_name || offer.dog?.name || 'Unknown Dog'}
                    </span>
                    {offered && <> · offered {offered}</>}
                    {ranOut && <> · ran out {ranOut}</>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
