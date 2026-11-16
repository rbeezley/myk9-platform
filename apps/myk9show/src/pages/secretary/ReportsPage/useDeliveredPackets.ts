import { useQuery } from '@tanstack/react-query';
import { supabase as defaultSupabase } from '@/lib/supabase';
import { useShowPaperworkPrints } from '@/features/show-map/cockpit/useShowPaperworkPrints';
import type { EmergencyPacketInput } from '@/features/emergency-trial-packet/types';
import {
  buildDeliveredPacketRows,
  type DeliveredPacketRow,
  type DeliveredPacketSnapshot,
  type PacketPrintConfirmation,
} from './deliveredPacketRows';

/**
 * `trial_packet_snapshots` is not in the generated `Database` types, so the
 * typed client resolves its columns to `never`. `deliverEmergencyTrialPacket`
 * already handles this feature's tables with a narrow structural client; this
 * follows that precedent rather than fighting the generated types.
 */
type PacketRows = PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;

interface PacketFilter extends PacketRows {
  eq(column: string, value: string): PacketFilter;
  is(column: string, value: null): PacketFilter;
  order(column: string, options: { ascending: boolean }): PacketFilter;
}

interface PacketReadClient {
  from(table: string): { select(columns: string): PacketFilter };
}

/**
 * The packets that already exist for this show, and whether the paper in the
 * box matches them.
 *
 * Snapshots come from a plain server read — Reports needs connectivity to
 * email a packet at all, and there is no replicated copy of that table.
 * Confirmations come from `useShowPaperworkPrints`, which reads the REPLICATED
 * table and already subscribes to local writes and realtime. Reading them
 * separately meant confirming a print left this list unchanged: the row still
 * said "not printed", the button invited another press, and each press wrote
 * another `paperwork_prints` row.
 */
/** The delivered-packets query, so a send can refresh the list it just added to. */
function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function deliveredPacketsKey(showId: string | undefined) {
  return ['emergency-packet-delivered', showId] as const;
}

export function useDeliveredPackets(
  showId: string | undefined,
  packetData: Omit<EmergencyPacketInput, 'generatedAt'> | null,
  client: PacketReadClient = defaultSupabase as unknown as PacketReadClient
): {
  rows: DeliveredPacketRow[];
  copies: DeliveredPacketSnapshot[];
  isError: boolean;
  /** Whether the sent-copies list has been read: an unread list is not "nothing was sent". */
  listState: 'pending' | 'offline' | 'error' | 'ready';
} {
  const prints = useShowPaperworkPrints(showId ?? '');
  const { data, isError, fetchStatus } = useQuery({
    queryKey: deliveredPacketsKey(showId),
    enabled: !!showId,
    queryFn: async () => {
      const snapshots = await client
        .from('trial_packet_snapshots')
        .select('snapshot_id, trial_date, generated_at, page_count, created_at, recipient_count')
        .eq('show_id', showId as string)
        .eq('delivery_status', 'sent')
        .order('created_at', { ascending: false });
      if (snapshots.error) throw snapshots.error;
      return (snapshots.data ?? []).map(row => ({
        snapshotId: row.snapshot_id as string,
        trialDate: (row.trial_date as string | null) ?? null,
        generatedAt: row.generated_at as string,
        createdAt: (row.created_at as string) ?? (row.generated_at as string),
        pageCount: (row.page_count as number) ?? 0,
        recipientCount: (row.recipient_count as number | null) ?? 0,
      }));
    },
  });

  return {
    // Every copy that went out, newest first, for the per-day "Saved copy" list.
    copies: data ?? [],
    rows: buildDeliveredPacketRows({
      snapshots: data ?? [],
      confirmations: (prints.data ?? []).map((record): PacketPrintConfirmation => ({
        reportId: record.reportId,
        coverage: record.coverage as PacketPrintConfirmation['coverage'],
        voidedAt: record.voidedAt ?? null,
      })),
      packetData,
    }),
    // `prints.isError` alone is not enough: that query reads IndexedDB and
    // succeeds even when the SERVER read failed, so a confirmations sync
    // failure — including the RLS denial this feature's own migration fixes —
    // rendered every day as "not printed" with no warning. `syncFailed` is the
    // signal that actually reflects the server.
    isError: isError || prints.isError || prints.syncFailed,
    // Offline first: the confirmations sync fails whenever the device is offline, so checking
    // `syncFailed` first showed an offline secretary the alarming "could not check" error.
    listState:
      (data === undefined && fetchStatus === 'paused') || isBrowserOffline()
        ? 'offline'
        : isError || prints.isError || prints.syncFailed
          ? 'error'
          : data === undefined
            ? 'pending'
            : 'ready',
  };
}
