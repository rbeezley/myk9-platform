import { Input } from '@/components/ui/input';
import { ANNOUNCEMENT_SORT_OPTIONS, type AnnouncementSort } from './announcementListControls';

interface AnnouncementListControlsBarProps {
  query: string;
  sort: AnnouncementSort;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: AnnouncementSort) => void;
}

export function AnnouncementListControlsBar({
  query,
  sort,
  onQueryChange,
  onSortChange,
}: AnnouncementListControlsBarProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/50 p-3">
      <Input
        type="search"
        value={query}
        onChange={event => onQueryChange(event.target.value)}
        placeholder="Search messages"
        aria-label="Search show messages"
        className="min-h-12"
      />
      <select
        value={sort}
        onChange={event => onSortChange(event.target.value as AnnouncementSort)}
        aria-label="Sort show messages"
        className="min-h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        {ANNOUNCEMENT_SORT_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
