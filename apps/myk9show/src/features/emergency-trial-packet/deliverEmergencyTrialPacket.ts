import { supabase as defaultSupabase } from '@/lib/supabase';
import { hash as sha256 } from 'fast-sha256';
import { buildEmergencyPacketStoragePath } from './emergencyTrialPacket';
import type { EmergencyPacketDeliveryResult } from './types';

const TRIAL_PACKET_BUCKET = 'trial-packets';
const DELIVERY_FUNCTION = 'deliver-trial-packet';

interface StorageBucketClient {
  upload(
    path: string,
    body: Blob,
    options: { cacheControl: string; contentType: string; upsert: boolean }
  ): PromiseLike<{ error: unknown }>;
}

export interface EmergencyPacketSupabaseClient {
  storage: {
    from(bucket: string): StorageBucketClient;
  };
  functions: {
    invoke(
      functionName: string,
      options: { body: Record<string, unknown> }
    ): PromiseLike<{ data: unknown; error: unknown }>;
  };
}

export interface DeliverEmergencyPacketInput {
  showId: string;
  snapshotId: string;
  generatedAt: string;
  bytes: Uint8Array;
  pageCount: number;
}

export class EmergencyPacketDeliveryError extends Error {
  readonly storagePath: string;

  constructor(storagePath: string) {
    super('The packet was stored, but the email could not be sent. Try delivery again.');
    this.name = 'EmergencyPacketDeliveryError';
    this.storagePath = storagePath;
  }
}

function bytesToBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: 'application/pdf' });
}

function sha256Hex(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function isDeliveryResult(value: unknown): value is EmergencyPacketDeliveryResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.snapshotId === 'string' &&
    typeof candidate.generatedAt === 'string' &&
    typeof candidate.recipientCount === 'number' &&
    typeof candidate.linkExpiresAt === 'string' &&
    typeof candidate.pageCount === 'number'
  );
}

export async function deliverEmergencyTrialPacket(
  input: DeliverEmergencyPacketInput,
  client: EmergencyPacketSupabaseClient = defaultSupabase as unknown as EmergencyPacketSupabaseClient
): Promise<EmergencyPacketDeliveryResult> {
  const storagePath = buildEmergencyPacketStoragePath(input.showId, input.snapshotId);
  const pdf = bytesToBlob(input.bytes);
  const sha256 = sha256Hex(input.bytes);
  const { error: uploadError } = await client.storage.from(TRIAL_PACKET_BUCKET).upload(
    storagePath,
    pdf,
    {
      cacheControl: '0',
      contentType: 'application/pdf',
      upsert: false,
    }
  );

  if (uploadError) {
    throw new Error('Could not store the emergency packet. Check the connection and try again.');
  }

  const { data, error: deliveryError } = await client.functions.invoke(DELIVERY_FUNCTION, {
    body: {
      showId: input.showId,
      snapshotId: input.snapshotId,
      storagePath,
      generatedAt: input.generatedAt,
      sha256,
      pageCount: input.pageCount,
      byteSize: input.bytes.byteLength,
    },
  });

  if (deliveryError || !isDeliveryResult(data)) {
    throw new EmergencyPacketDeliveryError(storagePath);
  }

  return data;
}
