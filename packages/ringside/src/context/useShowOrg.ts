import { useRingsideAuth } from './RingsideContext';

/**
 * Returns the organization name from the active show context, or
 * `undefined` if no show is in context (e.g. pre-login).
 *
 * Intentionally trivial — this hook exists to (a) demonstrate the
 * `useRingsideAuth()` consumption pattern from inside the package and
 * (b) keep at least one real consumer of RingsideContext in the package
 * tests so future refactors of the context shape would surface as
 * compile/test failures rather than dead code.
 *
 * Pages moving into ringside (E1+) should use this pattern: thin hooks
 * that destructure exactly the slice they need from the typed sub-hooks.
 */
export function useShowOrg(): string | undefined {
  const auth = useRingsideAuth();
  return auth.showContext?.org;
}
