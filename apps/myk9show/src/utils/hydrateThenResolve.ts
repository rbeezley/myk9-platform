/**
 * Resolve a record for an editor from the authenticated replicated store, hydrating it first
 * when it is not there yet: read the store; if absent, sync the replica from the server, reload
 * the store from the replica, and read once more. A failed sync or reload (offline, no access)
 * (or a failed read) is not an error here: the final read decides, and `null` means "still not available", which
 * the caller reports instead of opening an editor on nothing.
 *
 * One helper for every Setup row action (trials and classes), so the two resolvers cannot drift.
 */
export async function hydrateThenResolve<T>({
  readStore,
  sync,
  reload,
}: {
  readStore: () => T | null | undefined | Promise<T | null | undefined>;
  sync: () => Promise<unknown>;
  reload: () => Promise<unknown>;
}): Promise<T | null> {
  // NEVER rejects: every step (a store/IndexedDB read can fail too) resolves to "not available".
  const read = async (): Promise<T | null> => {
    try {
      return (await readStore()) ?? null;
    } catch {
      return null;
    }
  };
  const warm = await read();
  if (warm) return warm;
  try {
    await sync();
    await reload();
  } catch {
    // Fall through: the re-read below decides.
  }
  return read();
}
