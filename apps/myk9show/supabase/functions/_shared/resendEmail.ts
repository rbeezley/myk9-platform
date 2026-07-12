const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const MAX_RETRY_DELAY_MS = 2000;

export interface ResendEmailRequestInit extends Omit<RequestInit, 'body'> {
  body: string;
}

export interface ResendRetryEvent {
  attempt: number;
  status: number | 'network_error';
  delayMs: number;
}

export interface ResendRetryDependencies {
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  onRetry?: (event: ResendRetryEvent) => void;
}

const defaultSleep = (delayMs: number) =>
  new Promise<void>(resolve => setTimeout(resolve, delayMs));

function fallbackDelayMs(attempt: number, random: () => number): number {
  const baseMs = 250 * 2 ** (attempt - 1);
  const jitterMs = Math.floor(Math.min(1, Math.max(0, random())) * 100);
  return baseMs + jitterMs;
}

function retryAfterDelayMs(
  response: Response,
  attempt: number,
  random: () => number,
  now: () => number
): number {
  const value = response.headers.get('Retry-After');
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(MAX_RETRY_DELAY_MS, seconds * 1000);
    }
    const retryAt = Date.parse(value);
    if (Number.isFinite(retryAt)) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, retryAt - now()));
    }
  }
  return fallbackDelayMs(attempt, random);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException || (typeof error === 'object' && error !== null)) &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('aborted', 'AbortError');
}

async function waitForRetry(
  delayMs: number,
  sleep: (delayMs: number) => Promise<void>,
  signal?: AbortSignal | null
): Promise<void> {
  if (!signal) {
    await sleep(delayMs);
    return;
  }
  if (signal.aborted) throw abortReason(signal);

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortReason(signal));
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    sleep(delayMs).then(
      () => {
        cleanup();
        resolve();
      },
      error => {
        cleanup();
        reject(error);
      }
    );
  });
}

async function contentIdempotencyKey(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(
    ''
  );
  return `myk9-${hex}`;
}

export async function sendResendEmailWithRetry(
  init: ResendEmailRequestInit,
  dependencies: ResendRetryDependencies = {}
): Promise<Response> {
  if (typeof init.body !== 'string') {
    throw new TypeError('Resend email body must be a JSON string');
  }
  const existingHeaders = new Headers(init.headers);
  const requestInit = existingHeaders.has('Idempotency-Key')
    ? init
    : {
        ...init,
        headers: {
          ...Object.fromEntries(existingHeaders.entries()),
          'Idempotency-Key': await contentIdempotencyKey(init.body),
        },
      };
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const sleep = dependencies.sleep ?? defaultSleep;
  const random = dependencies.random ?? Math.random;
  const now = dependencies.now ?? Date.now;
  const onRetry =
    dependencies.onRetry ??
    ((event: ResendRetryEvent) => {
      console.warn('resend_email_retry', event);
    });

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (requestInit.signal?.aborted) {
      throw abortReason(requestInit.signal);
    }
    let response: Response;
    try {
      response = await fetchImpl(RESEND_EMAILS_URL, requestInit);
    } catch (error) {
      if (isAbortError(error) || attempt === 3) throw error;
      const delayMs = fallbackDelayMs(attempt, random);
      onRetry({ attempt, status: 'network_error', delayMs });
      await waitForRetry(delayMs, sleep, requestInit.signal);
      continue;
    }
    if (!isRetryableStatus(response.status) || attempt === 3) return response;

    const delayMs = retryAfterDelayMs(response, attempt, random, now);
    onRetry({ attempt, status: response.status, delayMs });
    try {
      await response.body?.cancel();
    } catch {
      // Best-effort cleanup must not prevent a retry.
    }
    await waitForRetry(delayMs, sleep, requestInit.signal);
  }

  throw new Error('Resend retry loop exhausted without a response');
}
