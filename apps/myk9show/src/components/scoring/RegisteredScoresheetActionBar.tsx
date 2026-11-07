/**
 * Registers the scoresheet's sticky Save/Cancel bar with the action-bar store
 * (MYK9-1745) so toasts (offline, sync conflict) render above it instead of
 * over Save. The bar lives in `@myk9/scoring-ui`, which cannot import app
 * hooks, so the package exposes a ref context and this provider fills it.
 */
import type { ReactNode } from 'react';
import { ScoresheetActionBarRefContext } from '@myk9/scoring-ui';
import { useRegisterActionBar } from '@/hooks/useRegisterActionBar';

export function RegisteredScoresheetActionBar({ children }: { children: ReactNode }) {
  const registerRef = useRegisterActionBar();
  return (
    <ScoresheetActionBarRefContext.Provider value={registerRef}>
      {children}
    </ScoresheetActionBarRefContext.Provider>
  );
}
