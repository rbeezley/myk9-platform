// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSentryCronClient } from './sentryCronClient';

describe('optional Sentry cron initialization', () => {
  function setup() {
    return { init: vi.fn(), captureCheckIn: vi.fn(() => 'id'), flush: vi.fn(async () => true) };
  }
  it('does not initialize without a DSN', () => {
    const sdk = setup();
    expect(createSentryCronClient(sdk, {})).toBeNull();
    expect(sdk.init).not.toHaveBeenCalled();
  });
  it('uses the existing privacy settings and forwards check-ins and flushes', async () => {
    const sdk = setup();
    const client = createSentryCronClient(sdk, { dsn: 'dsn', environment: 'staging' });
    expect(sdk.init).toHaveBeenCalledWith({
      dsn: 'dsn',
      environment: 'staging',
      defaultIntegrations: false,
      sendDefaultPii: false,
    });
    expect(client?.captureCheckIn({ monitorSlug: 'cron', status: 'in_progress' })).toBe('id');
    expect(sdk.captureCheckIn).toHaveBeenCalledWith({ monitorSlug: 'cron', status: 'in_progress' });
    expect(await client?.flush(2000)).toBe(true);
    expect(sdk.flush).toHaveBeenCalledWith(2000);
  });
  it('fails open if initialization throws', () => {
    const sdk = setup();
    sdk.init.mockImplementation(() => {
      throw new Error('SDK unavailable');
    });
    const logger = { warn: vi.fn() };
    expect(createSentryCronClient(sdk, { dsn: 'dsn' }, logger)).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});
