/**
 * The signed-in viewer's identity for query-key scoping (MYK9-429).
 *
 * Returns the AUTH user id, not `databaseUserId`. The `people` lookup behind
 * `databaseUserId` is a plain network query with no `networkMode`, so it pauses
 * offline and a cold offline boot holds roles while that id is still undefined
 * — keying on it would collapse every offline viewer into one shared scope. The
 * auth id comes from the restored session and is known as soon as auth is.
 *
 * Deliberately non-throwing outside an `AuthProvider`, unlike `useAuthContext`:
 * this is a scoping detail a hook adds to its own key, and it must not turn a
 * component that renders fine today into a crash. Outside a provider there is
 * no viewer, which is what `null` says.
 */
import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';

export function useViewerId(): string | null {
  return useContext(AuthContext)?.user?.id ?? null;
}

export default useViewerId;
