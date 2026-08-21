import { useMemo, useState } from 'react';
import { ArchiveRestore, CheckCircle2, Loader2, Printer, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const { buildEmergencyTrialPacketPdf } = await import(
    '@/features/emergency-trial-packet/buildEmergencyTrialPacketPdf'
  );
  const bytes = buildEmergencyTrialPacketPdf(model);
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
  unavailableReason?: string | undefined;
  prepare?: (
    input: EmergencyPacketInput,
    trialDate?: string
  ) => Promise<EmergencyPacketDeliveryResult>;
  onMarkPrinted?: (descriptor: PaperworkDescriptor) => void;
}

export function EmergencyTrialPacketPanel({
  data,
  unavailableReason,
  prepare = preparePacket,
  onMarkPrinted,
}: EmergencyTrialPacketPanelProps) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparedPackets, setPreparedPackets] = useState<PreparedPacket[] | null>(null);
  const [error, setError] = useState(false);
  const availability = useMemo(
    () =>
      data
        ? emergencyPacketAvailability(data)
        : { available: false as const, reason: unavailableReason ?? 'Report data is still loading.' },
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
            <CardDescription className="mt-1 max-w-3xl">
              A paper fallback for running this show if the laptop, app, or local data is unavailable.
              It includes the catalog, check-in and running orders, writable score records,
              certifications, and recovery instructions.
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
                      {packet.trialDate} packet stored and emailed to{' '}
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
                    Mark {packet.trialDate} packet printed
                  </Button>
                )}
              </div>
            ))}
            <div className="rounded-md border-2 border-destructive/50 bg-destructive/10 p-4 text-destructive">
              <p className="text-lg font-bold uppercase">
                Print {preparedPackets.length > 1 ? 'each packet' : 'it'} and put{' '}
                {preparedPackets.length > 1 ? 'them' : 'it'} in the trial box.
              </p>
              <p className="mt-1 text-sm">
                Email delivery is not proof that the physical packet exists.
                {preparedPackets.length > 1
                  ? ' One packet per day — keep them separate.'
                  : ''}
              </p>
            </div>
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
              This is an online preparation step. Complete it before show day, then keep the printed packet with the trial supplies.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
