import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { completePacketRows } from '@/features/emergency-trial-packet/completePacketRows';
import {
  deliverEmergencyTrialPacket,
  EmergencyPacketDeliveryError,
} from '@/features/emergency-trial-packet/deliverEmergencyTrialPacket';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useReportData } from '@/hooks/queries/useReportData';
import { formatWeekdayMonthDay } from '@/lib/format/dates';
import { buildEmergencyPacketData } from '@/pages/secretary/ReportsPage/reportDataMapping';
import {
  deliveredPacketsKey,
  useDeliveredPackets,
} from '@/pages/secretary/ReportsPage/useDeliveredPackets';

import { PaperworkPrintConfirmationDialog } from '../PaperworkPrintConfirmationDialog';
import { recordPaperworkPrinted } from '../paperworkPrintActions';
import type { PaperworkDescriptor } from '../paperworkPrintState';
import { buildSavedCopy } from './buildSavedCopy';
import { buildSavedCopyDayInput } from './savedCopyDayInput';
import { SavedCopyList } from './SavedCopyList';
import { plural } from './usePacketFrame';

type SaveOutcome =
  { kind: 'sent'; recipientCount: number } | { kind: 'stored-not-emailed' } | { kind: 'failed' };

/**
 * "Saved copy" for one trial day (MYK9-2101): the copies already sent, whether paper matching the
 * newest is marked printed, and a button that builds the day's packet with the nightly renderer,
 * stores it and emails it to the show's officials. Nothing is sent until the button is pressed.
 */
export function SavedCopySection({ showId, trialDate }: { showId: string; trialDate: string }) {
  // The section reads the whole show's entries and re-reads them on every scoring change, so it
  // loads only once the secretary opens it, not every time the packet panel opens.
  const [open, setOpen] = useState(false);
  const dayLabel = formatWeekdayMonthDay(trialDate);
  return (
    <section aria-labelledby="saved-copy-heading" className="flex flex-col gap-3 border-t pt-4">
      <h3 id="saved-copy-heading" className="text-base font-semibold">
        Saved copy
      </h3>
      <p className="text-sm text-muted-foreground">
        A copy of {dayLabel}&apos;s packet kept for the show team. It matches the packet sent each
        night, page for page.
      </p>
      {open ? (
        <SavedCopyBody showId={showId} trialDate={trialDate} dayLabel={dayLabel} />
      ) : (
        <Button
          type="button"
          size="touch"
          variant="outline"
          className="self-start"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          Show saved copies
        </Button>
      )}
    </section>
  );
}

function SavedCopyBody({
  showId,
  trialDate,
  dayLabel,
}: {
  showId: string;
  trialDate: string;
  dayLabel: string;
}) {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const { show: currentShow } = useFastShowDetails(showId);
  const { show, trials, classes, entries, isReady, registrationsReadComplete } = useReportData({
    show: currentShow,
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
      completeRows && show
        ? buildEmergencyPacketData({
            show,
            trials: completeRows.trials,
            classes: completeRows.classes,
            entries: completeRows.entries,
          })
        : null,
    [completeRows, show]
  );
  const { rows, copies, isError } = useDeliveredPackets(showId, packetData);
  const dayCopies = useMemo(
    () => copies.filter(copy => copy.trialDate === trialDate),
    [copies, trialDate]
  );
  const latest = rows.find(row => row.trialDate === trialDate) ?? null;

  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  const [pending, setPending] = useState<PaperworkDescriptor | null>(null);

  const saveAndEmail = async () => {
    if (!packetData || !completeRows) return;
    setSaving(true);
    setOutcome(null);
    try {
      const generatedAt = new Date().toISOString();
      const input = buildSavedCopyDayInput({
        packetData,
        trials: completeRows.trials,
        trialDate,
        generatedAt,
      });
      if (!input) {
        setOutcome({ kind: 'failed' });
        return;
      }
      const { bytes, pageCount } = await buildSavedCopy(input);
      const delivery = await deliverEmergencyTrialPacket({
        showId,
        snapshotId: crypto.randomUUID(),
        generatedAt,
        bytes,
        pageCount,
        trialDate,
      });
      setOutcome({ kind: 'sent', recipientCount: delivery.recipientCount });
      void queryClient.invalidateQueries({ queryKey: deliveredPacketsKey(showId) });
    } catch (error) {
      setOutcome({
        kind: error instanceof EmergencyPacketDeliveryError ? 'stored-not-emailed' : 'failed',
      });
    } finally {
      setSaving(false);
    }
  };

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
      setPending(null);
    } catch {
      toast.error('Could not save that. Nothing was recorded, so try marking it printed again.');
    }
  };

  return (
    <>
      {isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          We could not check which copies were already sent. Check the connection before sending
          another, or the show&apos;s officials may get a duplicate.
        </p>
      )}
      <SavedCopyList copies={dayCopies} latest={latest} onMarkPrinted={setPending} />
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          size="touch"
          variant="outline"
          disabled={!packetData || saving}
          onClick={() => void saveAndEmail()}
        >
          {saving ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ArchiveRestore className="mr-2 size-4" aria-hidden="true" />
          )}
          {saving ? 'Saving the copy…' : 'Save and email a copy'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Builds {dayLabel}&apos;s packet, stores it, and emails a link to the show&apos;s
          officials. Nothing is sent until you press the button.
        </p>
        {!packetData && (
          <p className="text-xs text-muted-foreground">Getting the show&apos;s data ready…</p>
        )}
      </div>
      {outcome?.kind === 'sent' && (
        <p role="status" className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {dayLabel} copy stored and emailed to{' '}
          {plural(outcome.recipientCount, 'show official', 'show officials')}.
        </p>
      )}
      {outcome?.kind === 'stored-not-emailed' && (
        <p role="alert" className="text-sm font-medium text-destructive">
          The copy was stored, but the email could not be sent. Try again.
        </p>
      )}
      {outcome?.kind === 'failed' && (
        <p role="alert" className="text-sm font-medium text-destructive">
          The copy could not be saved. Check the connection and try again.
        </p>
      )}
      <PaperworkPrintConfirmationDialog
        open={pending !== null}
        reportLabel="trial packet"
        isSaving={false}
        onConfirm={() => {
          if (pending) void confirmPrinted(pending);
        }}
        onOpenChange={open => {
          if (!open) setPending(null);
        }}
      />
    </>
  );
}
