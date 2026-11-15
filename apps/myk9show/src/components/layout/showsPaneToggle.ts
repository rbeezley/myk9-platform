import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';

/**
 * The folded Shows list's "Shows" button, offered to the open show's own header (MYK9-1989).
 *
 * Folded, the list used to leave its button on a row of its own above the show, about 70px a
 * laptop needs for entries. The show's header claims the button and renders it beside the show's
 * name; a page with no header that claims it (loading, not found, the exhibitor view) keeps the
 * row, so the list can always be brought back.
 */
interface ShowsPaneToggleValue {
  /** The button while the list is folded; null while the list is open. */
  toggle: ReactNode;
  /** Takes the button out of the row above the show; returns the release. Stable across renders. */
  claim: () => () => void;
}

const ShowsPaneToggleContext = createContext<ShowsPaneToggleValue | null>(null);

export const ShowsPaneToggleProvider = ShowsPaneToggleContext.Provider;

/** The Shows button to render inline, or null outside a folded Shows pane. */
export function useClaimedShowsPaneToggle(): ReactNode {
  const value = useContext(ShowsPaneToggleContext);
  const claim = value?.claim;
  // Before paint, so the row above the show never flashes in and out.
  useLayoutEffect(() => claim?.(), [claim]);
  return value?.toggle ?? null;
}
