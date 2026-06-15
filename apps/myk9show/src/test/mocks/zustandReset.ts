// Shared reset registry for the zustand test mock (wired in setup.ts).
//
// Zustand stores are module-level singletons whose in-memory state survives
// between tests. Under the default suite order tests mutated them in a benign
// sequence; under `--sequence.shuffle` a store one test populated (e.g. the
// showRegistration / armband persist stores in phase3-integration) leaks its
// rows into the next test that expects a pristine store — "expected length 1
// but got 2". `localStorage.clear()` in a test's own beforeEach does not help:
// it wipes the persisted snapshot, not the live in-memory store object.
//
// setup.ts mocks 'zustand' with a factory that, for every store created during
// the run, registers a reset fn here. The global beforeEach then calls
// resetAllStores() to snap each store back to its initial state, making the
// suite order-independent. Pattern per Zustand's testing guide:
// https://zustand.docs.pmnd.rs/guides/testing

const storeResetFns = new Set<() => void>();

/** Register a per-store reset closure. Called by the zustand mock factory. */
export function registerStoreReset(reset: () => void): void {
  storeResetFns.add(reset);
}

/** Restore every store created so far to its initial state. */
export function resetAllStores(): void {
  storeResetFns.forEach(reset => {
    reset();
  });
}
