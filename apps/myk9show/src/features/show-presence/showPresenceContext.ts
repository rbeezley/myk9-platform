/**
 * Context for the privacy-filtered show presence roster (plan §6/§10).
 * Populated by ShowPresenceProvider; read by any consumer via
 * useShowPresenceRoster(). Kept in a non-component module so the provider file
 * exports only a component (react-refresh/only-export-components).
 */

import { createContext, useContext } from 'react';
import type { ShowPresence } from './types';

export interface ShowPresenceContextValue {
  /** Who's here, already filtered for the local viewer's role. */
  present: ShowPresence[];
}

const EMPTY: ShowPresenceContextValue = { present: [] };

export const ShowPresenceContext = createContext<ShowPresenceContextValue | null>(null);

/** Read the privacy-filtered roster. Returns an empty roster outside a provider. */
export function useShowPresenceRoster(): ShowPresenceContextValue {
  return useContext(ShowPresenceContext) ?? EMPTY;
}
