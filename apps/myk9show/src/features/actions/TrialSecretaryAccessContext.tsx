import { createContext, useContext, type ReactNode } from 'react';

/**
 * The reason, if any, that this viewer's secretary-only controls are greyed —
 * shared down a surface rather than threaded through four layers of props.
 *
 * `undefined` means "this viewer may operate the show", which is also the
 * default outside any provider: a surface that has not opted in is unchanged.
 * The safety net for anything this context never reaches is the destination
 * itself (`RoleAccessDeniedState`), not this value.
 */
const TrialSecretaryAccessContext = createContext<string | undefined>(undefined);

export function TrialSecretaryAccessProvider({
  reason,
  children,
}: {
  reason: string | undefined;
  children: ReactNode;
}) {
  return (
    <TrialSecretaryAccessContext.Provider value={reason}>
      {children}
    </TrialSecretaryAccessContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTrialSecretaryOnlyReason(): string | undefined {
  return useContext(TrialSecretaryAccessContext);
}
