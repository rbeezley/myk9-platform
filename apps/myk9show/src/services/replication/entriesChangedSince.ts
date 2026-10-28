import { logger } from '@myk9/core';
import { features } from '@/config/features';
import { supabase } from '@/services/database/supabaseClient';

export const ENTRY_RESULTS_CHANGED_SINCE_RPC = 'entry_results_changed_since';

let warned = false;

/**
 * The last COMPLETED view read per show: the watermark W it was asked for
 * (since + buffer) and the SERVER time its probe reported (`server_now`).
 */
const lastViewRead = new Map<string, { watermark: number; serverReadAt: number }>();

interface ReadWindow {
  showId: string;
  since: number;
  forceFullSync?: boolean;
  /** The buffer the engine subtracted from the watermark (ReplicatedEntriesTable's own constant). */
  bufferMs: number;
}

export interface EntriesReadPlan {
  /** True only when the view read can be skipped; the caller then returns no rows. */
  skip: boolean;
  /** Call once the view read completed successfully; never on error or abort. */
  recordCompleted: () => void;
}

const NO_PROBE: EntriesReadPlan = { skip: false, recordCompleted: () => {} };

interface Probe {
  changed: boolean;
  serverNow: number;
}

/** Strict parse of `{changed: boolean, server_now: timestamp}`; anything else is unknown. */
function parseProbe(data: unknown): Probe | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const { changed, server_now: serverNow } = data as Record<string, unknown>;
  if (typeof changed !== 'boolean' || typeof serverNow !== 'string') return null;
  const serverMs = Date.parse(serverNow);
  return Number.isFinite(serverMs) ? { changed, serverNow: serverMs } : null;
}

/**
 * MYK9-1369: before an incremental entries view read, ask the server whether
 * anything the view reads for this show moved after the watermark W, and skip
 * the read when nothing did.
 *
 * Every value in the decision is a SERVER clock value (`updated_at` stamps and
 * the probe's `server_now`); the device clock is never consulted, so a phone
 * running fast or slow cannot change it.
 *
 * Why skipping is no less safe than today's buffered re-read: the engine asks
 * for `updated_at > W - buffer` where W is the newest updated_at it has seen,
 * and an empty answer never moves W, so the row that set W is always inside the
 * window and the view is rebuilt every poll. The buffer exists to catch rows
 * that commit late with an older updated_at. `server_now` is at or before the
 * server-side start of the view read that follows the probe, so a recorded
 * `serverReadAt >= W + buffer` means the window (W - buffer, W] was read after
 * any commit lag within the buffer had settled, in server time: the same
 * assumption the buffer already makes. Then only "did anything move after W"
 * is left to ask, and the probe has just answered it with `changed = false`.
 *
 * A probe that fails or is not understood skips nothing and records nothing,
 * so a stale record can never license a later skip. Flag off, a full sync and
 * `since <= 0` send no probe and record nothing: the view read is as before.
 */
export async function planEntriesRead(params: ReadWindow): Promise<EntriesReadPlan> {
  const { showId, since, forceFullSync, bufferMs } = params;
  if (!features.replicationEntriesChangedSince || forceFullSync === true || !(since > 0)) {
    return NO_PROBE;
  }
  const watermark = since + bufferMs;
  let probe: Probe | null = null;
  try {
    const { data, error } = await supabase.rpc(ENTRY_RESULTS_CHANGED_SINCE_RPC, {
      p_show_id: showId,
      p_since: new Date(watermark).toISOString(),
    });
    probe = error ? null : parseProbe(data);
    if (!probe) warnOnce(error?.message ?? 'unexpected answer');
  } catch (error) {
    warnOnce(error instanceof Error ? error.message : String(error));
  }
  if (!probe) return NO_PROBE;

  const last = lastViewRead.get(showId);
  const settled =
    last !== undefined && last.watermark === watermark && last.serverReadAt >= watermark + bufferMs;
  if (!probe.changed && settled) return { skip: true, recordCompleted: () => {} };
  return {
    skip: false,
    recordCompleted: () => {
      lastViewRead.set(showId, { watermark, serverReadAt: probe.serverNow });
    },
  };
}

function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  logger.warn('Entries changed-since probe unavailable; reading the results view', 'replication', {
    message,
  });
}

/** Test seam: re-arm the once-per-session warning. */
export function resetEntriesChangedSinceWarning(): void {
  warned = false;
  lastViewRead.clear();
}
