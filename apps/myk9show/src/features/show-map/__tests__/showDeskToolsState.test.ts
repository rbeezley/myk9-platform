import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDefaultOpenToolIds,
  getShowDeskToolsStorageKey,
  loadOpenToolIds,
  saveOpenToolIds,
} from '../showDeskToolsState';

const tools = [
  { id: 'late-entry', defaultOpen: true },
  { id: 'access-codes', attentionLabel: 'Needs review' },
  { id: 'broadcast' },
  { id: 'tasks' },
];

describe('showDeskToolsState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds first-visit defaults from defaultOpen and attention tools', () => {
    expect(buildDefaultOpenToolIds(tools)).toEqual(['late-entry', 'access-codes']);
  });

  it('uses the show id in the storage key', () => {
    expect(getShowDeskToolsStorageKey('show-123')).toBe('show-desk-tools:show-123');
  });

  it('loads saved section state for a show', () => {
    window.localStorage.setItem(
      getShowDeskToolsStorageKey('show-123'),
      JSON.stringify(['broadcast', 'tasks'])
    );

    expect(loadOpenToolIds('show-123', tools)).toEqual(['broadcast', 'tasks']);
  });

  it('falls back to defaults when storage is corrupted', () => {
    window.localStorage.setItem(getShowDeskToolsStorageKey('show-123'), 'not json');

    expect(loadOpenToolIds('show-123', tools)).toEqual(['late-entry', 'access-codes']);
  });

  it('falls back to defaults when storage reads fail', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(loadOpenToolIds('show-123', tools)).toEqual(['late-entry', 'access-codes']);
  });

  it('drops saved ids that are not in the current tool list', () => {
    window.localStorage.setItem(
      getShowDeskToolsStorageKey('show-123'),
      JSON.stringify(['broadcast', 'missing-tool'])
    );

    expect(loadOpenToolIds('show-123', tools)).toEqual(['broadcast']);
  });

  it('drops the removed Message Show tool id from saved state', () => {
    window.localStorage.setItem(
      getShowDeskToolsStorageKey('show-123'),
      JSON.stringify(['message-show', 'tasks'])
    );

    expect(loadOpenToolIds('show-123', tools)).toEqual(['tasks']);
  });

  it('saves open section ids without throwing', () => {
    saveOpenToolIds('show-123', ['access-codes']);

    expect(window.localStorage.getItem(getShowDeskToolsStorageKey('show-123'))).toBe(
      JSON.stringify(['access-codes'])
    );
  });

  it('does not throw when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => saveOpenToolIds('show-123', ['access-codes'])).not.toThrow();
  });
});
