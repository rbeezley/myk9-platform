import * as Sentry from '@sentry/react';
import type { BrowserOptions, ErrorEvent as SentryErrorEvent, EventHint } from '@sentry/react';
import { redactSecretLikeString } from '@myk9/core';
import type { ErrorInfo } from 'react';

const FILTERED = '[Filtered]';

export interface SentryRuntimeConfig {
  dsn?: string | undefined;
  environment?: string | undefined;
  release?: string | undefined;
  tracesSampleRate?: string | undefined;
}

export type AuthEmailRequestAction = 'signup' | 'resend';

const AUTH_EMAIL_OPERATIONAL_CODES = new Set([
  'email_address_not_authorized',
  'hook_timeout',
  'hook_timeout_after_retry',
  'over_email_send_rate_limit',
  'over_request_rate_limit',
]);

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'dogname',
  'dogregistrationnumber',
  'email',
  'handlername',
  'ip_address',
  'ipaddress',
  'microchip',
  'microchipnumber',
  'phone',
  'registrationnumber',
  'accesstoken',
  'apikey',
  'clientsecret',
  'idtoken',
  'password',
  'refreshtoken',
  'secret',
  'token',
  'tokenhash',
  'username',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.replace(/[_-]/g, '').toLowerCase());
}

function parseSampleRate(value: string | undefined): number {
  if (!value) return 0.05;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.05;
  return Math.min(1, Math.max(0, parsed));
}

function stripUrlDetails(url: string | undefined): string | undefined {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return redactString(url);
  }
}

function redactString(value: string): string {
  return redactSecretLikeString(value)
    .replace(/\bHandler\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)+/g, 'Handler [Filtered]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, FILTERED)
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, FILTERED)
    .replace(/\b(?:AKC[-\s]?)?[A-Z]{1,3}\d{5,}\b/g, FILTERED);
}

function scrubValue(value: unknown, key = ''): unknown {
  if (value === undefined || value === null) return value;
  if (isSensitiveKey(key)) return FILTERED;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(item => scrubValue(item));

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        scrubValue(entryValue, entryKey),
      ])
    );
  }

  return value;
}

const ANONYMOUS_FRAME_FILENAMES = new Set(['', '<anonymous>', '<unknown>', 'anonymous']);

function isAnonymousFrame(filename: string | undefined): boolean {
  return ANONYMOUS_FRAME_FILENAMES.has((filename ?? '').trim());
}

/**
 * True when the stack contains script code that came from no source file at all — the
 * signature of a browser extension or other injected script running on our page.
 *
 * The discriminator is the position, not just the filename. A native builtin renders as
 * `at JSON.stringify (<anonymous>)` with no line or column, so an anonymous frame WITHOUT
 * a `lineno` is ordinary JS engine machinery and says nothing about who called it. An
 * anonymous frame WITH a `lineno` (`at None (<anonymous>:25:21)`) is real script the
 * browser executed from a source we never served — code we neither own nor can fix.
 *
 * Keeping the `lineno` requirement is what stops this from swallowing our own bugs: if
 * myK9Show code calls `JSON.stringify` on a circular object, the only anonymous frame is
 * the positionless native one, and the event is still reported.
 */
export function isInjectedScriptEvent(event: SentryErrorEvent): boolean {
  const values = event.exception?.values ?? [];
  // Sentry orders chained exceptions oldest-first; the last value is the surfaced error.
  const frames = values[values.length - 1]?.stacktrace?.frames ?? [];

  return frames.some(frame => isAnonymousFrame(frame.filename) && typeof frame.lineno === 'number');
}

export function scrubSentryEvent(
  event: SentryErrorEvent,
  _hint?: EventHint
): SentryErrorEvent | null {
  if (isInjectedScriptEvent(event)) return null;

  const scrubbed = scrubValue(event) as SentryErrorEvent;

  if (event.user?.id) {
    scrubbed.user = { id: event.user.id };
  } else {
    delete scrubbed.user;
  }

  if (scrubbed.request) {
    const scrubbedRequest = { ...scrubbed.request };
    const scrubbedUrl = stripUrlDetails(scrubbedRequest.url);
    const scrubbedHeaders = scrubValue(scrubbedRequest.headers) as
      Record<string, string> | undefined;

    if (scrubbedUrl) {
      scrubbedRequest.url = scrubbedUrl;
    } else {
      delete scrubbedRequest.url;
    }

    if (scrubbedHeaders) {
      scrubbedRequest.headers = scrubbedHeaders;
    } else {
      delete scrubbedRequest.headers;
    }

    scrubbed.request = scrubbedRequest;
  }

  return scrubbed;
}

export function buildSentryInitOptions(config: SentryRuntimeConfig): BrowserOptions {
  return {
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    sendDefaultPii: false,
    tracesSampleRate: parseSampleRate(config.tracesSampleRate),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: scrubSentryEvent,
  };
}

function readRuntimeConfig(): SentryRuntimeConfig {
  const commitSha = typeof __GIT_COMMIT_SHA__ === 'undefined' ? '' : __GIT_COMMIT_SHA__;
  const appVersion = typeof __APP_VERSION__ === 'undefined' ? '' : __APP_VERSION__;

  return {
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: commitSha || appVersion,
    tracesSampleRate: import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
  };
}

export function initializeSentry(): boolean {
  const config = readRuntimeConfig();
  if (!config.dsn) return false;

  Sentry.init(buildSentryInitOptions(config));
  return true;
}

export function captureErrorBoundaryException(
  error: Error,
  errorInfo: ErrorInfo,
  context: { context: string; level: string; errorId: string }
): void {
  Sentry.withScope(scope => {
    scope.setContext('react', {
      componentStack: errorInfo.componentStack,
      boundaryContext: context.context,
      boundaryLevel: context.level,
      errorId: context.errorId,
    });
    scope.setTag('boundary_context', context.context);
    scope.setTag('boundary_level', context.level);
    Sentry.captureException(error);
  });
}

export function captureAuthEmailRequestFailure(
  error: unknown,
  action: AuthEmailRequestAction
): void {
  if (!isAuthEmailOperationalFailure(error)) return;

  const reportableError =
    error instanceof Error ? error : new Error('Supabase auth email request failed');
  const details = error as { code?: unknown; status?: unknown };

  Sentry.withScope(scope => {
    scope.setTag('auth_email_action', action);
    scope.setTag('auth_error_code', typeof details.code === 'string' ? details.code : 'unknown');
    scope.setContext('auth_email_failure', {
      action,
      code: typeof details.code === 'string' ? details.code : 'unknown',
      status: typeof details.status === 'number' ? details.status : 'unknown',
    });
    Sentry.captureException(reportableError);
  });
}

/**
 * Report a query whose failure would otherwise be invisible (MYK9-231).
 *
 * React Query catches a throwing `queryFn` into `isError`. That is the whole
 * story: no console error, no failed request, nothing in any server log. The
 * #1727 reconciliation outage was a detached-method `TypeError` that threw
 * synchronously in the browser, so Postgres, edge and RPC-grant logs were all
 * clean AND structurally incapable of seeing it — the only way to find it was
 * to read the live React Query cache in a browser session.
 *
 * Opt in per query with `meta: { reportToSentry: true }` rather than reporting
 * every query: most failures here are ordinary offline blips on an
 * offline-first app, and reporting those would bury the ones that matter.
 * Reserve it for surfaces where a silent failure is expensive — money views
 * first.
 *
 * Called from the global `QueryCache.onError`, which fires once a query
 * settles into the error state, so retries do not multiply the report.
 */
export function captureMonitoredQueryFailure(error: unknown, queryKey: readonly unknown[]): void {
  const reportableError = error instanceof Error ? error : new Error('Query failed');

  Sentry.withScope(scope => {
    // The key is the only identifying context, and it is scrubbed by
    // scrubSentryEvent like every other payload — ids pass, PII does not.
    scope.setTag('query_root', typeof queryKey[0] === 'string' ? queryKey[0] : 'unknown');
    scope.setContext('query', { queryKey });
    Sentry.captureException(reportableError);
  });
}

export function isAuthEmailOperationalFailure(error: unknown): boolean {
  if (!isRecord(error)) return false;

  const status = typeof error.status === 'number' ? error.status : undefined;
  const code = typeof error.code === 'string' ? error.code : undefined;

  return (
    status === 429 ||
    (status !== undefined && status >= 500) ||
    (code !== undefined && AUTH_EMAIL_OPERATIONAL_CODES.has(code))
  );
}

initializeSentry();
