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

const testEnv: NodeJS.ProcessEnv = {
  SUPABASE_DB_URL: 'postgresql://postgres:test@localhost/postgres',
  LOAD_TEST_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
};

function mockImmediateSamples() {
  psql.mockImplementation(async (_command, args: string[]) => ({
    stdout: args.at(-1)?.includes('pg_stat_statements') ? '1|2|2|20' : '10',
  }));
  const request = vi.fn(async () => counters(100));
  vi.stubGlobal('fetch', request);
  return request;
}

describe('runtime platform evidence', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('bounds database query and child-process lifetimes, not only connection setup', async () => {
    mockImmediateSamples();
    const sampler = await startLoadPlatformSampler(testEnv, 60);
    await sampler.stop();

    expect(psql).toHaveBeenCalledWith(
      'psql',
      expect.arrayContaining(['--quiet', '--command', 'SET statement_timeout = 10000']),
      expect.objectContaining({
        timeout: 15_000,
        killSignal: 'SIGKILL',
      })
    );
  });

  it('does not accumulate connection probes while an earlier one is pending', async () => {
    vi.useFakeTimers();
    mockImmediateSamples();
    let release: (value: { stdout: string }) => void = () => {};
    const slow = new Promise<{ stdout: string }>(resolve => {
      release = resolve;
    });
    let connectionCalls = 0;
    psql.mockImplementation((_command, args: string[]) => {
      if (args.at(-1)?.includes('pg_stat_statements')) {
        return Promise.resolve({ stdout: '1|2|2|20' });
      }
      connectionCalls += 1;
      return connectionCalls === 1 ? slow : Promise.resolve({ stdout: '10' });
    });
    const sampler = await startLoadPlatformSampler(testEnv, 60);
    await vi.advanceTimersByTimeAsync(6_000);
    const callsWhilePending = connectionCalls;
    release({ stdout: '10' });
    const result = await sampler.stop();

    expect(callsWhilePending).toBe(1);
    // Skipped scheduled observations must not look like complete peak evidence.
    expect(Number.isNaN(result.peakConnections)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares concurrent shutdown and takes final observations exactly once', async () => {
    vi.useFakeTimers();
    const request = mockImmediateSamples();
    const sampler = await startLoadPlatformSampler(testEnv, 60);
    const [first, second] = await Promise.all([sampler.stop(), sampler.stop()]);

    expect(first).toBe(second);
    expect(await sampler.stop()).toBe(first);
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      psql.mock.calls.filter(([, args]) => args.at(-1).includes('pg_stat_statements'))
    ).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['', '   ', '-1', '1.5', 'NaN', '1\n2'])(
    'rejects invalid connection evidence %j instead of reporting a peak',
    async output => {
      mockImmediateSamples();
      psql.mockImplementation(async (_command, args: string[]) => ({
        stdout: args.at(-1)?.includes('pg_stat_statements') ? '1|2|2|20' : output,
      }));
      const sampler = await startLoadPlatformSampler(testEnv, 60);

      expect(Number.isNaN((await sampler.stop()).peakConnections)).toBe(true);
    }
  );

  it.each(['database', 'resource'])(
    'does not start periodic work or expose raw errors when %s startup fails',
    async source => {
      vi.useFakeTimers();
      const request = mockImmediateSamples();
      if (source === 'database') psql.mockRejectedValueOnce(new Error('secret-body'));
      // The initial resource sample is retried like every other one, so a
      // startup failure has to fail both attempts to abort the sampler.
      else request.mockRejectedValue(new Error('secret-body'));

      await expect(startLoadPlatformSampler(testEnv, 60)).rejects.toThrow(
        source === 'database'
          ? 'Platform database telemetry query failed.'
          : 'Platform resource sample failed: transport'
      );
      await vi.advanceTimersByTimeAsync(60_000);
      expect(psql).toHaveBeenCalledTimes(1);
      // Resource startup: one attempt plus its retry. Database startup fails
      // before the resource read is awaited, so only the initial call happens.
      expect(request).toHaveBeenCalledTimes(source === 'resource' ? 2 : 1);
      // The point of the test: no periodic work was scheduled either way.
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['initial connection', 'final connection', 'final statement'])(
    'preserves missing evidence after a failed %s query',
    async phase => {
      vi.useFakeTimers();
      mockImmediateSamples();
      let connections = 0;
      let snapshots = 0;
      psql.mockImplementation(async (_command, args: string[]) => {
        const statement = args.at(-1)?.includes('pg_stat_statements');
        if (statement) snapshots += 1;
        else connections += 1;
        if (
          (phase === 'initial connection' && !statement && connections === 1) ||
          (phase === 'final connection' && !statement && connections === 2) ||
          (phase === 'final statement' && statement && snapshots === 2)
        ) {
          throw new Error('secret-body');
        }
        return { stdout: statement ? `1|${snapshots}|2|20` : '10' };
      });
      const sampler = await startLoadPlatformSampler(testEnv, 60);
      const result = await sampler.stop();

      if (phase === 'final statement') expect(result.statementDeltas).toEqual([]);
      else expect(Number.isNaN(result.peakConnections)).toBe(true);
      expect(JSON.stringify(result)).not.toContain('secret-body');
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('drains an in-flight command timeout once without scheduling more probes', async () => {
    vi.useFakeTimers();
    mockImmediateSamples();
    let connections = 0;
    psql.mockImplementation((_command, args: string[]) => {
      if (args.at(-1)?.includes('pg_stat_statements')) {
        return Promise.resolve({ stdout: '1|2|2|20' });
      }
      connections += 1;
      return connections === 1
        ? new Promise((_, reject) => setTimeout(() => reject(new Error('secret-body')), 15_000))
        : Promise.resolve({ stdout: '10' });
    });
    const sampler = await startLoadPlatformSampler(testEnv, 60);
    const stopping = sampler.stop();
    expect(sampler.stop()).toBe(stopping);
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await stopping;

    expect(Number.isNaN(result.peakConnections)).toBe(true);
    expect(connections).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps existing database options and credentials out of command arguments', async () => {
    mockImmediateSamples();
    const sampler = await startLoadPlatformSampler(
      { ...testEnv, PGOPTIONS: '-c application_name=g9-telemetry' },
      60
    );
    await sampler.stop();

    for (const [, args, options] of psql.mock.calls) {
      expect(args.join(' ')).not.toContain('postgresql://');
      expect(args.join(' ')).not.toContain('test');
      expect(options).toMatchObject({
        timeout: 15_000,
        killSignal: 'SIGKILL',
        env: {
          PGPASSWORD: 'test',
          PGOPTIONS: '-c application_name=g9-telemetry',
        },
      });
      expect(args.slice(-5)).toEqual([
        '--quiet',
        '--command',
        'SET statement_timeout = 10000',
        '--command',
        expect.stringContaining('SELECT'),
      ]);
    }
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
      if (kind === 'invalid-counters') {
        // Not transient, so it is never retried: one rejection is the failure.
        request.mockResolvedValueOnce(new Response('secret-body'));
      } else {
        // Transient kinds get one retry, so a recorded failure needs BOTH
        // attempts to fail — otherwise the retry would silently rescue it.
        const transient = () =>
          Object.assign(new Error('secret-body'), {
            name: kind === 'timeout' ? 'TimeoutError' : 'TypeError',
          });
        request.mockRejectedValueOnce(transient()).mockRejectedValueOnce(transient());
      }
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
        // Doubles as a classification pin: transient kinds are retried once,
        // and a malformed response — which would fail identically on a second
        // attempt — is not.
        retried: kind === 'invalid-counters' ? 0 : 1,
        failures: [{ kind, count: 1 }],
      });
      expect(JSON.stringify(result)).not.toContain('secret-body');
    }
  );

  it('retries a transient sample so one blip does not cost the peak', async () => {
    // Run 33038456110 lost 3 of 14 samples to Metrics API timeouts, and with
    // them the entire CPU/IO/connection picture. A dropped sample also widens
    // the next sampling window, averaging away the spike a peak exists to catch.
    psql.mockImplementation(async (_command, args: string[]) => ({
      stdout: args.at(-1)?.includes('pg_stat_statements') ? '1|2|2|20' : '10',
    }));
    vi.useFakeTimers();
    let call = 0;
    // A fresh Response per call: a body can only be read once.
    const request = vi.fn(async () => {
      call += 1;
      if (call === 2) throw Object.assign(new Error('blip'), { name: 'TimeoutError' });
      return counters(100 + call * 20);
    });
    vi.stubGlobal('fetch', request);

    const sampler = await startLoadPlatformSampler(testEnv, 60);
    // Real elapsed time, or resourceUtilization returns NaN for a zero-length
    // window whether or not sampling succeeded.
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await sampler.stop();

    // The blip was retried away rather than recorded. Note the window it covers
    // is wider than nominal -- the retry costs time -- so this asserts no
    // recorded failure, not an unaffected sampling window.
    const sampling = result.resourceSampling;
    expect(sampling).toBeDefined();
    expect(sampling?.failures).toEqual([]);
    expect(sampling?.succeeded).toBe(sampling?.attempts);
    // And the peak survives as a real number instead of fail-closed NaN.
    expect(Number.isNaN(result.peakCpuPercent)).toBe(false);
  });

  it('fails closed on ONE lost resource sample even at high coverage', async () => {
    // The distinguishing case. An 80% coverage bar would accept this; zero
    // tolerance does not. Recorded because a percentage bar was tried here and
    // reverted: for connections the misses cluster on the pool breach they
    // would hide, and the gate only fails when connections EXCEED the cap.
    vi.useFakeTimers();
    psql.mockImplementation(async (_command, args: string[]) => ({
      stdout: args.at(-1)?.includes('pg_stat_statements') ? '1|2|2|20' : '10',
    }));
    let call = 0;
    const request = vi.fn(async () => {
      call += 1;
      // Fail one sample on both attempts so the retry cannot rescue it, then
      // succeed for the rest of a long run.
      if (call === 2 || call === 3) {
        throw Object.assign(new Error('down'), { name: 'TimeoutError' });
      }
      return counters(100 + call * 10);
    });
    vi.stubGlobal('fetch', request);

    const sampler = await startLoadPlatformSampler(testEnv, 60);
    for (let minute = 0; minute < 9; minute += 1) {
      await vi.advanceTimersByTimeAsync(60_000);
    }
    const result = await sampler.stop();

    const sampling = result.resourceSampling;
    // Coverage is comfortably above any 80% bar...
    expect((sampling?.succeeded ?? 0) / (sampling?.attempts ?? 1)).toBeGreaterThan(0.8);
    // ...and the peak is still withheld, because one window went unobserved.
    expect(Number.isNaN(result.peakCpuPercent)).toBe(true);
  });

  it('fails closed on ONE lost connection probe even at high coverage', async () => {
    vi.useFakeTimers();
    let connectionCalls = 0;
    psql.mockImplementation(async (_command, args: string[]) => {
      if (args.at(-1)?.includes('pg_stat_statements')) return { stdout: '1|2|2|20' };
      connectionCalls += 1;
      if (connectionCalls === 3) throw new Error('pool busy');
      return { stdout: '10' };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => counters(100))
    );

    const sampler = await startLoadPlatformSampler(testEnv, 60);
    await vi.advanceTimersByTimeAsync(40_000);
    const result = await sampler.stop();

    const sampling = result.connectionSampling;
    expect((sampling?.succeeded ?? 0) / (sampling?.attempts ?? 1)).toBeGreaterThan(0.8);
    expect(Number.isNaN(result.peakConnections)).toBe(true);
  });

  it('withholds the peak when sampling is broadly failing', async () => {
    psql.mockImplementation(async (_command, args: string[]) => ({
      stdout: args.at(-1)?.includes('pg_stat_statements') ? '1|2|2|20' : '10',
    }));
    const dead = () => Object.assign(new Error('down'), { name: 'TimeoutError' });
    const request = vi.fn().mockResolvedValueOnce(counters(100)).mockRejectedValue(dead());
    vi.stubGlobal('fetch', request);

    const sampler = await startLoadPlatformSampler(testEnv, 60);
    const result = await sampler.stop();

    // Broad failure, not a single blip.
    expect(result.resourceSampling?.succeeded).toBe(1);
    expect(Number.isNaN(result.peakCpuPercent)).toBe(true);
  });
});
