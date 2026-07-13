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
  createIdempotencyKey?: () => string | Promise<string>;
  onRetry?: (event: ResendRetryEvent) => void;
}

const defaultSleep = (delayMs: number) =>
  new Promise<void>(resolve => setTimeout(resolve, delayMs));

function fallbackDelayMs(attempt: number, random: () => number): number {
  const baseMs = 250 * 2 ** (attempt - 1);
  const jitterMs = Math.floor(Math.min(1, Math.max(0, random())) * 100);
  return baseMs + jitterMs;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function utcDateMs(
  year: number,
  monthName: string,
  day: string,
  hour: string,
  minute: string,
  second: string
): number | null {
  const month = MONTHS.indexOf(monthName);
  if (month < 0) return null;
  const values = [day, hour, minute, second].map(Number);
  const timestamp = Date.UTC(year, month, values[0], values[1], values[2], values[3]);
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month &&
    parsed.getUTCDate() === values[0] &&
    parsed.getUTCHours() === values[1] &&
    parsed.getUTCMinutes() === values[2] &&
    parsed.getUTCSeconds() === values[3]
    ? timestamp
    : null;
}

function parseHttpDate(value: string, nowMs: number): number | null {
  const imf = value.match(
    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/
  );
  if (imf) return utcDateMs(Number(imf[3]), imf[2], imf[1], imf[4], imf[5], imf[6]);

  const rfc850 = value.match(
    /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(\w{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/
  );
  if (rfc850) {
    const currentYear = new Date(nowMs).getUTCFullYear();
    let year = Math.floor(currentYear / 100) * 100 + Number(rfc850[3]);
    let timestamp = utcDateMs(year, rfc850[2], rfc850[1], rfc850[4], rfc850[5], rfc850[6]);
    const futureLimit = new Date(nowMs);
    futureLimit.setUTCFullYear(currentYear + 50);
    if (timestamp !== null && timestamp > futureLimit.getTime()) {
      year -= 100;
      timestamp = utcDateMs(year, rfc850[2], rfc850[1], rfc850[4], rfc850[5], rfc850[6]);
    }
    return timestamp;
  }

  const asctime = value.match(
    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\w{3}) (?: (\d)|(\d{2})) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/
  );
  return asctime
    ? utcDateMs(
        Number(asctime[7]),
        asctime[1],
        asctime[2] ?? asctime[3],
        asctime[4],
        asctime[5],
        asctime[6]
      )
    : null;
}

function retryAfterDelayMs(
  response: Response,
  attempt: number,
  random: () => number,
  now: () => number
): number {
  const value = response.headers.get('Retry-After');
  if (value) {
    if (/^\d+$/.test(value)) {
      const seconds = Number(value);
      return Number.isFinite(seconds)
        ? Math.min(MAX_RETRY_DELAY_MS, seconds * 1000)
        : MAX_RETRY_DELAY_MS;
    }
    const nowMs = now();
    const retryAt = parseHttpDate(value, nowMs);
    if (retryAt !== null) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, retryAt - nowMs));
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

function randomIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') {
    return `myk9-${crypto.randomUUID()}`;
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `myk9-${hex}`;
}

export async function sendResendEmailWithRetry(
  init: ResendEmailRequestInit,
  dependencies: ResendRetryDependencies = {}
): Promise<Response> {
  if (typeof init.body !== 'string') {
    throw new TypeError('Resend email body must be a JSON string');
  }
  const createIdempotencyKey = dependencies.createIdempotencyKey ?? randomIdempotencyKey;
  const existingHeaders = new Headers(init.headers);
  const requestInit = existingHeaders.has('Idempotency-Key')
    ? init
    : {
        ...init,
        headers: {
          ...Object.fromEntries(existingHeaders.entries()),
          'Idempotency-Key': await createIdempotencyKey(),
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
    const cancellation = response.body?.cancel();
    if (cancellation) void cancellation.catch(() => undefined);
    await waitForRetry(delayMs, sleep, requestInit.signal);
  }

  throw new Error('Resend retry loop exhausted without a response');
}
