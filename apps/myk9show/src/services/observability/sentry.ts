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

initializeSentry();
