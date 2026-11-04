/**
 * The way back from a ringside menu destination that lives under /at-show
 * (MYK9-1697). The return bar stays hidden inside ringside, so a page such as
 * Find a dog or the setup sheet points its own Up at the screen the menu was
 * opened from, carrying that list's filters and scroll, and falls back to its
 * fixed parent when the page was opened directly.
 */
import { useRingsideReturnStore, type RingsideReturnLocationState } from './ringsideReturnStore';

export interface RingsideTripBack {
  to: string;
  state: RingsideReturnLocationState | undefined;
  /** The parent's name for the Up control (MYK9-1500): the entry list or the class list. */
  label: 'Entries' | 'Classes';
}

export function useRingsideTrip(scope: string, fallbackTo: string): RingsideTripBack {
  const trip = useRingsideReturnStore(state =>
    state.target?.scope === scope ? state.target : null
  );
  if (!trip) return { to: fallbackTo, state: undefined, label: 'Classes' };
  const path = trip.returnTo.split('?')[0] ?? trip.returnTo;
  return {
    to: trip.returnTo,
    state: trip.state,
    label: path.includes('/class/') ? 'Entries' : 'Classes',
  };
}
