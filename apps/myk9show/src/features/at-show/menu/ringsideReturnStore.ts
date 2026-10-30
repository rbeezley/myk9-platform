/**
 * Where a ringside menu destination sends the user back to (MYK9-1508).
 *
 * The menu records the ringside screen it was opened on (path, query and the
 * class list's `?view=`), and the return bar navigates back to that URL.
 * `scope` keeps the bar on the destination's own pages only.
 */
import { create } from 'zustand';

export interface RingsideReturn {
  /** The ringside screen to come back to, path plus query. */
  returnTo: string;
  /** Route prefix of the destination; the bar shows only under it. */
  scope: string;
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
