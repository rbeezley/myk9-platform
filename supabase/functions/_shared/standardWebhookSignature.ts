import { timingSafeEqual } from './timingSafeEqual.ts';

export interface StandardWebhookSignatureResult {
  ok: boolean;
  status: number;
  message?: string;
}

export interface VerifyStandardWebhookSignatureArgs {
  headers: Headers;
  body: string;
  secret: string | undefined;
  nowMs?: number;
}

const MAX_SKEW_SECONDS = 5 * 60;

function normalizeWebhookSecret(secret: string): string {
  const versionless = secret.replace(/^v\d+,/, '');
  return versionless.startsWith('whsec_') ? versionless.slice('whsec_'.length) : versionless;
}

function decodeWebhookSecret(secret: string): Uint8Array | null {
  const encoded = normalizeWebhookSecret(secret);
  try {
    return Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function parseSignatureHeader(header: string): string[] {
  return header
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.replace(/^v1,/, ''));
}

export async function verifyStandardWebhookSignature({
  headers,
  body,
  secret,
  nowMs = Date.now(),
}: VerifyStandardWebhookSignatureArgs): Promise<StandardWebhookSignatureResult> {
  if (!secret) {
    return { ok: false, status: 503, message: 'Webhook verification not configured' };
  }

  const webhookId = headers.get('webhook-id') ?? headers.get('svix-id');
  const webhookTimestamp = headers.get('webhook-timestamp') ?? headers.get('svix-timestamp');
  const webhookSignature = headers.get('webhook-signature') ?? headers.get('svix-signature');

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { ok: false, status: 401, message: 'Missing signature headers' };
  }

  if (!/^\d+$/.test(webhookTimestamp)) {
    return { ok: false, status: 401, message: 'Invalid signature timestamp' };
  }
  const timestampSeconds = Number(webhookTimestamp);
  if (!Number.isSafeInteger(timestampSeconds)) {
    return { ok: false, status: 401, message: 'Invalid signature timestamp' };
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_SKEW_SECONDS) {
    return { ok: false, status: 401, message: 'Signature timestamp out of range' };
  }

  const secretBytes = decodeWebhookSecret(secret);
  if (!secretBytes) {
    return { ok: false, status: 503, message: 'Webhook verification not configured' };
  }

  const payload = `${webhookId}.${webhookTimestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));
  const provided = parseSignatureHeader(webhookSignature);

  let matched = false;
  for (const value of provided) {
    if (timingSafeEqual(value, expected)) {
      matched = true;
    }
  }

  if (!matched) {
    return { ok: false, status: 401, message: 'Invalid signature' };
  }

  return { ok: true, status: 200 };
}
