import { describe, expect, it } from 'vitest';
import type { ErrorEvent as SentryErrorEvent } from '@sentry/react';

import { buildSentryInitOptions, scrubSentryEvent } from './sentry';

describe('Sentry observability helpers', () => {
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
});
