import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ENTRY_LIST_LABELS } from './entryManagementViews';
import type { EntryManagementException } from './entryManagementCockpitParams';

/** Lists whose pane already renders its own heading; a second one would read twice. */
const PANE_HAS_OWN_TITLE: ReadonlySet<EntryManagementException> = new Set([
  'pulls',
  'move-ups',
  'registration-needed',
]);

/**
 * The title row of an entry list opened from the header Actions menu (Pulls, Move-ups,
 * Registration number needed, Waitlist; MYK9-1594). Those lists swap the whole pane for a
 * different component with its own controls, so this says which one you are in and the way back.
 * Panes that already carry a heading (Pull Management, Move-Up Requests, Registration number
 * needed) get only the way back; Waitlist has none, so it gets a title. The way back is a link to this same page with no list named: a real history entry, so the
 * browser's Back returns to the list.
 */
export function EntryListViewHeader({ exception }: { exception: EntryManagementException }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {!PANE_HAS_OWN_TITLE.has(exception) && (
        <h2 className="text-xl font-semibold">{ENTRY_LIST_LABELS[exception]}</h2>
      )}
      <Button asChild variant="outline" className="min-h-11 gap-2">
        <Link to={{ search: '' }}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to entry forms
        </Link>
      </Button>
    </div>
  );
}
