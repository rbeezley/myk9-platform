import type { Show } from '@/types/show-types';
import { Badge } from '@/components/ui/badge';
import { formatFee } from '@/utils/format';
import { toLocalDate } from '@/utils/date-format';
import { FactCell } from '@/components/common/FactCell';

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = toLocalDate(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/** Blank means unset. A fee of 0 is a real (free) fee, so this is not a truthiness check. */
function isBlank(value: string | number | null | undefined): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

function getEntryCloseValue(entryCloseDate: string): string | null {
  const close = parseDate(entryCloseDate);
  if (!close) return null;
  return close.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PAYMENT_BADGE_CLASS = 'bg-[#e8e6dc] border-[#d1cfc5] text-[#4d4c48] font-normal';

interface QuickInfoCardsProps {
  show: Show;
  canManageShow?: boolean;
  entryCount?: number | null;
}

export function QuickInfoCards({ show, canManageShow, entryCount }: QuickInfoCardsProps) {
  const entryCloseValue = show.entryCloseDate ? getEntryCloseValue(show.entryCloseDate) : null;

  return (
    <div className="flex flex-wrap">
      {canManageShow && entryCount !== undefined ? (
        <FactCell
          label="Total Entries"
          value={entryCount === null ? 'Unavailable' : String(entryCount)}
          {...(entryCloseValue ? { secondary: `Closes ${entryCloseValue}` } : {})}
        />
      ) : (
        <FactCell label="Entries Close" value={entryCloseValue} />
      )}
      <FactCell label="Location" value={isBlank(show.location) ? null : show.location} />
      <FactCell
        label="Entry Fee"
        value={isBlank(show.preEntryFee) ? null : formatFee(show.preEntryFee)}
        secondary={show.dayOfShowFee ? `Day of show: ${formatFee(show.dayOfShowFee)}` : null}
      />
      <div className="flex-1 min-w-[120px] px-4 py-2.5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
          Payment Methods
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className={PAYMENT_BADGE_CLASS}>
            Card
          </Badge>
          {show.acceptCheckPayments && (
            <Badge variant="outline" className={PAYMENT_BADGE_CLASS}>
              Check
            </Badge>
          )}
          {show.acceptCashPayments && (
            <Badge variant="outline" className={PAYMENT_BADGE_CLASS}>
              Cash
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
