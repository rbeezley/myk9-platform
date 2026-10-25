/**
 * MYK9-1327 test seam: the replicated tables read through the app's global `supabase`, which the
 * class-judge tests mock to this object. `classJudgeHarness` points `client` at its fake
 * transport, so the real syncs, enrichment lookups and uploads run against it. No imports on
 * purpose: the mock factory loads this module while `supabaseClient` is mocked.
 */
interface BridgeClient {
  from: (table: string) => unknown;
  rpc: (name: string, args?: unknown) => unknown;
}

export const bridge: { client: BridgeClient | null } = { client: null };

export const supabaseBridge = {
  from: (table: string) => {
    if (!bridge.client) throw new Error('classJudgeSupabaseBridge: no fake transport installed');
    return bridge.client.from(table);
  },
  rpc: (name: string, args?: unknown) => {
    if (!bridge.client) throw new Error('classJudgeSupabaseBridge: no fake transport installed');
    return bridge.client.rpc(name, args);
  },
};
