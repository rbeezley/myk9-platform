/**
 * Which async cart writes still belong to the present (MYK9-651, MYK9-655).
 *
 * Every cart read and mutation awaits PostgREST and then writes the store. Two
 * things can make that write wrong by the time it lands:
 *
 *   - The signed-in user changed (sign-out, or another account signing in).
 *     `reset()` empties the store, and a read started for the previous user
 *     must not put that user's cart, or its persisted recovery ids, back.
 *   - The wizard opener that started the read was SUPERSEDED: it timed out and
 *     a retry has since opened the cart and added to it. The stalled opener's
 *     full-replace `set({ cart })` would wipe what the retry added.
 *
 * Each write site therefore captures a guard when its work starts and writes
 * only while the guard holds. The guard is the session generation (bumped by
 * `reset()`) combined with the caller's own token (the opener's "not
 * superseded"), so neither case needs its own special-case check at a set site.
 */

/** True while the write that captured it may still land. */
export type CartWriteGuard = () => boolean;

let sessionGeneration = 0;

/** Every write captured before this call is dropped. Called by `reset()`. */
export function invalidateCartWrites(): void {
  sessionGeneration += 1;
}

/**
 * Capture a guard for work starting now. `outer` is the caller's own token
 * (e.g. the opener's), passed through nested calls so a superseded opener's
 * inner `createCart` / `loadActiveCart` are dropped with it.
 */
export function captureCartWriteGuard(outer?: CartWriteGuard): CartWriteGuard {
  const captured = sessionGeneration;
  return () => captured === sessionGeneration && (outer ? outer() : true);
}

/** `set`, but a no-op once `guard` no longer holds. */
export function guardedSet<T>(
  set: (partial: Partial<T>) => void,
  guard: CartWriteGuard
): (partial: Partial<T>) => void {
  return partial => {
    if (guard()) set(partial);
  };
}
