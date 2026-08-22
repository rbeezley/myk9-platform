import { useQuery } from '@tanstack/react-query';
import { supabase as defaultSupabase } from '@/lib/supabase';
import { EMERGENCY_PACKET_REPORT_ID } from '@/features/show-map/cockpit/paperworkPrintState';
import type { EmergencyPacketInput } from '@/features/emergency-trial-packet/types';
import {
  buildDeliveredPacketRows,
  type DeliveredPacketRow,
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
 * A plain server read rather than a replicated table: this is an
 * online-only preparation surface (Reports requires connectivity to email a
 * packet at all), and the print reminder it feeds is a server decision.
 */
export function useDeliveredPackets(
  showId: string | undefined,
  packetData: Omit<EmergencyPacketInput, 'generatedAt'> | null,
  client: PacketReadClient = defaultSupabase as unknown as PacketReadClient
): DeliveredPacketRow[] {
  const { data } = useQuery({
    queryKey: ['emergency-packet-delivered', showId],
    enabled: !!showId,
    queryFn: async () => {
      const [snapshots, confirmations] = await Promise.all([
        client
          .from('trial_packet_snapshots')
          .select('snapshot_id, trial_date, generated_at, page_count')
          .eq('show_id', showId as string)
          .eq('delivery_status', 'sent')
          .order('generated_at', { ascending: false }),
        client
          .from('paperwork_prints')
          .select('report_id, coverage, voided_at')
          .eq('show_id', showId as string)
          .eq('report_id', EMERGENCY_PACKET_REPORT_ID)
          .is('voided_at', null),
      ]);
      if (snapshots.error) throw snapshots.error;
      if (confirmations.error) throw confirmations.error;
      return {
        snapshots: (snapshots.data ?? []).map(row => ({
          snapshotId: row.snapshot_id as string,
          trialDate: (row.trial_date as string | null) ?? null,
          generatedAt: row.generated_at as string,
          pageCount: (row.page_count as number) ?? 0,
        })),
        confirmations: (confirmations.data ?? []).map(
          (row): PacketPrintConfirmation => ({
            reportId: row.report_id as string,
            coverage: (row.coverage ?? null) as PacketPrintConfirmation['coverage'],
            voidedAt: (row.voided_at as string | null) ?? null,
          })
        ),
      };
    },
  });

  return buildDeliveredPacketRows({
    snapshots: data?.snapshots ?? [],
    confirmations: data?.confirmations ?? [],
    packetData,
  });
}
