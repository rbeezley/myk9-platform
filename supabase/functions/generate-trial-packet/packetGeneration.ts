import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';
import { isValidTrialDate } from '../_shared/trialPacket/delivery.ts';
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
  // Shared with the manual path so both reject the same set. A shape-only
  // regex admits 2026-02-30, which Postgres refuses when it binds the RPC's
  // `date` argument — a client mistake arriving as a 500 that a scheduler will
  // happily retry.
  if (candidate.trialDate !== undefined) {
    if (typeof candidate.trialDate !== 'string' || !isValidTrialDate(candidate.trialDate)) {
      throw new HttpError(400, 'trialDate must be a real calendar day in YYYY-MM-DD form.');
    }
  }
  return {
    showId: candidate.showId,
    ...(candidate.trialDate ? { trialDate: candidate.trialDate } : {}),
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Pass the view itself. Copying into a fresh ArrayBuffer first looks safer
  // and is not: WebCrypto accepts any BufferSource and respects the view's
  // offset and length, while the copy is one more object that has to belong to
  // the same realm as `crypto` — which under jsdom it does not always.
  // The assertion is for TypeScript, not the runtime. Deno's lib types
  // `Uint8Array` as `Uint8Array<ArrayBufferLike>`, which admits a
  // SharedArrayBuffer backing that `BufferSource` excludes — a distinction
  // that cannot arise here, since the bytes come from the PDF renderer.
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
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

  const days = splitPacketInputByTrialDay({ ...input, generatedAt });

  // A named day that produced nothing must SAY so. Otherwise a mistyped date,
  // or a day whose trials were all cancelled, returns 200 with both lists
  // empty — indistinguishable from a successful run, which is precisely the
  // wrong thing to hand a scheduler.
  if (request.trialDate && days.length === 0) {
    summary.skipped.push({ trialDate: request.trialDate, reason: 'nothing-to-print' });
    return summary;
  }

  for (const day of days) {
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
