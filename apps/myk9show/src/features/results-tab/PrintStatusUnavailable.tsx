import { Button } from '@/components/ui/button';

/** Stands in for the print rows when their class rows or confirmations could not be read. */
export function PrintStatusUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
    >
      <span>Print status unavailable. Check your connection and try again.</span>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
