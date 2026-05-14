import type { Show } from '@/types/show-types';
import { Badge } from '@/components/ui/badge';
import { formatFee } from '@/utils/format';
import { toLocalDate } from '@/utils/date-format';

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = toLocalDate(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function getEntryCloseValue(entryCloseDate: string): string | null {
  const close = parseDate(entryCloseDate);
  if (!close) return null;
  return close.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface MetadataItemProps {
  label: string;
  value: string;
  secondary?: string | null;
}

function MetadataItem({ label, value, secondary }: MetadataItemProps) {
  return (
    <div className="flex-1 min-w-[120px] px-4 py-2.5 border-r border-border/50 last:border-r-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
      {secondary && <div className="text-xs text-muted-foreground mt-0.5">{secondary}</div>}
    </div>
  );
}

const PAYMENT_BADGE_CLASS = 'bg-indigo-500/12 border-indigo-500/30 text-indigo-300 font-normal';

interface QuickInfoCardsProps {
  show: Show;
}

export function QuickInfoCards({ show }: QuickInfoCardsProps) {
  const entryCloseValue = show.entryCloseDate ? getEntryCloseValue(show.entryCloseDate) : null;

  return (
    <div className="flex flex-wrap">
      <MetadataItem label="Entries Close" value={entryCloseValue ?? 'TBD'} />
      <MetadataItem label="Location" value={show.location || 'TBD'} />
      <MetadataItem
        label="Entry Fee"
        value={show.preEntryFee ? formatFee(show.preEntryFee) : 'TBD'}
        secondary={show.dayOfShowFee ? `Day of show: ${formatFee(show.dayOfShowFee)}` : null}
      />
      <div className="flex-1 min-w-[120px] px-4 py-2.5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground/70 mb-1.5">
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
