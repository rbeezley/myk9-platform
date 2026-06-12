import { describe, expect, it } from 'vitest';
import {
  parseUpdatedAtMs,
  REPLICATION_INCREMENTAL_BUFFER_MS,
  REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN,
} from './parseUpdatedAt';

describe('parseUpdatedAtMs', () => {
  it('parses an ISO timestamp string to epoch ms', () => {
    expect(parseUpdatedAtMs('2026-06-09T14:26:04.040Z')).toBe(Date.parse('2026-06-09T14:26:04.040Z'));
  });

  it('passes a finite numeric epoch through unchanged', () => {
    expect(parseUpdatedAtMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('returns null for null / undefined (no usable timestamp)', () => {
    expect(parseUpdatedAtMs(null)).toBeNull();
    expect(parseUpdatedAtMs(undefined)).toBeNull();
  });

  it('returns null for an unparseable string rather than NaN', () => {
    // A NaN here would poison the watermark: new Date(NaN).toISOString() throws.
    expect(parseUpdatedAtMs('not a date')).toBeNull();
  });

  it('returns null for non-finite numbers and non-string/number types', () => {
    expect(parseUpdatedAtMs(NaN)).toBeNull();
    expect(parseUpdatedAtMs(Infinity)).toBeNull();
    expect(parseUpdatedAtMs({})).toBeNull();
    expect(parseUpdatedAtMs([])).toBeNull();
  });

  it('high-churn buffer is smaller than the default buffer', () => {
    expect(REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN).toBeLessThan(REPLICATION_INCREMENTAL_BUFFER_MS);
    expect(REPLICATION_INCREMENTAL_BUFFER_MS).toBe(60_000);
    expect(REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN).toBe(5_000);
  });
});
