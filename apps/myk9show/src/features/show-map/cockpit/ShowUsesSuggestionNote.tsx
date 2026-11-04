import { useState } from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { getShowEditHref } from '@/components/shows/showEditRoutes';
import { useShowSettings } from '@/hooks/queries/useShowSettingsDatabase';
import { useShowWithLiveUses } from '@/features/show-workbench/useShowWithLiveUses';
import type { Show } from '@/types/show-types';

import { dismissSuggestion, pickSuggestion } from './showUsesSuggestions';

/**
 * At most one quiet suggestion under "Ready for show day" (MYK9-1686). Not a check: it never
 * counts toward "Everything is handled". Dismissing stores per show per switch and hides the note
 * for the rest of this visit, so a dismissal never reveals the next suggestion straight away.
 */
export function ShowUsesSuggestionNote({ show: routeShow }: { show: Show }) {
  const show = useShowWithLiveUses(routeShow);
  const settings = useShowSettings(show.id);
  const [dismissedNow, setDismissedNow] = useState(false);
  const suggestion = dismissedNow
    ? null
    : pickSuggestion(show.id, show, settings.data?.selfCheckinEnabled);
  if (!suggestion) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <p>
        {suggestion.text}{' '}
        <Link
          to={getShowEditHref(show.id, 'venue')}
          className="inline-flex min-h-11 items-center px-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          Turn it on
        </Link>
      </p>
      <button
        type="button"
        aria-label="Dismiss suggestion"
        onClick={() => {
          dismissSuggestion(show.id, suggestion.key);
          setDismissedNow(true);
        }}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
