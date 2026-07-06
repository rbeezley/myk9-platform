import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent as SentryErrorEvent } from '@sentry/react';

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
  setContext: vi.fn(),
  setTag: vi.fn(),
  withScope: vi.fn(),
}));

vi.mock('@sentry/react', () => ({
  captureException: sentryMocks.captureException,
  init: sentryMocks.init,
  withScope: sentryMocks.withScope,
}));

import {
  buildSentryInitOptions,
  captureErrorBoundaryException,
  initializeSentry,
  scrubSentryEvent,
} from './sentry';

describe('Sentry observability helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sentryMocks.withScope.mockImplementation(callback =>
      callback({
        setContext: sentryMocks.setContext,
        setTag: sentryMocks.setTag,
      })
    );
  });

  it('scrubs user, request, breadcrumb, and domain-specific PII before sending', () => {
    const event: SentryErrorEvent = {
      message: 'Handler Jane Example hit dog AKC DN123456 with jane@example.com at 555-867-5309',
      user: {
        id: 'user-1',
        email: 'jane@example.com',
        username: 'Jane Example',
        ip_address: '127.0.0.1',
      },
      request: {
        url: 'https://myk9show.com/shows/show-1/register?dog=AKC-DN123456#checkout',
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=secret',
          'x-safe-header': 'safe',
        },
      },
      extra: {
        handlerName: 'Jane Example',
        dogRegistrationNumber: 'AKC-DN123456',
        safeCount: 2,
      },
      breadcrumbs: [
        {
          category: 'entry',
          message: 'Selected dog AKC DN123456',
          data: {
            dogName: 'Sunny',
            route: '/shows/show-1/register',
          },
        },
      ],
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.message).toBe(
      'Handler [Filtered] hit dog [Filtered] with [Filtered] at [Filtered]'
    );
    expect(scrubbed.user).toEqual({ id: 'user-1' });
    expect(scrubbed.request?.url).toBe('https://myk9show.com/shows/show-1/register');
    expect(scrubbed.request?.headers).toEqual({
      authorization: '[Filtered]',
      cookie: '[Filtered]',
      'x-safe-header': 'safe',
    });
    expect(scrubbed.extra).toEqual({
      handlerName: '[Filtered]',
      dogRegistrationNumber: '[Filtered]',
      safeCount: 2,
    });
    expect(scrubbed.breadcrumbs?.[0]?.message).toBe('Selected dog [Filtered]');
    expect(scrubbed.breadcrumbs?.[0]?.data).toEqual({
      dogName: '[Filtered]',
      route: '/shows/show-1/register',
    });
  });

  it('scrubs secret-shaped strings even outside known sensitive keys', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature_123';
    const event: SentryErrorEvent = {
      message: `Auth refresh failed ${jwt} sk_live_abcdefgh12345678`,
      extra: {
        checkout: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3#fidSecret',
        callback: `https://app.example/auth#id_token=${jwt}&token=plain`,
        accessToken: 'safe-looking-but-sensitive',
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.message).toBe('Auth refresh failed [redacted-token] [redacted-secret]');
    expect(scrubbed.extra).toEqual({
      checkout: '[redacted-url]',
      callback: 'https://app.example/auth#id_token=[redacted]&token=[redacted]',
      accessToken: '[Filtered]',
    });
  });

  it('builds conservative runtime options from env config', () => {
    const options = buildSentryInitOptions({
      dsn: 'https://public@sentry.example/1',
      environment: 'staging',
      release: 'abc123',
      tracesSampleRate: '0.15',
    });

    expect(options).toMatchObject({
      dsn: 'https://public@sentry.example/1',
      environment: 'staging',
      release: 'abc123',
      sendDefaultPii: false,
      tracesSampleRate: 0.15,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
    expect(options.beforeSend).toBe(scrubSentryEvent);
  });

  it('stays dormant when no DSN is configured', () => {
    expect(initializeSentry()).toBe(false);
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });

  it('captures error boundary exceptions with boundary context', () => {
    const error = new Error('boom');

    captureErrorBoundaryException(
      error,
      { componentStack: 'Component stack' },
      { context: 'ringside surface', level: 'section', errorId: 'error-1' }
    );

    expect(sentryMocks.withScope).toHaveBeenCalledTimes(1);
    expect(sentryMocks.setContext).toHaveBeenCalledWith('react', {
      componentStack: 'Component stack',
      boundaryContext: 'ringside surface',
      boundaryLevel: 'section',
      errorId: 'error-1',
    });
    expect(sentryMocks.setTag).toHaveBeenCalledWith('boundary_context', 'ringside surface');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('boundary_level', 'section');
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });
});
