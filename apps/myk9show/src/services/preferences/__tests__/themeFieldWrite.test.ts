import { describe, it, expect } from 'vitest';
import {
  buildDefaults,
  newerFieldTimes,
  newerThemeFields,
} from '@/services/preferences/userPreferencesService';

const stored = { ...buildDefaults('u1'), themeChangedAt: { mode: 8000 } };

describe('per-field last write wins at the server write (MYK9-1545)', () => {
  it('drops a theme field older than the stored one, keeps a newer one', () => {
    const fields = newerThemeFields(
      { mode: 'dark', fontSize: 'large' },
      { mode: 5000, fontSize: 9000 },
      stored
    );
    expect(fields).toEqual({ fontSize: 'large' });
  });

  it('applies a field the server holds no time for', () => {
    expect(newerThemeFields({ colorScheme: 'grove' }, { colorScheme: 1 }, stored)).toEqual({
      colorScheme: 'grove',
    });
  });

  it('applies every field when the write carries no times (a reset)', () => {
    expect(newerThemeFields({ mode: 'light' }, undefined, stored)).toEqual({ mode: 'light' });
  });

  it('never moves a stored field time backwards', () => {
    expect(newerFieldTimes({ mode: 8000 }, { mode: 5000, fontSize: 9000 })).toEqual({
      mode: 8000,
      fontSize: 9000,
    });
  });
});
