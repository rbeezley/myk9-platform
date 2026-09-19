import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCartCurrency } from '@/store/cartStore.helpers';
import { availabilityPlaceholder } from '../PaymentStep/types';
import type { PanelDogGroup } from './EntriesPanel.helpers';

export interface EntriesPanelLinesProps {
  groups: PanelDogGroup[];
  /** Payment step only: renders the per-line remove control. */
  onRemoveLine?: ((dogId: string, classId: string) => void | Promise<void>) | undefined;
  removingLineKey?: string | null | undefined;
  /** Selected classes that are wait-list requests, so they are not charged now. */
  waitlistClassIds?: ReadonlySet<string> | undefined;
  capacityReady?: boolean | undefined;
  capacityUnavailable?: boolean | undefined;
  /** Overrides the availability copy when another read is the reason. */
  placeholder?: string | undefined;
}

/**
 * The itemised list: one block per dog, one row per class.
 *
 * Shared verbatim by the desktop aside and the phone bar's Details disclosure,
 * so the two can never itemise the entry differently.
 */
export const EntriesPanelLines: React.FC<EntriesPanelLinesProps> = ({
  groups,
  onRemoveLine,
  removingLineKey,
  waitlistClassIds,
  capacityReady = true,
  capacityUnavailable,
  placeholder,
}) => (
  <div className="space-y-4">
    {groups.map(group => (
      <div key={group.dogId} className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {group.dogName}
        </p>
        {group.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No classes yet</p>
        ) : (
          group.lines.map(line => {
            const isWaitlist = !!waitlistClassIds?.has(line.classId);
            return (
              <div
                key={line.lineKey}
                data-testid="entries-panel-line"
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0 break-words text-foreground">
                  {line.dayLabel && (
                    <span className="text-muted-foreground">{line.dayLabel} · </span>
                  )}
                  {line.label}
                  {capacityReady && isWaitlist && (
                    <span className="ml-2 font-medium text-warning">(Wait list request)</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="tabular-nums">
                    {!capacityReady
                      ? (placeholder ?? availabilityPlaceholder(capacityUnavailable))
                      : isWaitlist
                        ? 'No payment due'
                        : formatCartCurrency(line.feeCents)}
                  </span>
                  {onRemoveLine && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="min-h-11 min-w-11"
                      title={`Remove ${line.label}`}
                      aria-label={`Remove ${line.label}`}
                      disabled={removingLineKey === line.lineKey}
                      onClick={() => void onRemoveLine(group.dogId, line.classId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    ))}
  </div>
);
