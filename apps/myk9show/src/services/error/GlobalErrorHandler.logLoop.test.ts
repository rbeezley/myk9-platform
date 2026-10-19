// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// MYK9-1251: the fetch wrapper reported every failed request to the logging service,
// including the logging service's own POST to its remote endpoint. Each failed POST
// reported itself again, an unbounded loop that froze the page whenever the endpoint
// was unreachable (offline, blocked by an extension, a harness that blocks external HTTP).
const LOG_ENDPOINT = 'https://logs.example.test/functions/v1/receive-logs';
const { loggingError } = vi.hoisted(() => ({ loggingError: vi.fn() }));

vi.mock('@/services/LoggingService', () => ({
  LoggingService: {
    getInstance: () => ({ info: vi.fn(), warn: vi.fn(), error: loggingError, flush: vi.fn() }),
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  isLogEndpointUrl: (url: string) => url === LOG_ENDPOINT,
}));
vi.mock('@/services/MonitoringService', () => ({
  MonitoringService: { getInstance: () => ({ recordError: vi.fn() }) },
}));

describe('GlobalErrorHandler network wrapper', () => {
  const realFetch = window.fetch;

  beforeEach(() => {
    loggingError.mockClear();
    window.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  });

  afterEach(() => {
    window.fetch = realFetch;
  });

  it('reports a failed request to another URL, but not a failed request to the log endpoint', async () => {
    const { GlobalErrorHandler } = await import('./GlobalErrorHandler');
    GlobalErrorHandler.getInstance().initialize();
    loggingError.mockClear();

    await expect(window.fetch('https://api.example.test/data')).rejects.toThrow();
    expect(loggingError).toHaveBeenCalledTimes(1);
    expect(loggingError).toHaveBeenCalledWith(
      expect.stringContaining('Network request failed'),
      'error-handler',
      expect.objectContaining({ requestUrl: 'https://api.example.test/data' })
    );

    loggingError.mockClear();
    await expect(window.fetch(LOG_ENDPOINT, { method: 'POST' })).rejects.toThrow();
    expect(loggingError).not.toHaveBeenCalled();
  });
});
