/**
 * Viewer identity as a first-class part of a React Query key.
 *
 * `queryClient` is a module singleton (`lib/queryClient.ts`). A key that names
 * only WHAT was fetched and not WHO fetched it survives a sign-out, and the
 * next account signing in on the same tab is served those rows straight from
 * the cache — no request, so no RLS. That is the MYK9-429 leak, and the
 * `exhibitor` namespace is where it bites: `['exhibitor', 'my-payments', year]`
 * held one account's amounts, references and show names for the next.
 *
 * A plain string in the key is not enough, because nothing can tell a viewer id
 * from any other string segment (`['exhibitor', 'my-payments', '2026']` looks
 * exactly like a scoped key to a checker). So the viewer is carried as a marked
 * OBJECT — `{ viewerScope: id }` — which `viewerScope()` is the only sanctioned
 * way to build and `isViewerScopedQueryKey()` can recognise unambiguously.
 * React Query hashes objects with sorted keys, so this is stable across renders.
 *
 * The recognisability is the point: `viewerScopeGuard.ts` turns it into a
 * runtime assertion that a NEW key in a viewer-scoped namespace cannot silently
 * skip. See that module for where the check is installed.
 */

/** The marker segment `viewerScope()` produces. Never build one by hand. */
export interface ViewerScope {
  /** The signed-in auth user id, or null when nobody is signed in. */
  readonly viewerScope: string | null;
}

/**
 * Query-key namespaces (the first key segment) whose rows belong to ONE
 * signed-in viewer and must never be served to another.
 *
 * Adding a namespace here makes the guard enforce scoping for every key under
 * it, retroactively — which is the intended way to extend this to `judge`,
 * `secretary` or any other per-person surface.
 */
export const VIEWER_SCOPED_KEY_NAMESPACES: readonly string[] = ['exhibitor'];

/**
 * The viewer segment for a query key.
 *
 * Pass the AUTHENTICATED user id (`AuthContext.user.id`), not
 * `databaseUserId`: the `people` lookup behind `databaseUserId` is a plain
 * network query that pauses offline, so on a cold offline boot it is undefined
 * while the session id is already known. Keying on it would collapse every
 * offline viewer into the same `null` scope — the exact thing this exists to
 * prevent — and would re-couple an offline-first surface to the network.
 */
export function viewerScope(viewerId: string | null | undefined): ViewerScope {
  return { viewerScope: viewerId ?? null };
}

function isViewerScopeSegment(segment: unknown): segment is ViewerScope {
  return (
    typeof segment === 'object' &&
    segment !== null &&
    Object.prototype.hasOwnProperty.call(segment, 'viewerScope')
  );
}

/** True when this key sits in a namespace whose rows are viewer-private. */
export function requiresViewerScope(queryKey: readonly unknown[]): boolean {
  const namespace = queryKey[0];
  return typeof namespace === 'string' && VIEWER_SCOPED_KEY_NAMESPACES.includes(namespace);
}

/** True when the key carries a `viewerScope()` segment anywhere in it. */
export function isViewerScopedQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey.some(isViewerScopeSegment);
}

/**
 * `JSON.stringify` is not total: a BigInt segment throws, and so does a
 * circular one. React Query allows both — its own hashing only chokes on them
 * when the default `queryKeyHashFn` is in use, and that is overridable per
 * query. Building this message must never be the thing that throws, because
 * the only caller is an error path inside `QueryCache.build`, which runs inside
 * render.
 */
function describeQueryKey(queryKey: readonly unknown[]): string {
  try {
    return JSON.stringify(queryKey) ?? String(queryKey);
  } catch {
    return `[${queryKey.map(segment => String(typeof segment)).join(', ')}]`;
  }
}

export class MissingViewerScopeError extends Error {
  constructor(queryKey: readonly unknown[]) {
    super(
      `Query key ${describeQueryKey(queryKey)} is in a viewer-scoped namespace but carries no ` +
        `viewerScope() segment. Rows under this namespace belong to one signed-in account, and ` +
        `an unscoped key is served from cache to the next account without re-applying RLS ` +
        `(MYK9-429). Add viewerScope(viewerId) to the key — see lib/viewerScopedQueryKey.ts.`
    );
    this.name = 'MissingViewerScopeError';
  }
}

/**
 * Throws unless a key in a viewer-scoped namespace carries its viewer.
 * Keys outside those namespaces are not this function's business.
 */
export function assertViewerScopedQueryKey(queryKey: readonly unknown[]): void {
  if (!Array.isArray(queryKey)) return;
  if (!requiresViewerScope(queryKey)) return;
  if (isViewerScopedQueryKey(queryKey)) return;
  throw new MissingViewerScopeError(queryKey);
}
