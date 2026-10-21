import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { features } from '@/config/features';
import { notifyAccountBoundary } from '@/lib/accountBoundary';
import {
  ID_SCAN_INTERVAL_MS,
  idScanKey,
  idScanEpoch,
  markIdScanCompleted,
  resetIdScanCadence,
  shouldRunIdScan,
} from '../idScanCadence';

const incremental = { operation: 'incremental-sync' };
const T0 = 1_000_000_000_000;

beforeEach(() => {
  resetIdScanCadence();
});

afterEach(() => {
  (features as { replicationDogIdCadence: boolean }).replicationDogIdCadence = true;
});

describe('id scan cadence', () => {
  it('runs on the first pass after a cold start', () => {
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 })).toBe(true);
  });

  it('skips an intermediate pass right after a completed scan', () => {
    markIdScanCompleted('dogs', idScanEpoch(), T0);
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 + 60_000 })).toBe(false);
    expect(
      shouldRunIdScan('dogs', { result: incremental, now: T0 + ID_SCAN_INTERVAL_MS - 1 })
    ).toBe(false);
  });

  it('runs once the last completed scan is an hour old', () => {
    markIdScanCompleted('dogs', idScanEpoch(), T0);
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 + ID_SCAN_INTERVAL_MS })).toBe(
      true
    );
  });

  it('runs when the engine pass was a full sync (count mismatch or forced)', () => {
    markIdScanCompleted('dogs', idScanEpoch(), T0);
    expect(shouldRunIdScan('dogs', { result: { operation: 'full-sync' }, now: T0 + 1_000 })).toBe(
      true
    );
  });

  it('runs when the clock moved backwards', () => {
    markIdScanCompleted('dogs', idScanEpoch(), T0);
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 - 1 })).toBe(true);
  });

  it('runs on every pass when the flag is off', () => {
    markIdScanCompleted('dogs', idScanEpoch(), T0);
    (features as { replicationDogIdCadence: boolean }).replicationDogIdCadence = false;
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 + 1_000 })).toBe(true);
  });

  it('is only stamped by a completed scan, so an aborted one stays due', () => {
    // No markIdScanCompleted call: the scan returned early or was skipped.
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 })).toBe(true);
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 + 1_000 })).toBe(true);
  });

  it('keeps each table and scope independent', () => {
    markIdScanCompleted('dogs', idScanEpoch(), T0);
    expect(shouldRunIdScan('dog_registrations', { result: incremental, now: T0 + 1 })).toBe(true);
    expect(
      shouldRunIdScan(idScanKey('dogs', 'owner-1'), { result: incremental, now: T0 + 1 })
    ).toBe(true);
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 + 1 })).toBe(false);
  });

  it('forgets every stamp when the signed-in account changes', () => {
    markIdScanCompleted('dogs', idScanEpoch(), T0);
    markIdScanCompleted('dog_registrations', T0);
    notifyAccountBoundary();
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 + 1 })).toBe(true);
    expect(shouldRunIdScan('dog_registrations', { result: incremental, now: T0 + 1 })).toBe(true);
  });

  it('drops a stamp from a scan that began before a reset (account boundary mid-pass)', () => {
    const started = idScanEpoch();
    resetIdScanCadence();
    markIdScanCompleted('dogs', started, T0);
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 + 1_000 })).toBe(true);
    markIdScanCompleted('dogs', idScanEpoch(), T0);
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 + 1_000 })).toBe(false);
  });

  it('a due scan that does not complete keeps the debt: the next incremental pass scans again', () => {
    markIdScanCompleted('dogs', idScanEpoch(), T0);
    // Due because the engine pass was a full sync; the scan then fails (no completion).
    expect(shouldRunIdScan('dogs', { result: { operation: 'full-sync' }, now: T0 + 1_000 })).toBe(
      true
    );
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 + 2_000 })).toBe(true);
    markIdScanCompleted('dogs', idScanEpoch(), T0 + 2_000);
    expect(shouldRunIdScan('dogs', { result: incremental, now: T0 + 3_000 })).toBe(false);
  });
});
