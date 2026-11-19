import { createContext, useContext, type ReactNode } from 'react';
import { NOT_OPEN_NO_DATE, type PendingEntryCopy } from './pendingEntryCopy';

/**
 * Carries the "why can't I enter yet" copy from a landing page to its sections,
 * so eight styles share one wording rule without each section growing a prop.
 * The default is the neutral not-open copy, never a claim about classes.
 */
const PendingEntryCopyContext = createContext<PendingEntryCopy>(NOT_OPEN_NO_DATE);

export function PendingEntryCopyProvider({
  value,
  children,
}: {
  value: PendingEntryCopy;
  children: ReactNode;
}) {
  return (
    <PendingEntryCopyContext.Provider value={value}>{children}</PendingEntryCopyContext.Provider>
  );
}

export function usePendingEntryCopy(): PendingEntryCopy {
  return useContext(PendingEntryCopyContext);
}
