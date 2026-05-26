/**
 * RingsideContext public surface.
 *
 * Re-exported from the package root (`../index.ts`). Consumers always
 * import from `@myk9/ringside` — never from a subpath — so internal
 * file layout stays free to evolve.
 */

export type {
  RingsideAuth,
  RingsideShowContext,
  RingsideReplication,
  RingsidePrefetch,
  RingsideContextValue,
  ClassStatusUpdateFields,
  ClassStatusValue,
} from './types';

export {
  RingsideProvider,
  useRingside,
  useRingsideAuth,
  useRingsideReplication,
  useRingsidePrefetch,
  type RingsideProviderProps,
} from './RingsideContext';

export { useRingsidePermission } from './useRingsidePermission';
export { useShowOrg } from './useShowOrg';
