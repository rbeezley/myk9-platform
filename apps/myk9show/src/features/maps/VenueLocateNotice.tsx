import { Button } from '@/components/ui/button';
import type { VenueLocateNoticeValue } from './useVenueLocate';

/** Why Locate address found nothing, with Try again when repeating can help (MYK9-686). */
export function VenueLocateNotice({
  notice,
  onRetry,
}: {
  notice: VenueLocateNoticeValue;
  onRetry: () => void;
}) {
  return (
    <div className="mb-2 flex items-start justify-between gap-2 text-sm text-warning" role="status">
      <p>{notice.message}</p>
      {notice.canRetry && (
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
