import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowWorkbenchClassSummary } from '@/features/show-workbench/showWorkbenchTypes';
import type { SecretaryEntry } from '@/services/database/entries';
import type { DbClass, DbTrial } from '@/types/database-mappings';
import type { ReportDbEntry } from '@/lib/reports/types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { showUndoToast } from '@/lib/undoToast';
import { replicatedPaperworkPrintsTable } from '@/services/replication/ReplicatedPaperworkPrintsTable';
import { PaperworkPrintConfirmationDialog } from '@/features/show-map/cockpit/PaperworkPrintConfirmationDialog';
import { buildEmergencyPacketData } from '@/pages/secretary/ReportsPage/reportDataMapping';
import { EmergencyTrialPacketPanel } from '@/pages/secretary/ReportsPage/EmergencyTrialPacketPanel';
import { useDeliveredPackets } from '@/pages/secretary/ReportsPage/useDeliveredPackets';
import type { PaperworkDescriptor } from '@/features/show-map/cockpit/paperworkPrintState';

interface EmergencyTrialPacketToolProps {
  show: Show;
  trials: readonly SyncableTrial[];
  classes: readonly ShowWorkbenchClassSummary[];
  entries: readonly SecretaryEntry[];
}

/**
 * The emergency packet is a readiness tool, not a report choice. Keep its
 * existing panel intact and mount that one UI in Show Desk's tools sheet.
 * Reports links here instead of owning a second packet surface.
 */
export function EmergencyTrialPacketTool({
  show,
  trials,
  classes,
  entries,
}: EmergencyTrialPacketToolProps) {
  const { user } = useAuthContext();
  const [pendingConfirmation, setPendingConfirmation] = useState<PaperworkDescriptor | null>(null);
  const packetData = useMemo(
    () =>
      buildEmergencyPacketData({
        show,
        // Show Desk reads the canonical camel-case replicated trial/class rows.
        // The packet mapper consumes the verified database names below; these
        // adapters avoid making the packet path depend on a second database read.
        trials: trials.map(
          trial =>
            ({
              id: trial.id,
              date: trial.trialDate,
              name: trial.name ?? `Trial ${trial.trialNumber}`,
              trial_number: Number(trial.trialNumber) || 0,
              // `readTrialRegistryId` intentionally defaults legacy rows to AKC;
              // the display organization is not a registry identifier.
              registry_id: trial.registryId ?? null,
            }) as unknown as DbTrial
        ),
        classes: classes.map(
          classItem =>
            ({
              id: classItem.id,
              trial_id: classItem.trialId,
              name: classItem.name,
              element: classItem.element,
              level: classItem.level,
              section: classItem.section,
              class_number: null,
              display_order: classItem.displayOrder ?? null,
              judge_name: classItem.judgeName || null,
              start_time: classItem.time || null,
              time_limit_seconds: null,
              time_limit_area2_seconds: null,
              time_limit_area3_seconds: null,
              num_areas: null,
              num_hides: null,
              distraction_count: null,
            }) as unknown as DbClass
        ),
        entries: [...entries] as unknown as ReportDbEntry[],
      }),
    [classes, entries, show, trials]
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
