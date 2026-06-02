import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAtShowCollapsedTrialsStorageKey,
  loadCollapsedTrialIds,
  saveCollapsedTrialIds,
} from './atShowClassListState';

describe('atShowClassListState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('scopes the storage key per show', () => {
    expect(getAtShowCollapsedTrialsStorageKey('show-1')).toBe('at-show-collapsed-trials:show-1');
    expect(getAtShowCollapsedTrialsStorageKey('show-2')).toBe('at-show-collapsed-trials:show-2');
  });

  it('returns an empty list when nothing is persisted (default all-open)', () => {
    expect(loadCollapsedTrialIds('show-1')).toEqual([]);
  });

  it('round-trips saved collapsed trial ids', () => {
    saveCollapsedTrialIds('show-1', ['trial-a', 'trial-b']);
    expect(loadCollapsedTrialIds('show-1')).toEqual(['trial-a', 'trial-b']);
  });

  it('isolates collapsed state between shows', () => {
    saveCollapsedTrialIds('show-1', ['trial-a']);
    expect(loadCollapsedTrialIds('show-2')).toEqual([]);
  });

  it('ignores malformed persisted JSON', () => {
    window.localStorage.setItem(getAtShowCollapsedTrialsStorageKey('show-1'), 'not json');
    expect(loadCollapsedTrialIds('show-1')).toEqual([]);
  });

  it('ignores a persisted non-array payload', () => {
    window.localStorage.setItem(
      getAtShowCollapsedTrialsStorageKey('show-1'),
      JSON.stringify({ trial: 'a' })
    );
    expect(loadCollapsedTrialIds('show-1')).toEqual([]);
  });

  it('drops non-string entries from a persisted array', () => {
    window.localStorage.setItem(
      getAtShowCollapsedTrialsStorageKey('show-1'),
      JSON.stringify(['trial-a', 42, null, 'trial-b'])
    );
    expect(loadCollapsedTrialIds('show-1')).toEqual(['trial-a', 'trial-b']);
  });
});
