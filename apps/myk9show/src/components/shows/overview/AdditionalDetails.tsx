import { Card } from '@/components/ui/card';
import type { Show } from '@/types/show-types';

interface DetailItem {
  label: string;
  value: string;
}

function getDetailItems(show: Show): DetailItem[] {
  const items: DetailItem[] = [];

  if (show.organization) {
    items.push({ label: 'Organization', value: show.organization });
  }
  if (show.chiefSteward) {
    items.push({ label: 'Chief Steward', value: show.chiefSteward });
  }
  if (show.dayOfShowFee && show.dayOfShowFee !== show.preEntryFee) {
    items.push({ label: 'Day-of-Show Fee', value: show.dayOfShowFee });
  }
  if (show.maxEntriesPerDog) {
    items.push({ label: 'Max Entries per Dog', value: String(show.maxEntriesPerDog) });
  }
  if (show.maxTotalEntries) {
    items.push({ label: 'Max Total Entries', value: String(show.maxTotalEntries) });
  }
  if (show.allowNonOwnerHandlers != null) {
    items.push({
      label: 'Non-Owner Handlers',
      value: show.allowNonOwnerHandlers ? 'Allowed' : 'Not Allowed',
    });
  }

  return items;
}

interface AdditionalDetailsProps {
  show: Show;
}

export function AdditionalDetails({ show }: AdditionalDetailsProps) {
  const items = getDetailItems(show);
  if (items.length === 0) return null;

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">Show Details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map(item => (
          <div key={item.label}>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              {item.label}
            </div>
            <div className="text-sm font-medium text-foreground">{item.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
