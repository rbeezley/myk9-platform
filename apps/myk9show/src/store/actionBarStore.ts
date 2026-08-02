/**
 * Action Bar Registry — how much of the bottom edge is spoken for.
 *
 * Sonner is docked bottom-right, and that is DELIBERATE: the custom
 * `<ToastContainer />` owns the top-right corner, and
 * `test/mainToasterDocking.source.test.ts` pins sonner away from it. So the
 * fix for a toast covering a Save button is not to move the toaster — it is to
 * tell the toaster how tall the thing beneath it is.
 *
 * The 2026-07-24 exhibitor audit recorded the cost of not doing this: a tap
 * meant for "Save Changes" hit a lingering toast's "Enter a show" CTA instead.
 * The app navigated away and discarded the edit silently, while the footer
 * still read "Unsaved changes".
 *
 * Bars report their own measured height. Several can be mounted at once (a
 * slide-out panel over a page that has its own footer), so the reserved offset
 * is the MAX rather than the sum — they overlap on screen, they do not stack.
 */
import { create } from 'zustand';

interface ActionBarState {
  /** Measured pixel height per mounted bar, keyed by a caller-supplied id. */
  heights: Record<string, number>;
  setHeight: (id: string, height: number) => void;
  unregister: (id: string) => void;
}

export const useActionBarStore = create<ActionBarState>((set, get) => ({
  heights: {},

  setHeight: (id, height) => {
    const rounded = Math.max(0, Math.round(height));
    // ResizeObserver fires on every sub-pixel reflow. Bailing on an unchanged
    // value keeps a mounted bar from re-rendering the toaster continuously.
    if (get().heights[id] === rounded) return;
    set(state => ({ heights: { ...state.heights, [id]: rounded } }));
  },

  unregister: id =>
    set(state => {
      if (!(id in state.heights)) return state;
      const next = { ...state.heights };
      delete next[id];
      return { heights: next };
    }),
}));

/**
 * Pixels of bottom edge currently covered by an action bar, or 0 when none is
 * mounted. Read this rather than the raw map so callers cannot accidentally
 * sum overlapping bars.
 */
export function selectReservedBottom(state: ActionBarState): number {
  const values = Object.values(state.heights);
  return values.length === 0 ? 0 : Math.max(...values);
}
