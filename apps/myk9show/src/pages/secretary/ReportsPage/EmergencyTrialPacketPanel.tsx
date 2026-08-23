import { useMemo, useState } from 'react';
import { ArchiveRestore, CheckCircle2, Loader2, Printer, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatWeekdayMonthDay } from '@/lib/format/dates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  buildEmergencyPacketModel,
  emergencyPacketAvailability,
  splitPacketInputByTrialDay,
} from '@/features/emergency-trial-packet/emergencyTrialPacket';
import { deliverEmergencyTrialPacket } from '@/features/emergency-trial-packet/deliverEmergencyTrialPacket';
import type {
  EmergencyPacketDeliveryResult,
  EmergencyPacketInput,
} from '@/features/emergency-trial-packet/types';
import {
  buildEmergencyPacketPaperworkDescriptor,
  type PaperworkDescriptor,
} from '@/features/show-map/cockpit/paperworkPrintState';
import type { DeliveredPacketRow } from './deliveredPacketRows';

type PacketData = Omit<EmergencyPacketInput, 'generatedAt'>;

interface PreparedPacket {
  trialDate: string;
  delivery: EmergencyPacketDeliveryResult;
  printDescriptor: PaperworkDescriptor;
}

/**
 * One packet per trial DAY (MYK9-228). `generatedAt` is minted once for the
 * whole batch so a night's packets share a timestamp and sort together.
 */
async function preparePacket(
  input: EmergencyPacketInput,
  trialDate?: string
): Promise<EmergencyPacketDeliveryResult> {
  const model = buildEmergencyPacketModel(input);
  const { renderEmergencyTrialPacketPdf } =
    await import('@/features/emergency-trial-packet/renderPacketPdf');
  const bytes = renderEmergencyTrialPacketPdf(model);
  return deliverEmergencyTrialPacket({
    showId: input.show.id,
    snapshotId: crypto.randomUUID(),
    generatedAt: input.generatedAt,
    bytes,
    pageCount: model.pages.length,
    ...(trialDate ? { trialDate } : {}),
  });
}

export interface EmergencyTrialPacketPanelProps {
  data: PacketData | null;
  /**
   * Packets that already exist for this show, whoever made them.
   *
   * Once generation moved to cron (MYK9-228 phase 4) the session-only list
   * below stopped being the whole story: the secretary arrives to a packet
   * made overnight and needs to confirm printing it WITHOUT pressing Prepare,
   * which would mint a new snapshot and email everyone a second copy. That is
   * the only thing that stops the twice-daily print reminder.
   */
  deliveredPackets?: readonly DeliveredPacketRow[];
  /**
   * Rendering nothing on a failed read looks exactly like "no packets exist",
   * which is the very state the reminder is chasing. Say so instead.
   */
  deliveredPacketsError?: boolean;
  unavailableReason?: string | undefined;
  prepare?: (
    input: EmergencyPacketInput,
    trialDate?: string
  ) => Promise<EmergencyPacketDeliveryResult>;
  onMarkPrinted?: (descriptor: PaperworkDescriptor) => void;
}

export function EmergencyTrialPacketPanel({
  data,
  deliveredPackets = [],
  deliveredPacketsError = false,
  unavailableReason,
  prepare = preparePacket,
  onMarkPrinted,
}: EmergencyTrialPacketPanelProps) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparedPackets, setPreparedPackets] = useState<PreparedPacket[] | null>(null);
  const [error, setError] = useState(false);
  // A day prepared in THIS session already has its own row above, so showing
  // the stored copy again would offer two buttons for one packet.
  const outstandingPackets = useMemo(() => {
    const preparedDays = new Set((preparedPackets ?? []).map(packet => packet.trialDate));
    return deliveredPackets.filter(row => !preparedDays.has(row.trialDate));
  }, [deliveredPackets, preparedPackets]);
  const availability = useMemo(
    () =>
      data
        ? emergencyPacketAvailability(data)
        : {
            available: false as const,
            reason: unavailableReason ?? 'Report data is still loading.',
          },
    [data, unavailableReason]
  );

  const handlePrepare = async () => {
    if (!data || !availability.available) return;
    setIsPreparing(true);
    setError(false);
    try {
      const generatedAt = new Date().toISOString();
      const done = preparedPackets ?? [];
      const finished = new Set(done.map(packet => packet.trialDate));
      // Only attempt days that have not already been stored and emailed. A
      // retry after a partial failure must NOT re-send a day that succeeded:
      // that mints a second snapshot and a second email, producing exactly the
      // duplicate stacks this per-day split exists to prevent (MYK9-228).
      const days = splitPacketInputByTrialDay({ ...data, generatedAt }).filter(
        day => !finished.has(day.trialDate)
      );

      const prepared: PreparedPacket[] = [...done];
      let failed = false;
      for (const day of days) {
        try {
          const delivery = await prepare(day.input, day.trialDate);
          prepared.push({
            trialDate: day.trialDate,
            delivery,
            printDescriptor: buildEmergencyPacketPaperworkDescriptor({
              showId: day.input.show.id,
              trialDate: day.trialDate,
              snapshotId: delivery.snapshotId,
              generatedAt: delivery.generatedAt,
              entryIds: day.input.entries.map(entry => entry.id),
              classIds: day.input.classes.map(classItem => classItem.id),
              trialIds: day.input.trials.map(trial => trial.id),
            }),
          });
        } catch {
          // Keep going: one day's failure must not cost the others.
          failed = true;
        }
      }

      prepared.sort((a, b) => a.trialDate.localeCompare(b.trialDate));
      setPreparedPackets(prepared.length > 0 ? prepared : null);
      setError(failed || prepared.length === 0);
    } finally {
      setIsPreparing(false);
    }
  };

  const markPrinted = (packet: PreparedPacket) => {
    if (!onMarkPrinted) return;
    onMarkPrinted(packet.printDescriptor);
  };

  return (
    <Card className="mb-6 border-warning/30 bg-warning/10">
      <CardHeader>
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-6 shrink-0 text-warning" />
          <div>
            <CardTitle>Emergency Trial Packet</CardTitle>
            {/* text-foreground, not the inherited muted-foreground: on this
                card's warning tint --muted-foreground measures 4.03:1 in dark
                mode, under the 4.5:1 floor. Hierarchy is carried by size and
                weight instead. */}
            <CardDescription className="mt-1 max-w-3xl text-foreground">
              A paper fallback for running this show if the laptop, app, or local data is
              unavailable. It includes the catalog, check-in and running orders, writable score
              records, certifications, and recovery instructions.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {preparedPackets && (
          <div className="space-y-4" role="status">
            {preparedPackets.map(packet => (
              <div key={packet.delivery.snapshotId} className="space-y-2">
                <div className="flex gap-3 rounded-md border border-success/30 bg-success/10 p-4 text-success">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      {formatWeekdayMonthDay(packet.trialDate)} packet stored and emailed to{' '}
                      {packet.delivery.recipientCount} show officials.
                    </p>
                    <p className="mt-1 text-sm">
                      Generated {new Date(packet.delivery.generatedAt).toLocaleString()} ·{' '}
                      {packet.delivery.pageCount} pages{' · '}Link expires{' '}
                      {new Date(packet.delivery.linkExpiresAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {onMarkPrinted && (
                  <Button type="button" variant="outline" onClick={() => markPrinted(packet)}>
                    <Printer className="size-4" />
                    Mark {formatWeekdayMonthDay(packet.trialDate)} packet printed
                  </Button>
                )}
              </div>
            ))}
            {/* Was a third severity colour -- a destructive tint nested inside
                a success tint inside a warning card -- set in uppercase bold.
                The 14px line measured 4.46:1 against that stacked tint, under
                the 4.5:1 floor, and shouting is the wrong register for a page
                a secretary reaches the night before a trial. The instruction
                reads just as clearly in one weight, with the icon carrying the
                signal. */}
            <div className="flex gap-3 rounded-md border border-border bg-background p-4">
              <Printer className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
              <div>
                <p className="font-semibold">
                  Print {preparedPackets.length > 1 ? 'each packet' : 'it'} and put{' '}
                  {preparedPackets.length > 1 ? 'them' : 'it'} in the trial box.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Email delivery is not proof that the physical packet exists.
                  {preparedPackets.length > 1 ? ' One packet per day; keep them separate.' : ''}
                </p>
              </div>
            </div>
          </div>
        )}
        {deliveredPacketsError && (
          <p className="mb-4 text-sm font-medium text-destructive" role="alert">
            We could not check which packets already exist for this show. Reload before preparing a
            new one, or you may email a duplicate.
          </p>
        )}
        {outstandingPackets.length > 0 && (
          <div className="mb-4 space-y-2" data-testid="delivered-packets">
            <p className="text-sm font-medium">Packets already prepared for this show</p>
            {outstandingPackets.map(row => (
              <div
                key={row.snapshotId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <span className="font-medium">{formatWeekdayMonthDay(row.trialDate)}</span>
                  <span className="text-muted-foreground">
                    {' · '}
                    {row.pageCount} pages · generated {new Date(row.generatedAt).toLocaleString()}
                  </span>
                  {row.printState === 'superseded' && (
                    <p className="text-warning">
                      A newer packet replaced the one that was printed. Print this one and confirm
                      again.
                    </p>
                  )}
                </div>
                {/*
                 * Printed FIRST. Ordering these the other way told a
                 * secretary who had already confirmed Saturday to "choose All
                 * Trials and All Classes" the moment they narrowed the report
                 * to one trial — because `descriptor` is null whenever the
                 * scope is not show-wide, or while data is loading. It reads
                 * as "not confirmed", and the obvious response is to widen
                 * the scope and press the button again, appending a second
                 * row for a snapshot already confirmed.
                 */}
                {row.printState === 'printed' ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <CheckCircle2 className="size-4" />
                    Printed
                  </span>
                ) : !row.descriptor ? (
                  <span className="text-muted-foreground">
                    Choose All Trials and All Classes to confirm this packet.
                  </span>
                ) : (
                  onMarkPrinted &&
                  row.descriptor && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onMarkPrinted(row.descriptor as PaperworkDescriptor)}
                    >
                      <Printer className="size-4" />
                      Mark {formatWeekdayMonthDay(row.trialDate)} packet printed
                    </Button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
        {(!preparedPackets || error) && (
          <div className="space-y-3">
            {!availability.available && (
              <p className="text-sm text-muted-foreground">{availability.reason}</p>
            )}
            {error && (
              <p className="text-sm font-medium text-destructive" role="alert">
                We could not email the packet. The stored copy may still exist; try delivery again.
              </p>
            )}
            <Button
              type="button"
              onClick={() => void handlePrepare()}
              disabled={!availability.available || isPreparing}
            >
              {isPreparing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArchiveRestore className="size-4" />
              )}
              {error ? 'Try again' : isPreparing ? 'Preparing packet…' : 'Prepare and email packet'}
            </Button>
            <p className="text-xs text-muted-foreground">
              This is an online preparation step. Complete it before show day, then keep the printed
              packet with the trial supplies.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
