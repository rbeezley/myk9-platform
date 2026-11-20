import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entryOwnerName, OWNER_NAME_NOT_ON_DEVICE } from '../entryDisplayNames';
import { rememberOwnerNames, ownerNameCacheKey } from '@/services/database/dogs/ownerNameCache';

vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => 'user-1',
}));

function entry(owner: { id: string; first_name: string | null; last_name: string | null } | null) {
  return { handler: 'Sam Handler', dog: { name: 'Rex', call_name: null, owner } };
}

describe('entryOwnerName (MYK9-2256)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('shows the joined owner name when it is loaded', () => {
    const row = entry({ id: 'o1', first_name: 'Olive', last_name: 'Owner' });
    expect(entryOwnerName(row)).toBe('Olive Owner');
  });

  it('keeps the typed handler text for a mail-in entry with no owner record', () => {
    expect(entryOwnerName(entry(null))).toBe('Sam Handler');
    expect(entryOwnerName({ handler: 'Sam Handler', dog: null }, null)).toBe('Sam Handler');
  });

  it('never shows the handler text as an owner whose name is not on this device', () => {
    const row = entry({ id: 'o1', first_name: null, last_name: null });
    expect(entryOwnerName(row)).toBe(OWNER_NAME_NOT_ON_DEVICE);
    expect(entryOwnerName({ handler: 'Sam Handler', dog: null }, 'o1')).toBe(
      OWNER_NAME_NOT_ON_DEVICE
    );
  });

  it('uses the saved owner name from this device when the joined name is missing', () => {
    const key = ownerNameCacheKey();
    if (!key) throw new Error('expected a persisted auth user for the cache key');
    rememberOwnerNames([{ id: 'o1', first_name: 'Olive', last_name: 'Owner' }], key);
    expect(entryOwnerName(entry({ id: 'o1', first_name: null, last_name: null }))).toBe(
      'Olive Owner'
    );
  });
});
