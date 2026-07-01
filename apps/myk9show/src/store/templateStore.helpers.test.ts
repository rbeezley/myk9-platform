import { describe, expect, it } from 'vitest';

import { upsertTemplates, shouldRevalidate } from './templateStore.helpers';
import {
  type ClassDefinition,
  type ClassTemplate,
  Organization,
  TemplateStatus,
  TemplateType,
  TrialType,
} from '@/types/template.types';

/** Minimal ClassTemplate factory — only the fields the merge logic reads matter. */
function makeTemplate(
  id: string,
  overrides: Partial<ClassTemplate> = {},
  classCount = 0
): ClassTemplate {
  const classDefinitions: ClassDefinition[] = Array.from({ length: classCount }, (_, i) => ({
    element: `Element ${i}`,
    className: `Class ${i}`,
    displayOrder: i,
    fieldOverrides: {},
  }));

  return {
    id,
    organization: Organization.AKC,
    trialType: TrialType.SCENT_WORK,
    templateName: `Template ${id}`,
    version: '1.0.0',
    description: '',
    status: TemplateStatus.ACTIVE,
    type: TemplateType.OFFICIAL,
    isActive: true,
    isOfficial: true,
    isCustom: false,
    isLatestVersion: true,
    allowEditing: false,
    fieldSpecifications: [],
    classDefinitions,
    validationRules: [],
    defaults: { entryFees: { preEntry: 30, dayOfShow: 35 }, requiredPersonnel: [] },
    createdBy: 'system',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('upsertTemplates', () => {
  it('replaces an existing template by id (the Level C convergence case)', () => {
    // Stale cache: ASCA template holding 16 class definitions.
    const stale = makeTemplate('asca-uuid', { templateName: 'ASCA - Official' }, 16);
    // Fresh DB: same id, now 32 class definitions (base + Level C).
    const fresh = makeTemplate('asca-uuid', { templateName: 'ASCA - Official' }, 32);

    const result = upsertTemplates([stale], [fresh]);

    expect(result).toHaveLength(1);
    expect(result[0].classDefinitions).toHaveLength(32);
    // Same reference as the fresh object — the stale copy is fully replaced.
    expect(result[0]).toBe(fresh);
  });

  it('appends templates that are genuinely new', () => {
    const existing = makeTemplate('akc-uuid');
    const incoming = makeTemplate('ukc-uuid');

    const result = upsertTemplates([existing], [incoming]);

    expect(result.map(t => t.id)).toEqual(['akc-uuid', 'ukc-uuid']);
  });

  it('preserves custom/local templates not present in the DB payload', () => {
    const custom = makeTemplate('template-123-abc', {
      isOfficial: false,
      isCustom: true,
      type: TemplateType.CUSTOM,
    });
    const dbTemplate = makeTemplate('akc-uuid');

    const result = upsertTemplates([custom, dbTemplate], [makeTemplate('akc-uuid', {}, 4)]);

    expect(result).toHaveLength(2);
    // Custom template untouched...
    expect(result[0]).toBe(custom);
    // ...DB template replaced with the fresh 4-class version.
    expect(result[1].classDefinitions).toHaveLength(4);
  });

  it('preserves order and does not duplicate on repeated upserts', () => {
    const a = makeTemplate('a');
    const b = makeTemplate('b');
    const freshA = makeTemplate('a', {}, 2);

    const once = upsertTemplates([a, b], [freshA]);
    const twice = upsertTemplates(once, [freshA]);

    expect(twice.map(t => t.id)).toEqual(['a', 'b']);
    expect(twice).toHaveLength(2);
  });

  it('returns the incoming list when starting from an empty cache', () => {
    const incoming = [makeTemplate('a'), makeTemplate('b')];
    expect(upsertTemplates([], incoming)).toEqual(incoming);
  });
});

describe('shouldRevalidate', () => {
  const now = 1_000_000;

  it('is true when the cache has never been fetched', () => {
    expect(shouldRevalidate(null, 60_000, now)).toBe(true);
    expect(shouldRevalidate(undefined, 60_000, now)).toBe(true);
  });

  it('always revalidates with a zero TTL (the configured default)', () => {
    expect(shouldRevalidate(now, 0, now)).toBe(true);
    expect(shouldRevalidate(now - 1, 0, now)).toBe(true);
  });

  it('is false while the cache is still within the TTL window', () => {
    expect(shouldRevalidate(now - 30_000, 60_000, now)).toBe(false);
  });

  it('is true once the cache is older than the TTL window', () => {
    expect(shouldRevalidate(now - 60_000, 60_000, now)).toBe(true);
    expect(shouldRevalidate(now - 120_000, 60_000, now)).toBe(true);
  });
});
