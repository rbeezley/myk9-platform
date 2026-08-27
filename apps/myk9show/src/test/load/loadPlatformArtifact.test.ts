import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertPlatformArtifactMatchesRun,
  loadPlatformRunFromEnv,
  readUsablePlatformArtifact,
  type LoadPlatformArtifact,
} from './loadPlatformArtifact';

const RUN = { runId: '12345-1', startAtMs: 1_785_283_200_000 };

function artifact(): LoadPlatformArtifact {
  return {
    schemaVersion: 1,
    ...RUN,
    platform: {
      peakCpuPercent: 60,
      peakIoPercent: 20,
      peakConnections: 40,
      connectionCap: 60,
      statementDeltas: [],
    },
  };
}

describe('platform run identity', () => {
  it('reads the run the shards were pinned to', () => {
    expect(
      loadPlatformRunFromEnv({
        LOAD_TEST_RUN_ID: '12345-1',
        LOAD_TEST_START_AT: '1785283200000',
      })
    ).toEqual(RUN);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too long', 'x'.repeat(101)],
    ['illegal characters', 'run id/../etc'],
  ])('rejects a %s run id', (_name, LOAD_TEST_RUN_ID) => {
    expect(() =>
      loadPlatformRunFromEnv({
        ...(LOAD_TEST_RUN_ID === undefined ? {} : { LOAD_TEST_RUN_ID }),
        LOAD_TEST_START_AT: '1785283200000',
      })
    ).toThrow('run ID is missing or invalid');
  });

  it.each([
    ['missing', undefined],
    ['zero', '0'],
    ['negative', '-1'],
    ['fractional', '1.5'],
    ['not a number', 'soon'],
  ])('rejects a %s start timestamp', (_name, LOAD_TEST_START_AT) => {
    expect(() =>
      loadPlatformRunFromEnv({
        LOAD_TEST_RUN_ID: '12345-1',
        ...(LOAD_TEST_START_AT === undefined ? {} : { LOAD_TEST_START_AT }),
      })
    ).toThrow('valid Unix timestamp');
  });
});

describe('unusable telemetry degrades instead of throwing', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'load-platform-'));

  function write(name: string, contents: string): string {
    const path = resolve(dir, name);
    writeFileSync(path, contents, 'utf8');
    return path;
  }

  it.each([
    ['absent', resolve(dir, 'does-not-exist.json')],
    ['truncated', write('truncated.json', '{"schemaVersion":1,"runId":"12345-1","startAt')],
    ['not JSON at all', write('garbage.json', 'Unable to find an artifact')],
    [
      'from an earlier rehearsal',
      write('stale.json', JSON.stringify({ ...artifact(), runId: 'previous-run' })),
    ],
    [
      'from a different start',
      write('skewed.json', JSON.stringify({ ...artifact(), startAtMs: RUN.startAtMs + 1 })),
    ],
  ])('returns undefined for telemetry that is %s', (_name, path) => {
    const reasons: string[] = [];
    expect(readUsablePlatformArtifact(path, RUN, reason => reasons.push(reason))).toBeUndefined();
    // Silent degradation would hide why a rehearsal reported missing telemetry.
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).not.toHaveLength(0);
  });

  it.each([
    ['statementDeltas omitted', { statementDeltas: undefined }],
    ['statementDeltas not an array', { statementDeltas: 3 }],
    ['a peak that is not numeric', { peakConnections: '40' }],
    ['connectionCap omitted', { connectionCap: undefined }],
    ['resourceSampling missing its failures', { resourceSampling: { attempts: 2, succeeded: 1 } }],
    ['no platform payload at all', undefined],
  ])('returns undefined when the payload has %s', (_name, platformOverride) => {
    const path = write(
      `payload-${_name.replace(/\W+/g, '-')}.json`,
      JSON.stringify({
        ...artifact(),
        platform:
          platformOverride === undefined
            ? undefined
            : { ...artifact().platform, ...platformOverride },
      })
    );
    const reasons: string[] = [];
    expect(readUsablePlatformArtifact(path, RUN, r => reasons.push(r))).toBeUndefined();
    expect(reasons).toHaveLength(1);
  });

  it('accepts fail-closed NaN peaks as the sampler actually serializes them', () => {
    // Round-trip a genuine NaN rather than standing in a placeholder: JSON has
    // no NaN literal, so `JSON.stringify` writes `null`, and an earlier version
    // of this test used 0 and therefore never exercised the case it described.
    // That gap discarded a complete artifact in run 33038456110.
    const serialized = JSON.stringify({
      ...artifact(),
      platform: {
        ...artifact().platform,
        peakCpuPercent: Number.NaN,
        peakIoPercent: Number.NaN,
        peakConnections: Number.NaN,
      },
    });
    expect(serialized).toContain('"peakCpuPercent":null');

    const parsed = readUsablePlatformArtifact(write('nan-peaks.json', serialized), RUN);
    expect(parsed).toBeDefined();
    // The rest of the payload must survive: statement deltas and the verified
    // cap are usable evidence even when a peak failed closed.
    expect(parsed?.platform.connectionCap).toBe(60);
    expect(parsed?.platform.statementDeltas).toBeDefined();
  });

  it('returns the artifact when it belongs to this rehearsal', () => {
    const path = write('good.json', JSON.stringify(artifact()));
    const reasons: string[] = [];
    expect(readUsablePlatformArtifact(path, RUN, reason => reasons.push(reason))).toEqual(
      artifact()
    );
    expect(reasons).toHaveLength(0);
  });
});

describe('platform artifact pairing', () => {
  it('accepts telemetry from this rehearsal', () => {
    expect(() => assertPlatformArtifactMatchesRun(artifact(), RUN)).not.toThrow();
  });

  it.each([
    ['a different run', { runId: 'other' }],
    ['a different start', { startAtMs: RUN.startAtMs + 1 }],
  ])('rejects telemetry from %s', (_name, override) => {
    // A leftover artifact from an earlier rehearsal is likelier than a corrupt
    // one, and counting it would report the wrong run's capacity.
    expect(() => assertPlatformArtifactMatchesRun({ ...artifact(), ...override }, RUN)).toThrow(
      'does not belong to this rehearsal'
    );
  });

  it('rejects an unsupported schema', () => {
    expect(() =>
      assertPlatformArtifactMatchesRun({ ...artifact(), schemaVersion: 2 as unknown as 1 }, RUN)
    ).toThrow('schema is not supported');
  });
});
