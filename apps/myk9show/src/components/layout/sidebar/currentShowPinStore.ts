import { create } from 'zustand';
import {
  CURRENT_SHOW_CHOICE_KEY,
  clearCurrentShowChoice,
  readCurrentShowChoice,
  writeCurrentShowChoice,
} from './currentShow';

interface CurrentShowPinState {
  /** The pinned show's id, as stored; honoured only while that show is still in Managing. */
  pinnedId: string | null;
  pin: (id: string) => void;
  /** Back to the automatic pick. */
  unpin: () => void;
}

/**
 * The one manual override of the automatic current show: a pin on a Home show card (MYK9-1490,
 * replacing the rail's Switch menu). Shared, so the card and the rail read one value and a pin
 * shows in the rail at once. Per-device, in localStorage; another tab's pin arrives through the
 * storage event.
 */
export const useCurrentShowPinStore = create<CurrentShowPinState>(set => ({
  pinnedId: readCurrentShowChoice(),
  pin: id => {
    writeCurrentShowChoice(id);
    set({ pinnedId: id });
  },
  unpin: () => {
    clearCurrentShowChoice();
    set({ pinnedId: null });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== CURRENT_SHOW_CHOICE_KEY) return;
    useCurrentShowPinStore.setState({ pinnedId: event.newValue || null });
  });
}
