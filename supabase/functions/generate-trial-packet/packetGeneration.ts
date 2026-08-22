import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';
import { isUuidShaped, isValidTrialDate } from '../_shared/trialPacket/delivery.ts';
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
import { shouldReclaimStalePacketClaim } from './packetClaim.ts';

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
const CLAIMS = 'trial_packet_generation_claims';
/**
 * Far enough in the past that any lease is expired, so the next run reclaims
 * immediately rather than waiting out a lease nobody is holding.
 */
const RELEASED_CLAIM_AT = '1970-01-01T00:00:00.000Z';

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

export interface FailedPacket {
  trialDate: string;
  message: string;
}

export interface SkippedPacket {
  trialDate: string;
  /**
   * `in-flight` is NOT the same as `already-delivered`: it means another run
   * holds an unexpired claim, so this day may still get its packet moments
   * from now. Collapsing the two would make a stuck run look like a success.
   */
  reason: 'already-delivered' | 'nothing-to-print' | 'in-flight';
}

export interface GeneratePacketSummary {
  showId: string;
  generatedAt: string;
  generated: GeneratedPacket[];
  skipped: SkippedPacket[];
  /** Days whose generation threw. Recorded so a partial run is legible. */
  failed: FailedPacket[];
  /**
   * Packets that were delivered but whose claim could not be stamped complete.
   * Self-healing — the sent-snapshot check catches the day on a later run —
   * but counted so it is never invisible.
   */
  unrecordedCompletions: number;
}

export interface PacketGenerationDeps extends DeliverStoredPacketDeps {
  renderPdf: (model: ReturnType<typeof buildEmergencyPacketModel>) => Uint8Array;
  newSnapshotId?: () => string;
  digest?: (bytes: Uint8Array) => Promise<string>;
}

export function validateGenerateRequest(body: unknown): GeneratePacketRequest {
  const candidate = (body ?? {}) as Partial<GeneratePacketRequest>;
  if (typeof candidate.showId !== 'string' || !isUuidShaped(candidate.showId)) {
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
    failed: [],
    unrecordedCompletions: 0,
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

    // Claim the day BEFORE doing any work. The unique constraint is what makes
    // two overlapping cron runs safe; without it both would read "no packet
    // yet", both would render, and the secretary would get two emails and two
    // near-identical stacks. The claim also has to precede the upload, or a
    // repeat leaves orphan objects in a bucket nothing deletes from.
    let claimToken = now().toISOString();
    let existingAttempts = 0;
    const claimKey = { show_id: request.showId, trial_date: day.trialDate };

    const { error: claimError } = await supabase
      .from(CLAIMS)
      .insert({ ...claimKey, claimed_at: claimToken });

    if (claimError) {
      // ONLY a unique violation means "someone else has this day". Anything
      // else — a missing migration, a revoked grant — must surface, or a
      // completely broken deploy reports a run in which every day was quietly
      // "skipped" and no packet was ever made.
      if (claimError.code !== '23505') {
        throw new HttpError(500, 'Failed to claim the trial day for generation.');
      }

      const { data: existing, error: existingError } = await supabase
        .from(CLAIMS)
        .select('claimed_at, completed_at, attempts')
        .match(claimKey)
        .maybeSingle();
      if (existingError) throw new HttpError(500, 'Failed to read the existing claim.');
      existingAttempts = (existing?.attempts as number | undefined) ?? 0;

      if (existing?.completed_at) {
        summary.skipped.push({ trialDate: day.trialDate, reason: 'already-delivered' });
        continue;
      }
      if (!existing || !shouldReclaimStalePacketClaim(existing, now().getTime())) {
        summary.skipped.push({ trialDate: day.trialDate, reason: 'in-flight' });
        continue;
      }

      // Compare-and-swap, not a bare update: runs overlap on this schedule and
      // both could read the same stale claim. Only the invocation whose update
      // actually matches proceeds.
      const reclaimToken = new Date(now().getTime() + 1).toISOString();
      const { data: reclaimed, error: reclaimError } = await supabase
        .from(CLAIMS)
        .update({ claimed_at: reclaimToken })
        .match(claimKey)
        .eq('claimed_at', existing.claimed_at)
        .is('completed_at', null)
        .select('id');
      if (reclaimError) throw new HttpError(500, 'Failed to reclaim the stale claim.');
      if (!reclaimed?.length) {
        summary.skipped.push({ trialDate: day.trialDate, reason: 'in-flight' });
        continue;
      }
      claimToken = reclaimToken;
    }

    // A packet the secretary made by hand counts. The manual path writes no
    // claim, so this is the only thing that sees it — and re-sending would be
    // the second email for one trial day that the whole design forbids.
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
      // Complete the claim rather than releasing it: the day is genuinely
      // done, and a released claim would make every later run re-ask.
      await supabase
        .from(CLAIMS)
        .update({ completed_at: now().toISOString() })
        .match(claimKey)
        .eq('claimed_at', claimToken);
      summary.skipped.push({ trialDate: day.trialDate, reason: 'already-delivered' });
      continue;
    }

    const model = buildEmergencyPacketModel(day.input);
    let result: PacketDeliveryResult;
    let snapshotId: string;
    let byteSize: number;
    let uploadedPath: string | null = null;
    try {
      const bytes = deps.renderPdf(model);
      snapshotId = newSnapshotId();
      byteSize = bytes.byteLength;
      const storagePath = buildEmergencyPacketStoragePath(request.showId, snapshotId);

      const pdf = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, pdf, {
        cacheControl: '0',
        contentType: 'application/pdf',
        upsert: false,
      });
      if (uploadError) throw new HttpError(500, 'Failed to store the generated packet.');
      uploadedPath = storagePath;

      result = await deliverStoredPacket(
        supabase,
        show,
        {
          snapshotId,
          storagePath,
          generatedAt,
          sha256: await digest(bytes),
          pageCount: model.pages.length,
          byteSize,
          trialDate: day.trialDate,
          generatedBy: null,
          generatedSource: 'automated',
        },
        deps
      );
    } catch (error) {
      // Release the claim so a later run in this evening's window retries.
      // Holding it would let one bad render suppress the day until the lease
      // expires, and a claim left behind after the window closes means no
      // paper at all. Conditional on still holding THIS claim: if the run
      // outlived its lease and another took over, that run owns the outcome.
      //
      // Release by EXPIRING the lease, not by deleting. A delete freed the day
      // for retry and erased the only evidence anything went wrong — for a
      // render failure or an oversized packet there is no snapshot row either,
      // so eight failures in an evening left nothing behind. Backdating
      // `claimed_at` past the lease makes the next run reclaim it exactly as a
      // crashed run would, while `last_error` survives.
      //
      // Safe ONLY because delivery no longer throws after a successful send —
      // that is reported as `recorded: false`. If it ever throws post-send
      // again, this turns into a duplicate-email generator.
      await supabase
        .from(CLAIMS)
        .update({
          claimed_at: RELEASED_CLAIM_AT,
          last_error: (error instanceof Error ? error.message : 'Unknown failure').slice(0, 500),
          failed_at: now().toISOString(),
          attempts: (existingAttempts ?? 0) + 1,
        })
        .match(claimKey)
        .eq('claimed_at', claimToken)
        .is('completed_at', null);
      // Drop the object this attempt uploaded. Nothing else deletes from the
      // bucket, so six failed evening runs would leave six orphan PDFs.
      if (uploadedPath) {
        await supabase.storage.from(BUCKET).remove([uploadedPath]);
      }
      // One bad day must not cost the rest of a whole-show request. The cron
      // sends one day per call, but the manual all-days path would otherwise
      // lose every later day to a single failed render — and return a 500 that
      // says nothing about which days did succeed.
      summary.failed.push({
        trialDate: day.trialDate,
        message: error instanceof Error ? error.message : 'Unknown failure',
      });
      continue;
    }

    // Another sender won the race between our claim and our send — the
    // manual button, most likely. Our upload is now referenced by no snapshot
    // row, so drop it: nothing else deletes from this bucket. And the day is
    // SKIPPED, not generated; reporting it as generated would put a snapshot
    // id with no database row into the summary.
    if (result.alreadyDelivered) {
      if (uploadedPath) await supabase.storage.from(BUCKET).remove([uploadedPath]);
      await supabase
        .from(CLAIMS)
        .update({ completed_at: now().toISOString() })
        .match(claimKey)
        .eq('claimed_at', claimToken);
      summary.skipped.push({ trialDate: day.trialDate, reason: 'already-delivered' });
      continue;
    }

    // Only now is the day genuinely done. `deliverStoredPacket` throws on a
    // failed send, so reaching here means the email was accepted.
    // Retry once. The duplicate-email case needs BOTH this write and the audit
    // insert to fail, and the code used to treat them as independent — they
    // are not: same client, same PostgREST, milliseconds apart, so a brief
    // outage takes both. When that happens the claim keeps a null
    // `completed_at`, the next run reclaims past the lease, finds no `sent`
    // snapshot (the statement that writes it is the one that failed) and sends
    // a second identical email. One retry is far cheaper than that.
    const stampComplete = async () =>
      await supabase
        .from(CLAIMS)
        .update({ completed_at: now().toISOString() })
        .match(claimKey)
        .eq('claimed_at', claimToken);
    let { error: completeError } = await stampComplete();
    if (completeError) ({ error: completeError } = await stampComplete());
    // Do not throw: the packet IS stored and emailed. Failing the whole run
    // here would report a delivered packet as an error, and the worst case of
    // a missed completion is one duplicate on a later run — which the sent
    // snapshot check above then catches anyway.
    if (completeError) summary.unrecordedCompletions += 1;
    // The email went out even if its audit row did not. Counted, never retried.
    if (!result.recorded) summary.unrecordedCompletions += 1;

    summary.generated.push({
      trialDate: day.trialDate,
      snapshotId,
      pageCount: model.pages.length,
      byteSize,
      recipientCount: result.recipientCount,
    });
  }

  return summary;
}
