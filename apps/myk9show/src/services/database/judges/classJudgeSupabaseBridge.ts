/**
 * MYK9-1327 test seam: the class table reads through the app's global `supabase`, which the
 * ordering tests mock to this object. `classJudgeOrderingHarness` points `client` at its fake
 * server, so the real `ReplicatedClassesTable.sync` and its OCC re-fetch run against it.
 * No imports on purpose: the mock factory loads this module while `supabaseClient` is mocked.
 */
export const bridge: { client: { from: (table: string) => unknown } | null } = { client: null };

export const supabaseBridge = {
  from: (table: string) => {
    if (!bridge.client) throw new Error('classJudgeSupabaseBridge: no fake server installed');
    return bridge.client.from(table);
  },
};
