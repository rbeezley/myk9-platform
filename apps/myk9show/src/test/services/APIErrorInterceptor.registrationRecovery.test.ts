import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APIErrorInterceptor } from '@/services/error/APIErrorInterceptor';

const loggingInfo = vi.fn();
const loggingError = vi.fn();
const recordPerformanceMetric = vi.fn();
const recordError = vi.fn();

vi.mock('@/services/LoggingService', () => ({
  LoggingService: {
    getInstance: () => ({
      info: loggingInfo,
      error: loggingError,
    }),
  },
}));

vi.mock('@/services/MonitoringService', () => ({
  MonitoringService: {
    getInstance: () => ({
      recordPerformanceMetric,
      recordError,
    }),
  },
}));

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Registration error handling and recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('retries transient registration server failures and eventually succeeds', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(500, { message: 'Temporary registration outage' }))
      .mockResolvedValueOnce(jsonResponse(503, { message: 'Registration service warming up' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'reg-123', status: 'submitted' }));

    const result = await new APIErrorInterceptor().interceptRequest<{
      id: string;
      status: string;
    }>({
      url: '/api/registrations',
      method: 'POST',
      body: { showId: 'show-123', dogId: 'dog-123' },
      retryConfig: { baseDelay: 0, maxDelay: 0 },
    });

    expect(result).toEqual({
      success: true,
      data: { id: 'reg-123', status: 'submitted' },
      retries: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)['X-Attempt'])).toEqual([
      '0',
      '1',
      '2',
    ]);
    expect(recordPerformanceMetric).toHaveBeenCalledWith(
      'api_request_duration',
      expect.any(Number),
      'api'
    );
  });

  it('does not retry duplicate registration conflicts and returns a user-safe message', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, {
        code: '23505',
        message: 'duplicate key value violates unique constraint "entries_dog_class_unique_idx"',
      })
    );

    const result = await new APIErrorInterceptor().interceptRequest({
      url: '/api/registrations',
      method: 'POST',
      body: { showId: 'show-123', dogId: 'dog-123', classId: 'class-123' },
      retryConfig: { baseDelay: 0, maxDelay: 0 },
    });

    expect(result.success).toBe(false);
    expect(result.retries).toBeUndefined();
    expect(result.error).toMatchObject({
      code: 'HTTP_409',
      statusCode: 409,
      retryable: false,
      userMessage: 'This action conflicts with the current state. Please refresh and try again.',
      severity: 'high',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recordError).toHaveBeenCalledWith(
      'duplicate key value violates unique constraint "entries_dog_class_unique_idx"',
      'api'
    );
  });

  it('classifies network failures as retryable registration errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const result = await new APIErrorInterceptor().interceptRequest({
      url: '/api/registrations',
      method: 'POST',
      body: { showId: 'show-123' },
      retryConfig: { maxRetries: 1, baseDelay: 0, maxDelay: 0 },
    });

    expect(result.success).toBe(false);
    expect(result.retries).toBe(1);
    expect(result.error).toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Network request failed',
      retryable: true,
      userMessage: 'Network connection failed. Please check your internet connection.',
      severity: 'medium',
    });
  });
});
