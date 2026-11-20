import { createContext, useContext, type ReactNode } from 'react';
import {
  NO_PAUSED_SHOWS,
  useShowsCardEntriesPaused,
  type PaymentMethodShow,
} from './cardEntriesPaused';

const CardEntriesPausedContext = createContext<ReadonlySet<string>>(NO_PAUSED_SHOWS);

/** MYK9-2192: one list-level answer that every card, row and pin under it reads. */
export function CardEntriesPausedProvider({
  pausedShowIds,
  children,
}: {
  pausedShowIds: ReadonlySet<string>;
  children: ReactNode;
}) {
  return (
    <CardEntriesPausedContext.Provider value={pausedShowIds}>
      {children}
    </CardEntriesPausedContext.Provider>
  );
}

/** Asks once for `shows` and provides the answer to everything below. */
export function CardEntriesPausedScope({
  shows,
  children,
}: {
  shows: readonly PaymentMethodShow[];
  children: ReactNode;
}) {
  const pausedShowIds = useShowsCardEntriesPaused(shows);
  return (
    <CardEntriesPausedProvider pausedShowIds={pausedShowIds}>{children}</CardEntriesPausedProvider>
  );
}

/** The paused ids from the nearest provider; empty (nothing paused) with none. */
export function usePausedShowIds(): ReadonlySet<string> {
  return useContext(CardEntriesPausedContext);
}
