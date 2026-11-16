import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Show } from '@/types/show-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReportData } from '@/hooks/queries/useReportData';
import { PaperworkPrintConfirmationDialog } from '@/features/show-map/cockpit/PaperworkPrintConfirmationDialog';
import { recordPaperworkPrinted } from '@/features/show-map/cockpit/paperworkPrintActions';
import { buildEmergencyPacketData } from '@/pages/secretary/ReportsPage/reportDataMapping';
import { EmergencyTrialPacketPanel } from '@/pages/secretary/ReportsPage/EmergencyTrialPacketPanel';
import { useDeliveredPackets } from '@/pages/secretary/ReportsPage/useDeliveredPackets';
import type { PaperworkDescriptor } from '@/features/show-map/cockpit/paperworkPrintState';
import { completePacketRows } from './completePacketRows';
import { emergencyPacketReadinessCopy } from './emergencyTrialPacketReadiness';

interface EmergencyTrialPacketToolProps {
  show: Show;
}

/**
 * The emergency packet is a readiness tool, not a report choice. Keep its
 * existing panel intact and mount that one UI in the show's Emergency trial packet tool (Actions menu).
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
    registrationsReadComplete,
  } = useReportData({
    show,
    trialId: 'all',
    classId: 'all',
  });
  const completeRows = useMemo(
    () =>
      isReady && registrationsReadComplete
        ? completePacketRows({ trials, classes, entries })
        : null,
    [classes, entries, isReady, registrationsReadComplete, trials]
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
    try {
      await recordPaperworkPrinted({
        descriptor,
        user,
        message: 'Marked as printed.',
        undoReason: 'Undid print confirmation',
        undoFailureMessage: 'Could not undo that. The packet is still marked printed.',
      });
      setPendingConfirmation(null);
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
        unavailableReason={emergencyPacketReadinessCopy(
          dataState,
          completeRows !== null,
          registrationsReadComplete
        )}
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
