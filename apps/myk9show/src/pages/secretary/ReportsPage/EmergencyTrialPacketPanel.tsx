import { useMemo, useState } from 'react';
import { ArchiveRestore, CheckCircle2, Loader2, Printer, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  buildEmergencyPacketModel,
  emergencyPacketAvailability,
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
  delivery: EmergencyPacketDeliveryResult;
  printDescriptor: PaperworkDescriptor;
}

async function preparePacket(data: PacketData): Promise<EmergencyPacketDeliveryResult> {
  const generatedAt = new Date().toISOString();
  const model = buildEmergencyPacketModel({ ...data, generatedAt });
  const { buildEmergencyTrialPacketPdf } = await import(
    '@/features/emergency-trial-packet/buildEmergencyTrialPacketPdf'
  );
  const bytes = buildEmergencyTrialPacketPdf(model);
  return deliverEmergencyTrialPacket({
    showId: data.show.id,
    snapshotId: crypto.randomUUID(),
    generatedAt,
    bytes,
    pageCount: model.pages.length,
  });
}

export interface EmergencyTrialPacketPanelProps {
  data: PacketData | null;
  unavailableReason?: string | undefined;
  prepare?: (data: PacketData) => Promise<EmergencyPacketDeliveryResult>;
  onMarkPrinted?: (descriptor: PaperworkDescriptor) => void;
}

export function EmergencyTrialPacketPanel({
  data,
  unavailableReason,
  prepare = preparePacket,
  onMarkPrinted,
}: EmergencyTrialPacketPanelProps) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparedPacket, setPreparedPacket] = useState<PreparedPacket | null>(null);
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
      const delivery = await prepare(data);
      setPreparedPacket({
        delivery,
        printDescriptor: buildEmergencyPacketPaperworkDescriptor({
          showId: data.show.id,
          snapshotId: delivery.snapshotId,
          generatedAt: delivery.generatedAt,
          entryIds: data.entries.map(entry => entry.id),
          classIds: data.classes.map(classItem => classItem.id),
          trialIds: data.trials.map(trial => trial.id),
        }),
      });
    } catch {
      setPreparedPacket(null);
      setError(true);
    } finally {
      setIsPreparing(false);
    }
  };

  const markPrinted = () => {
    if (!preparedPacket || !onMarkPrinted) return;
    onMarkPrinted(preparedPacket.printDescriptor);
  };

  const result = preparedPacket?.delivery ?? null;

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
        {result ? (
          <div className="space-y-4" role="status">
            <div className="flex gap-3 rounded-md border border-success/30 bg-success/10 p-4 text-success">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">Packet stored and emailed to {result.recipientCount} show officials.</p>
                <p className="mt-1 text-sm">
                  Generated {new Date(result.generatedAt).toLocaleString()} · {result.pageCount} pages
                  {' · '}Link expires {new Date(result.linkExpiresAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="rounded-md border-2 border-destructive/50 bg-destructive/10 p-4 text-destructive">
              <p className="text-lg font-bold uppercase">Print it and put it in the trial box.</p>
              <p className="mt-1 text-sm">Email delivery is not proof that the physical packet exists.</p>
            </div>
            {onMarkPrinted && (
              <Button type="button" variant="outline" onClick={markPrinted}>
                <Printer className="size-4" />
                Mark packet printed
              </Button>
            )}
          </div>
        ) : (
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
