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
import type { WaitListEntry } from '@/types/waitlist-types';

interface WaitListSectionProps {
  entries: WaitListEntry[];
  isLoading: boolean;
  onWithdraw: (id: string) => void;
  isWithdrawing: boolean;
}

export const WaitListSection: React.FC<WaitListSectionProps> = ({
  entries,
  isLoading,
  onWithdraw,
  isWithdrawing,
}) => (
  <div className="container mx-auto px-6 pb-4 max-w-7xl">
    <Card className="border border-warning/30 bg-warning/10 ">
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
              <div key={i} className="h-14 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active wait list positions.</p>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/60 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning text-sm font-semibold">
                    #{entry.position}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.dogName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.className} <span aria-hidden="true">·</span> {entry.showName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {entry.status === 'offered' && (
                    <Badge variant="outline" className="border-success/50 text-success text-xs">
                      Spot Offered
                    </Badge>
                  )}
                  <button
                    onClick={() => onWithdraw(entry.id)}
                    disabled={isWithdrawing}
                    className="inline-flex min-h-[44px] items-center rounded px-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  </div>
);

export default WaitListSection;
