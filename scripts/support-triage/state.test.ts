import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clusterKey, readState, writeState } from './state';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'triage-state-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('triage state', () => {
  it('returns empty state when the file does not exist', async () => {
    await expect(readState(join(dir, 'missing.json'))).resolves.toEqual({
      draftedMessageIds: [],
      alertedClusterKeys: [],
    });
  });

  it('returns empty state when the file is corrupt', async () => {
    const path = join(dir, 'corrupt.json');
    await writeFile(path, 'not json', 'utf8');
    await expect(readState(path)).resolves.toEqual({
      draftedMessageIds: [],
      alertedClusterKeys: [],
    });
  });

  it('returns empty state when the file holds the wrong shape', async () => {
    const path = join(dir, 'wrong-shape.json');
    await writeFile(path, JSON.stringify({ draftedMessageIds: 'nope' }), 'utf8');
    await expect(readState(path)).resolves.toEqual({
      draftedMessageIds: [],
      alertedClusterKeys: [],
    });
  });

  it('round-trips state', async () => {
    const path = join(dir, 'state.json');
    await writeState(path, { draftedMessageIds: ['m1'], alertedClusterKeys: ['show-1|x'] });
    await expect(readState(path)).resolves.toEqual({
      draftedMessageIds: ['m1'],
      alertedClusterKeys: ['show-1|x'],
    });
  });

  it('creates the parent directory when it does not exist', async () => {
    const path = join(dir, 'nested', 'deeper', 'state.json');
    await writeState(path, { draftedMessageIds: ['m1'], alertedClusterKeys: [] });
    await expect(readState(path)).resolves.toEqual({
      draftedMessageIds: ['m1'],
      alertedClusterKeys: [],
    });
  });

  it('bounds the file so it cannot grow without limit', async () => {
    const path = join(dir, 'big.json');
    const ids = Array.from({ length: 2500 }, (_, index) => `m${index}`);
    await writeState(path, { draftedMessageIds: ids, alertedClusterKeys: [] });
    const state = await readState(path);
    expect(state.draftedMessageIds).toHaveLength(2000);
    // Keeps the newest entries — old ids can never match a live open ticket again.
    expect(state.draftedMessageIds.at(-1)).toBe('m2499');
  });

  it('writes valid JSON a human can read', async () => {
    const path = join(dir, 'readable.json');
    await writeState(path, { draftedMessageIds: ['m1'], alertedClusterKeys: [] });
    const raw = await readFile(path, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('builds a stable cluster key', () => {
    expect(clusterKey('show-1', '2026-08-01T12:00:00.000Z')).toBe(
      'show-1|2026-08-01T12:00:00.000Z'
    );
  });

  it('builds a cluster key when the show is null', () => {
    expect(clusterKey(null, '2026-08-01T12:00:00.000Z')).toBe('none|2026-08-01T12:00:00.000Z');
  });
});
