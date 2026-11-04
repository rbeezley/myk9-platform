/**
 * Where a ringside menu destination sends the user back to (MYK9-1508).
 *
 * The menu records the ringside screen it was opened on (path, query and the
 * class list's `?view=`), and the return bar navigates back to that URL.
 * `scope` keeps the bar on the destination's own pages only.
 */
import { create } from 'zustand';
import type { EntryListFiltersSnapshot } from '@myk9/ringside';
import type { ClassListSort, ClassListTab } from '../atShowClassListFilter';

export type RingsideListSnapshot =
  | { kind: 'classes'; tab: ClassListTab; search: string; sort: ClassListSort }
  | { kind: 'entries'; filters: EntryListFiltersSnapshot };

export interface RingsideReturnLocationState {
  ringsideList: RingsideListSnapshot;
  scrollY?: number;
}

export interface RingsideReturn {
  /** The ringside screen to come back to, path plus query. */
  returnTo: string;
  /** Route prefix of the destination; the bar shows only under it. */
  scope: string;
  state?: RingsideReturnLocationState | undefined;
  /** True once the user has actually left ringside; only then may arriving back end the trip. */
  departed?: boolean;
}

interface RingsideReturnState {
  target: RingsideReturn | null;
  set: (target: RingsideReturn) => void;
  markDeparted: () => void;
  clear: () => void;
}

export const useRingsideReturnStore = create<RingsideReturnState>()(set => ({
  target: null,
  set: target => set({ target }),
  markDeparted: () =>
    set(state => (state.target ? { target: { ...state.target, departed: true } } : state)),
  clear: () => set({ target: null }),
}));

export function isRingsidePath(pathname: string): boolean {
  return pathname === '/at-show' || pathname.startsWith('/at-show/');
}
