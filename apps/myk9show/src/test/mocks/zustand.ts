// Zustand test mock — wraps the real `create` / `createStore` so every store
// can be reset between tests. See ./zustandReset.ts for the why. Wired via
// `vi.mock('zustand', () => import('./mocks/zustand'))` in setup.ts.
//
// IMPORTANT: do not `export * from 'zustand'` here — once setup.ts redirects
// the 'zustand' specifier to this module that re-export becomes self-referential
// and deadlocks module init. Instead we pull the real module via
// `vi.importActual` and spread its named exports explicitly.
import { vi } from 'vitest';
import type * as ZustandTypes from 'zustand';
import { registerStoreReset } from './zustandReset';

const actual = await vi.importActual<typeof ZustandTypes>('zustand');
const actualCreate = actual.create;
const actualCreateStore = actual.createStore;

function trackStore<S extends { getInitialState: () => unknown; setState: (s: unknown, replace: true) => void }>(
  store: S
): S {
  const initialState = store.getInitialState();
  registerStoreReset(() => {
    store.setState(initialState, true);
  });
  return store;
}

const createUncurried = <T>(stateCreator: ZustandTypes.StateCreator<T>) =>
  trackStore(actualCreate(stateCreator));

// Support both `create(fn)` and the curried `create()(fn)` signatures.
export const create = (<T>(stateCreator?: ZustandTypes.StateCreator<T>) =>
  typeof stateCreator === 'function'
    ? createUncurried(stateCreator)
    : createUncurried) as typeof ZustandTypes.create;

const createStoreUncurried = <T>(stateCreator: ZustandTypes.StateCreator<T>) =>
  trackStore(actualCreateStore(stateCreator));

export const createStore = (<T>(stateCreator?: ZustandTypes.StateCreator<T>) =>
  typeof stateCreator === 'function'
    ? createStoreUncurried(stateCreator)
    : createStoreUncurried) as typeof ZustandTypes.createStore;

// Re-export the remaining runtime helpers verbatim so importers that pull
// e.g. `useStore` / `useShallow` from 'zustand' still work.
export const useStore = actual.useStore;
