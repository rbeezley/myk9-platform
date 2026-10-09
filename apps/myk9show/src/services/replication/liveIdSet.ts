/**
 * The complete set of ids the server currently shows this user for one table,
 * read in keyset pages (MYK9-1071; the pattern `ReplicatedDogsTable.reconcileDeleted`
 * established).
 *
 * Why keyset, not offset: rows inserted or deleted between page reads shift
 * offset pages, so an id can be skipped and then pruned from the replica. A
 * cursor on the unique primary key cannot skip.
 *
 * Returns null when the set is incomplete: any page errored, or the page cap
 * was reached without a short page. A caller must never prune against null,
 * because pruning against a partial set would wipe valid cached rows.
 */
export const LIVE_ID_PAGE_SIZE = 1000;
export const LIVE_ID_MAX_PAGES = 100;

export type LiveIdPageFetcher = (
  afterId: string | undefined,
  pageSize: number
) => PromiseLike<{ data: Array<{ id: unknown }> | null; error: unknown }>;

export async function fetchLiveIdSet(fetchPage: LiveIdPageFetcher): Promise<Set<string> | null> {
  const liveIds = new Set<string>();
  let lastId: string | undefined;

  for (let page = 0; page < LIVE_ID_MAX_PAGES; page++) {
    const { data, error } = await fetchPage(lastId, LIVE_ID_PAGE_SIZE);
    if (error || !data) return null;

    for (const row of data) liveIds.add(String(row.id));
    if (data.length < LIVE_ID_PAGE_SIZE) return liveIds;

    lastId = String(data[data.length - 1]!.id);
  }

  return null;
}
