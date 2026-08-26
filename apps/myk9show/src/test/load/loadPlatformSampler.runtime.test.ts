import { afterEach, describe, expect, it, vi } from 'vitest';
import { startLoadPlatformSampler } from './loadPlatformSampler';

const psql = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => {
  const execFile = Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: psql });
  return { execFile, default: { execFile } };
});

function counters(value: number) {
  return new Response(
    [
      `node_cpu_seconds_total{cpu="0",mode="idle"} ${value}`,
      `node_cpu_seconds_total{cpu="0",mode="user"} ${value}`,
      `node_disk_io_time_seconds_total{device="disk0"} ${value}`,
    ].join('\n')
  );
}

describe('runtime platform evidence', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps telemetry fail-closed while recording why a runtime sample was lost', async () => {
    vi.useFakeTimers();
    psql.mockImplementation(async (_command, args: string[]) => ({
      stdout: args.at(-1)?.includes('pg_stat_statements') ? '1|2|2|20' : '10',
    }));
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(counters(100))
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(counters(110))
    );
    const sampler = await startLoadPlatformSampler(
      {
        SUPABASE_DB_URL: 'postgresql://postgres:test@localhost/postgres',
        LOAD_TEST_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
        SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      },
      60
    );
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await sampler.stop();

    expect(result).toMatchObject({
      resourceSampling: {
        attempts: 3,
        succeeded: 2,
        failures: [{ kind: 'http', status: 503, count: 1 }],
      },
    });
    expect(Number.isNaN(result.peakCpuPercent)).toBe(true);
    expect(Number.isNaN(result.peakIoPercent)).toBe(true);
  });

  it.each(['timeout', 'transport', 'invalid-counters'] as const)(
    'classifies %s without leaking raw errors or response bodies',
    async kind => {
      vi.useFakeTimers();
      psql.mockImplementation(async (_command, args: string[]) => ({
        stdout: args.at(-1)?.includes('pg_stat_statements') ? '1|2|2|20' : '10',
      }));
      const request = vi.fn().mockResolvedValueOnce(counters(100));
      if (kind === 'invalid-counters') request.mockResolvedValueOnce(new Response('secret-body'));
      else
        request.mockRejectedValueOnce(
          Object.assign(new Error('secret-body'), {
            name: kind === 'timeout' ? 'TimeoutError' : 'TypeError',
          })
        );
      vi.stubGlobal('fetch', request);
      const sampler = await startLoadPlatformSampler(
        {
          SUPABASE_DB_URL: 'postgresql://postgres:test@localhost/postgres',
          LOAD_TEST_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
          SUPABASE_SERVICE_ROLE_KEY: 'test-key',
        },
        60
      );
      const result = await sampler.stop();
      expect(result.resourceSampling).toEqual({
        attempts: 2,
        succeeded: 1,
        failures: [{ kind, count: 1 }],
      });
      expect(JSON.stringify(result)).not.toContain('secret-body');
    }
  );
});
