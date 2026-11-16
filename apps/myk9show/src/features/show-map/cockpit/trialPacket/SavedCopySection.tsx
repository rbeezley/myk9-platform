import { useId, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { completePacketRows } from '@/features/emergency-trial-packet/completePacketRows';
import { emergencyPacketAvailability } from '@/features/emergency-trial-packet/emergencyTrialPacket';
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
  | { kind: 'sent'; recipientCount: number }
  | { kind: 'nobody-emailed' }
  | { kind: 'stored-not-emailed' }
  | { kind: 'offline' }
  | { kind: 'failed' };

const OFFLINE_LINE = 'You are offline. Seeing sent copies and saving a copy need a connection.';

/**
 * "Saved copy" for one trial day (MYK9-2101): the copies already sent, whether paper matching the
 * newest is marked printed, and a button that builds the day's packet with the nightly renderer,
 * stores it and emails it to the show's officials. Nothing is sent until the button is pressed.
 */
export function SavedCopySection({ showId, trialDate }: { showId: string; trialDate: string }) {
  // The section reads the whole show's entries and re-reads them on every scoring change, so it
  // loads only once the secretary opens it, not every time the packet panel opens.
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const dayLabel = formatWeekdayMonthDay(trialDate);
  return (
    <section aria-labelledby="saved-copy-heading" className="flex flex-col gap-3 border-t pt-4">
      <h3 id="saved-copy-heading" className="text-base font-semibold">
        Saved copy
      </h3>
      <p className="text-sm text-muted-foreground">
        A copy of {dayLabel}&apos;s packet kept for the show team. Built the same way as the packet
        sent each night.
      </p>
      <Button
        type="button"
        size="touch"
        variant="outline"
        className="self-start"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(value => !value)}
      >
        {open ? 'Hide saved copies' : 'Show saved copies'}
      </Button>
      <div id={bodyId} className="flex flex-col gap-3">
        {open && <SavedCopyBody showId={showId} trialDate={trialDate} dayLabel={dayLabel} />}
      </div>
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
  const { rows, copies, listState } = useDeliveredPackets(showId, packetData);
  const dayCopies = useMemo(
    () => copies.filter(copy => copy.trialDate === trialDate),
    [copies, trialDate]
  );
  const latest = rows.find(row => row.trialDate === trialDate) ?? null;

  // The day's own input, cancelled trials and classes left out as the nightly job leaves them.
  const dayInput = useMemo(
    () =>
      packetData && completeRows
        ? buildSavedCopyDayInput({
            packetData,
            trials: completeRows.trials,
            classes: completeRows.classes,
            trialDate,
            generatedAt: '',
          })
        : null,
    [packetData, completeRows, trialDate]
  );
  const availability = useMemo(
    () =>
      packetData
        ? emergencyPacketAvailability(dayInput ?? { trials: [], classes: [], entries: [] })
        : null,
    [packetData, dayInput]
  );
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  // A result from an earlier send is stale once the list can no longer be read: the list state's
  // own line says what is true now. Adjusted during render, not in an effect.
  const [outcomeListState, setOutcomeListState] = useState(listState);
  if (outcomeListState !== listState) {
    setOutcomeListState(listState);
    if (listState !== 'ready' && outcome?.kind !== 'offline') setOutcome(null);
  }
  const [pending, setPending] = useState<PaperworkDescriptor | null>(null);

  const saveAndEmail = async () => {
    if (!dayInput || !availability?.available) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setOutcome({ kind: 'offline' });
      return;
    }
    setSaving(true);
    setOutcome(null);
    try {
      const generatedAt = new Date().toISOString();
      const { bytes, pageCount } = await buildSavedCopy({ ...dayInput, generatedAt });
      const delivery = await deliverEmergencyTrialPacket({
        showId,
        snapshotId: crypto.randomUUID(),
        generatedAt,
        bytes,
        pageCount,
        trialDate,
      });
      setOutcome(
        delivery.recipientCount > 0
          ? { kind: 'sent', recipientCount: delivery.recipientCount }
          : { kind: 'nobody-emailed' }
      );
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
    if (!user || marking) return;
    setMarking(true);
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
    } finally {
      setMarking(false);
    }
  };

  // Why the send button is off, in plain words, beside it.
  // The list states already say why at the top of the section, so they are not repeated here.
  const blocked =
    listState !== 'ready'
      ? null
      : !packetData
        ? "Getting the show's data ready…"
        : availability && !availability.available
          ? availability.reason
          : null;

  return (
    <>
      {listState === 'pending' && (
        <p className="text-sm text-muted-foreground">Checking which copies were already sent…</p>
      )}
      {listState === 'offline' && <p className="text-sm text-muted-foreground">{OFFLINE_LINE}</p>}
      {listState === 'error' && (
        <p role="alert" className="text-sm font-medium text-destructive">
          We could not check which copies were already sent. Saving stays off until we can, so the
          show&apos;s officials do not get a duplicate.
        </p>
      )}
      {listState === 'ready' && (
        <SavedCopyList copies={dayCopies} latest={latest} onMarkPrinted={setPending} />
      )}
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          size="touch"
          variant="outline"
          disabled={listState !== 'ready' || !dayInput || !availability?.available || saving}
          onClick={() => void saveAndEmail()}
        >
          {saving ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ArchiveRestore className="mr-2 size-4" aria-hidden="true" />
          )}
          {saving ? 'Saving the copy…' : 'Save and email a copy'}
        </Button>
        {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
        <p className="text-xs text-muted-foreground">
          Builds {dayLabel}&apos;s packet, stores it, and emails a link to the show&apos;s
          officials: the secretary and the club administrators. Nothing is sent until you press the
          button.
        </p>
      </div>
      {outcome?.kind === 'sent' && (
        <p role="status" className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {dayLabel} copy stored and emailed to{' '}
          {plural(outcome.recipientCount, 'show official', 'show officials')}.
        </p>
      )}
      {outcome?.kind === 'nobody-emailed' && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Stored, but no show official has an email on file, so nobody was emailed.
        </p>
      )}
      {outcome?.kind === 'stored-not-emailed' && (
        <p role="alert" className="text-sm font-medium text-destructive">
          The copy was stored, but the email could not be sent. The stored copy is not listed and
          nobody received it. Trying again sends a fresh copy.
        </p>
      )}
      {outcome?.kind === 'offline' && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {OFFLINE_LINE}
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
        isSaving={marking}
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
