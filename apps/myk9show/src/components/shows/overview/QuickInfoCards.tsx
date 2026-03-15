import { CalendarDays, DollarSign, MapPin, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { Show } from '@/types/show-types';

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // Handle both "2026-03-21" and ISO timestamp formats
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function formatShowDate(startDate: string, endDate: string): string {
  const start = parseDate(startDate);
  if (!start) return 'TBD';
  const end = parseDate(endDate) || start;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

  if (start.getTime() === end.getTime()) {
    return start.toLocaleDateString('en-US', { weekday: 'short', ...opts });
  }
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', opts);
  return `${startStr} – ${endStr}`;
}

function getEntryCloseText(entryCloseDate: string): string | null {
  const close = parseDate(entryCloseDate);
  if (!close) return null;
  if (close <= new Date()) return null;
  return `Entries close ${close.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  secondary?: string | null;
  last?: boolean;
}

function InfoItem({ icon, label, value, secondary, last }: InfoItemProps) {
  return (
    <div
      className={`flex items-start gap-3 p-4 ${last ? '' : 'border-b sm:border-b-0 sm:border-r'} border-border/30`}
    >
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
        <div className="text-sm font-semibold text-foreground mt-0.5">{value}</div>
        {secondary && <div className="text-xs text-muted-foreground mt-0.5">{secondary}</div>}
      </div>
    </div>
  );
}

interface QuickInfoCardsProps {
  show: Show;
}

export function QuickInfoCards({ show }: QuickInfoCardsProps) {
  const dateStr = formatShowDate(show.startDate, show.endDate);
  const entryCloseText = show.entryCloseDate ? getEntryCloseText(show.entryCloseDate) : null;

  return (
    <Card className="grid grid-cols-2 sm:grid-cols-4 overflow-hidden">
      <InfoItem
        icon={<CalendarDays className="h-5 w-5" />}
        label="Date"
        value={dateStr}
        secondary={entryCloseText}
      />
      <InfoItem
        icon={<DollarSign className="h-5 w-5" />}
        label="Entry Fee"
        value={show.preEntryFee || 'TBD'}
      />
      <InfoItem
        icon={<MapPin className="h-5 w-5" />}
        label="Location"
        value={show.location || 'TBD'}
      />
      <InfoItem
        icon={<Users className="h-5 w-5" />}
        label="Host Club"
        value={show.clubName || 'TBD'}
        last
      />
    </Card>
  );
}
