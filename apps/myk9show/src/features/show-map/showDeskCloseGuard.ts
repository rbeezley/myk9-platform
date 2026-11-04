import { createContext, useContext, useEffect } from 'react';

/** Lets a tool inside the Show Desk panel say "I hold unsaved work" so closing asks first. */
export const ShowDeskCloseGuardContext = createContext<(dirty: boolean) => void>(() => undefined);

export function useShowDeskCloseGuard(dirty: boolean): void {
  const setDirty = useContext(ShowDeskCloseGuardContext);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}
