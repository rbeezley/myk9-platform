import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';

/**
 * The folded Shows list's "Shows" button, offered to the open show's header (MYK9-1989).
 *
 * Folded, the list used to put its "Shows" button on a row of its own above the show, about 56px
 * of a laptop's height the class entries needed. The show header has room for it beside the name,
 * so the pane offers the button here and the header claims it; the pane then drops its own row.
 * Anything else in the pane (a loading or error state, the exhibitor view) claims nothing, and the
 * pane keeps the row, so the button is always somewhere.
 */
export interface ShowsPaneToggleSlot {
  /** Null while the list is open (its own Hide button folds it). */
  toggle: ReactNode;
  /** Called by the header that renders `toggle`; returns the release. */
  claim: () => () => void;
}

export const ShowsPaneToggleContext = createContext<ShowsPaneToggleSlot | null>(null);

/** The pane's "Shows" button for this header to render: null outside the pane or with the list open. */
export function useClaimShowsPaneToggle(): ReactNode {
  const slot = useContext(ShowsPaneToggleContext);
  const claim = slot?.claim;
  // Before paint, so the pane never draws its own row and the header's button in one frame.
  useLayoutEffect(() => (claim ? claim() : undefined), [claim]);
  return slot?.toggle ?? null;
}
