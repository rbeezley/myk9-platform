import { describe, it, expect } from 'vitest';
import {
  ENTRY_MANAGEMENT_PRESETS,
  CLASS_MANAGEMENT_PRESETS,
  OPERATIONAL_VIEW_SERIALIZATION_VERSION,
  validateEntryManagementView,
  validateClassManagementView,
  validateOperationalView,
  isEntryManagementPresetId,
  isClassManagementPresetId,
  isClassManagementStatusFilter,
} from './operationalViews';

describe('curated preset validity per surface', () => {
  it('every entry-management preset validates against the entry surface', () => {
    for (const preset of Object.values(ENTRY_MANAGEMENT_PRESETS)) {
      const built = preset.build();
      const validated = validateEntryManagementView(built);
      expect(validated).not.toBeNull();
      expect(validated?.surface).toBe('entry-management');
    }
  });

  it('every class-management preset validates against the class surface', () => {
    for (const preset of Object.values(CLASS_MANAGEMENT_PRESETS)) {
      const built = preset.build();
      const validated = validateClassManagementView(built);
      expect(validated).not.toBeNull();
      expect(validated?.surface).toBe('class-management');
    }
  });

  it('recognizes preset ids per surface', () => {
    expect(isEntryManagementPresetId('needs-review')).toBe(true);
    expect(isEntryManagementPresetId('not-started')).toBe(false);
    expect(isClassManagementPresetId('not-started')).toBe(true);
    expect(isClassManagementPresetId('needs-review')).toBe(false);
  });
});

describe('rejection of unsupported values', () => {
  it('drops an unsupported entry attention value to the safe default', () => {
    const validated = validateEntryManagementView({
      surface: 'entry-management',
      version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
      filters: { attention: 'bogus', payment: 'all', mode: 'review', view: 'table' },
    });
    expect(validated?.filters.attention).toBe('all');
  });

  it('drops an unsupported class status value to the safe default', () => {
    const validated = validateClassManagementView({
      surface: 'class-management',
      version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
      filters: { status: 'exploded', search: '' },
    });
    expect(validated?.filters.status).toBe('all');
    expect(isClassManagementStatusFilter('exploded')).toBe(false);
  });

  it('drops unlisted display columns while keeping allowlisted ones', () => {
    const validated = validateEntryManagementView({
      surface: 'entry-management',
      version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
      filters: { attention: 'all', payment: 'all', mode: 'review', view: 'table' },
      display: { columns: ['payment', 'not-a-real-column'] },
    });
    expect(validated?.display?.columns).toEqual(['payment']);
  });

  it('returns null for a value with no recognizable surface', () => {
    expect(validateOperationalView({ surface: 'something-else' })).toBeNull();
    expect(validateOperationalView(null)).toBeNull();
    expect(validateOperationalView('not-an-object')).toBeNull();
  });

  it('does not modify entry/trial/dog filters when validating a class view', () => {
    const validated = validateClassManagementView({
      surface: 'class-management',
      version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
      filters: { status: 'in_progress', search: 'poodle' },
    });
    expect(validated?.filters).toEqual({ status: 'in_progress', search: 'poodle' });
    expect((validated as unknown as Record<string, unknown>).attention).toBeUndefined();
  });
});

describe('version mismatch handling', () => {
  it('rejects an entry-management view with a stale version', () => {
    const validated = validateEntryManagementView({
      surface: 'entry-management',
      version: OPERATIONAL_VIEW_SERIALIZATION_VERSION + 1,
      filters: { attention: 'pending', payment: 'all', mode: 'review', view: 'table' },
    });
    expect(validated).toBeNull();
  });

  it('rejects a class-management view with a stale version', () => {
    const validated = validateClassManagementView({
      surface: 'class-management',
      version: 0,
      filters: { status: 'completed', search: '' },
    });
    expect(validated).toBeNull();
  });
});
