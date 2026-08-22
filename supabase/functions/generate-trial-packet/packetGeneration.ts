import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';
import {
  deliverStoredPacket,
  loadPacketShow,
  type DeliverStoredPacketDeps,
  type PacketDeliveryResult,
} from '../_shared/trialPacket/deliverStoredPacket.ts';
import {
  buildEmergencyPacketModel,
  buildEmergencyPacketStoragePath,
  emergencyPacketAvailability,
  splitPacketInputByTrialDay,
} from '../_shared/trialPacket/renderer/emergencyTrialPacket.ts';
import type { EmergencyPacketInput } from '../_shared/trialPacket/renderer/types.ts';

/**
 * The automated half of MYK9-228: build the packet nobody remembered to build.
 *
 * The show data comes from `emergency_packet_input`, the one SECURITY DEFINER
 * function that already resolves judges, backfills armbands, and drops every
 * entry that is not running (phase 3a). The model and the PDF come from the
 * SAME modules the browser uses — there is no second renderer to drift, which
 * is the whole reason phase 2 decoupled them from the app.
 */

const BUCKET = 'trial-packets';
const TRIAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface GeneratePacketRequest {
  showId: string;
  /** One day, or every day of the show when omitted. */
  trialDate?: string;
}

export interface GeneratedPacket {
  trialDate: string;
  snapshotId: string;
  pageCount: number;
  byteSize: number;
  recipientCount: number;
}

export interface SkippedPacket {
  trialDate: string;
  reason: 'already-delivered' | 'nothing-to-print';
}

export interface GeneratePacketSummary {
  showId: string;
  generatedAt: string;
  generated: GeneratedPacket[];
  skipped: SkippedPacket[];
}

export interface PacketGenerationDeps extends DeliverStoredPacketDeps {
  renderPdf: (model: ReturnType<typeof buildEmergencyPacketModel>) => Uint8Array;
  newSnapshotId?: () => string;
  digest?: (bytes: Uint8Array) => Promise<string>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateGenerateRequest(body: unknown): GeneratePacketRequest {
  const candidate = (body ?? {}) as Partial<GeneratePacketRequest>;
  if (typeof candidate.showId !== 'string' || !UUID_PATTERN.test(candidate.showId)) {
    throw new HttpError(400, 'A valid showId is required.');
  }
  if (candidate.trialDate !== undefined) {
    if (typeof candidate.trialDate !== 'string' || !TRIAL_DATE_PATTERN.test(candidate.trialDate)) {
      throw new HttpError(400, 'trialDate must be YYYY-MM-DD.');
    }
  }
  return {
    showId: candidate.showId,
    ...(candidate.trialDate ? { trialDate: candidate.trialDate } : {}),
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * `emergency_packet_input` returns the whole `EmergencyPacketInput` as one JSON
 * value. It is trusted (service-role only, and this repo wrote it), but a
 * shape mismatch here would surface as an unreadable renderer crash rather
 * than a diagnosable error, so the top level is checked.
 */
function assertPacketInput(value: unknown): EmergencyPacketInput {
  const input = value as Partial<EmergencyPacketInput> | null;
  if (
    !input ||
    typeof input !== 'object' ||
    !input.show ||
    !Array.isArray(input.trials) ||
    !Array.isArray(input.classes) ||
    !Array.isArray(input.entries)
  ) {
    throw new HttpError(500, 'The packet source returned an unexpected shape.');
  }
  return input as EmergencyPacketInput;
}

export async function generateTrialPackets(
  supabase: SupabaseClient,
  request: GeneratePacketRequest,
  deps: PacketGenerationDeps
): Promise<GeneratePacketSummary> {
  const now = deps.now ?? (() => new Date());
  const newSnapshotId = deps.newSnapshotId ?? (() => crypto.randomUUID());
  const digest = deps.digest ?? sha256Hex;

  const show = await loadPacketShow(supabase, request.showId);

  const { data, error } = await supabase.rpc('emergency_packet_input', {
    p_show_id: request.showId,
    p_trial_date: request.trialDate ?? null,
  });
  if (error) throw new HttpError(500, 'Failed to load the packet source data.');
  const input = assertPacketInput(data);

  const generatedAt = now().toISOString();
  const summary: GeneratePacketSummary = {
    showId: request.showId,
    generatedAt,
    generated: [],
    skipped: [],
  };

  for (const day of splitPacketInputByTrialDay({ ...input, generatedAt })) {
    // A day whose classes all got cancelled still has a trial row. Printing a
    // packet of empty score sheets is worse than printing nothing: it looks
    // like the real thing in the trial box.
    const availability = emergencyPacketAvailability(day.input);
    if (!availability.available) {
      summary.skipped.push({ trialDate: day.trialDate, reason: 'nothing-to-print' });
      continue;
    }

    // Cheap guard against a re-run. The authoritative one is the trigger's
    // claim/lease (phase 4) — this only stops the common case of the same day
    // being asked for twice, and it must come BEFORE the upload so a repeat
    // does not leave an orphan object in the bucket.
    const { data: delivered, error: deliveredError } = await supabase
      .from('trial_packet_snapshots')
      .select('snapshot_id')
      .eq('show_id', request.showId)
      .eq('trial_date', day.trialDate)
      .eq('delivery_status', 'sent')
      .limit(1)
      .maybeSingle();
    if (deliveredError) throw new HttpError(500, 'Failed to check for an existing packet.');
    if (delivered) {
      summary.skipped.push({ trialDate: day.trialDate, reason: 'already-delivered' });
      continue;
    }

    const model = buildEmergencyPacketModel(day.input);
    const bytes = deps.renderPdf(model);
    const snapshotId = newSnapshotId();
    const storagePath = buildEmergencyPacketStoragePath(request.showId, snapshotId);

    const pdf = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, pdf, {
      cacheControl: '0',
      contentType: 'application/pdf',
      upsert: false,
    });
    if (uploadError) throw new HttpError(500, 'Failed to store the generated packet.');

    const result: PacketDeliveryResult = await deliverStoredPacket(
      supabase,
      show,
      {
        snapshotId,
        storagePath,
        generatedAt,
        sha256: await digest(bytes),
        pageCount: model.pages.length,
        byteSize: bytes.byteLength,
        trialDate: day.trialDate,
        generatedBy: null,
        generatedSource: 'automated',
      },
      deps
    );

    summary.generated.push({
      trialDate: day.trialDate,
      snapshotId,
      pageCount: model.pages.length,
      byteSize: bytes.byteLength,
      recipientCount: result.recipientCount,
    });
  }

  return summary;
}
