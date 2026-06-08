/**
 * Context for the privacy-filtered show presence roster (plan §6/§10).
 * Populated by ShowPresenceProvider; read by any consumer via
 * useShowPresenceRoster(). Kept in a non-component module so the provider file
 * exports only a component (react-refresh/only-export-components).
 */

import { createContext, useContext } from 'react';
import type { EditTarget, ShowPresence } from './types';

export interface ShowPresenceContextValue {
  /** Who's here, already filtered for the local viewer's role. */
  present: ShowPresence[];
  /**
   * The local viewer's id, so edit-awareness selectors can exclude self (a user
   * never sees their own "editing" badge). Undefined outside a provider / when
   * presence is off (Phase 3). Explicit `| undefined` because the provider passes
   * the value through unconditionally and exactOptionalPropertyTypes is on.
   */
  viewerId?: string | undefined;
  /**
   * Producer setters for soft edit-awareness (Phase 3). Undefined outside a
   * provider, so panel hooks degrade to a clean no-op rather than throwing.
   */
  setEditing?: (target: EditTarget) => void;
  clearEditing?: () => void;
}

const EMPTY: ShowPresenceContextValue = { present: [] };

export const ShowPresenceContext = createContext<ShowPresenceContextValue | null>(null);

/** Read the privacy-filtered roster. Returns an empty roster outside a provider. */
export function useShowPresenceRoster(): ShowPresenceContextValue {
  return useContext(ShowPresenceContext) ?? EMPTY;
}
