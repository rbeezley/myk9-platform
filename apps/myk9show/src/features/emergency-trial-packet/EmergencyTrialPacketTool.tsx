import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Show } from '@/types/show-types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { ReportDbEntry } from '@/lib/reports/types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReportData } from '@/hooks/queries/useReportData';
import { showUndoToast } from '@/lib/undoToast';
import { replicatedPaperworkPrintsTable } from '@/services/replication/ReplicatedPaperworkPrintsTable';
import { PaperworkPrintConfirmationDialog } from '@/features/show-map/cockpit/PaperworkPrintConfirmationDialog';
import { buildEmergencyPacketData } from '@/pages/secretary/ReportsPage/reportDataMapping';
import { EmergencyTrialPacketPanel } from '@/pages/secretary/ReportsPage/EmergencyTrialPacketPanel';
import { useDeliveredPackets } from '@/pages/secretary/ReportsPage/useDeliveredPackets';
import type { PaperworkDescriptor } from '@/features/show-map/cockpit/paperworkPrintState';
import { emergencyPacketReadinessCopy } from './emergencyTrialPacketReadiness';

interface EmergencyTrialPacketToolProps {
  show: Show;
}

const COMPLETE_TRIAL_FIELDS = ['id', 'date', 'name', 'trial_number', 'registry_id'] as const;
const COMPLETE_CLASS_FIELDS = [
  'id',
  'trial_id',
  'name',
  'element',
  'level',
  'section',
  'class_number',
  'display_order',
  'judge_name',
  'ring',
  'ring_number',
  'start_time',
  'time_limit_seconds',
  'time_limit_area2_seconds',
  'time_limit_area3_seconds',
  'num_areas',
  'num_hides',
  'distraction_count',
] as const;
const COMPLETE_ENTRY_FIELDS = [
  'id',
  'class_id',
  'dog_id',
  'armband',
  'run_order',
  'check_in_status',
  'is_scored',
  'result_status',
  'search_time_seconds',
  'total_faults',
  'final_placement',
  'entry_status',
  'entry_fee',
  'payment_status',
  'payment_method',
  'entry_source',
  'dog',
] as const;

function hasCompleteRows<T>(rows: unknown, fields: readonly string[]): rows is T[] {
  return (
    Array.isArray(rows) &&
    rows.every(
      row =>
        row !== null &&
        typeof row === 'object' &&
        fields.every(field => Object.prototype.hasOwnProperty.call(row, field))
    )
  );
}

function completePacketRows(input: {
  trials: unknown;
  classes: unknown;
  entries: unknown;
}): { trials: DbTrial[]; classes: DbClass[]; entries: ReportDbEntry[] } | null {
  if (!hasCompleteRows<DbTrial>(input.trials, COMPLETE_TRIAL_FIELDS)) return null;
  if (!hasCompleteRows<DbClass>(input.classes, COMPLETE_CLASS_FIELDS)) return null;
  if (!hasCompleteRows<DbEntry>(input.entries, COMPLETE_ENTRY_FIELDS)) return null;
  return {
    trials: input.trials,
    classes: input.classes,
    entries: input.entries as ReportDbEntry[],
  };
}

/**
 * The emergency packet is a readiness tool, not a report choice. Keep its
 * existing panel intact and mount that one UI in Show Desk's tools sheet.
 * Reports links here instead of owning a second packet surface.
 */
export function EmergencyTrialPacketTool({ show }: EmergencyTrialPacketToolProps) {
  const { user } = useAuthContext();
  const [pendingConfirmation, setPendingConfirmation] = useState<PaperworkDescriptor | null>(null);
  const {
    show: reportShow,
    trials,
    classes,
    entries,
    dataState,
    isReady,
  } = useReportData({
    show,
    trialId: 'all',
    classId: 'all',
  });
  const completeRows = useMemo(
    () => (isReady ? completePacketRows({ trials, classes, entries }) : null),
    [classes, entries, isReady, trials]
  );
  const packetData = useMemo(
    () =>
      completeRows && reportShow
        ? buildEmergencyPacketData({
            show: reportShow,
            trials: completeRows.trials,
            classes: completeRows.classes,
            entries: completeRows.entries,
          })
        : null,
    [completeRows, reportShow]
  );
  const { rows: deliveredPackets, isError: deliveredPacketsError } = useDeliveredPackets(
    show.id,
    packetData
  );

  const confirmPrinted = async (descriptor: PaperworkDescriptor) => {
    if (!user) return;
    const metadata = user.user_metadata ?? {};
    const fullName =
      (metadata.full_name as string | undefined)?.trim() ||
      [metadata.first_name, metadata.last_name].filter(Boolean).join(' ').trim() ||
      user.email ||
      'Secretary';
    try {
      const record = await replicatedPaperworkPrintsTable.confirmPrinted({
        scope: descriptor.scope,
        reportId: descriptor.reportId,
        coverage: descriptor.coverage as unknown as Record<string, unknown>,
        fingerprint: descriptor.fingerprint,
        printedBy: user.id,
        printedByName: fullName,
      });
      setPendingConfirmation(null);
      showUndoToast({
        message: 'Marked as printed.',
        onUndo: () => {
          void replicatedPaperworkPrintsTable
            .voidPrint({ id: record.id, voidedBy: user.id, reason: 'Undid print confirmation' })
            .catch(() => toast.error('Could not undo that. The packet is still marked printed.'));
        },
      });
    } catch {
      toast.error('Could not save that. Nothing was recorded, so try marking it printed again.');
    }
  };

  return (
    <>
      <EmergencyTrialPacketPanel
        data={packetData}
        deliveredPackets={deliveredPackets}
        deliveredPacketsError={deliveredPacketsError}
        unavailableReason={emergencyPacketReadinessCopy(dataState, completeRows !== null)}
        onMarkPrinted={setPendingConfirmation}
      />
      <PaperworkPrintConfirmationDialog
        open={pendingConfirmation !== null}
        reportLabel="Emergency Trial Packet"
        isSaving={false}
        onConfirm={() => {
          if (pendingConfirmation) void confirmPrinted(pendingConfirmation);
        }}
        onOpenChange={open => {
          if (!open) setPendingConfirmation(null);
        }}
      />
    </>
  );
}
