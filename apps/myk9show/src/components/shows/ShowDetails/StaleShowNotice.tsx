/**
 * Says so when the page is showing a cached show it could not refresh.
 *
 * `useFastShowDetails` seeds `placeholderData` from the shows-list cache or the
 * Zustand store so navigation feels instant. The side effect was that
 * `isError: isNetworkError && !show` suppressed the error whenever a placeholder
 * existed — so after a failed detail read the page rendered a complete,
 * confident show page from a possibly-stale row, dates and entry fee included,
 * with nothing indicating anything had gone wrong.
 *
 * Keeping the cached content is right; showing it silently is not. This is
 * deliberately a thin strip rather than an ErrorState: the content below it is
 * still useful, and replacing a whole readable page with an error because a
 * refresh failed is the mistake in the other direction.
 */
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StaleShowNoticeProps {
  onRetry: () => void;
}

export const StaleShowNotice: React.FC<StaleShowNoticeProps> = ({ onRetry }) => (
  <div
    className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm sm:px-6"
    role="status"
    aria-live="polite"
  >
    <span className="text-foreground">
      Showing saved details — we couldn&rsquo;t reach the server, so dates and fees may be out of
      date.
    </span>
    <Button variant="outline" size="sm" onClick={onRetry}>
      <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
      Retry
    </Button>
  </div>
);
