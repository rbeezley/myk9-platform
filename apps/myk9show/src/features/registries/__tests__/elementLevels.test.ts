import { describe, it, expect } from 'vitest';
import {
  getRegistrySportForTemplate,
  levelLabelsForElements,
  levelResolverForTemplate,
} from '../elementLevels';
import { getRegistry, getSport } from '../lookup';

/**
 * Per-element level lookup — owns the registry level matrix that the title engine and the
 * manual-result panel both depend on. UKC Handler Discrimination and AKC Detective are the
 * two elements a flat, sport-wide level list gets wrong.
 */

const akcScentWork = getSport(getRegistry('AKC'), 'scent-work');
const ukcNosework = getSport(getRegistry('UKC'), 'scent-work');
const ascaScentDetection = getSport(getRegistry('ASCA'), 'scent-work');

describe('levelLabelsForElements', () => {
  describe('UKC — the divergent case', () => {
    it('gives Handler Discrimination its own four levels', () => {
      expect(levelLabelsForElements(ukcNosework, ['Handler Discrimination'])).toEqual([
        'Novice',
        'Advanced',
        'Excellent',
        'Master',
      ]);
    });

    it('does not offer HD the grid elements’ Superior or Elite', () => {
      const hd = levelLabelsForElements(ukcNosework, ['Handler Discrimination']);
      expect(hd).not.toContain('Superior');
      expect(hd).not.toContain('Elite');
    });

    it('keeps the grid elements on Superior/Elite, not Excellent', () => {
      expect(levelLabelsForElements(ukcNosework, ['Container'])).toEqual([
        'Novice',
        'Advanced',
        'Superior',
        'Master',
        'Elite',
      ]);
    });

    it('unions across elements — both rank-3 labels appear together', () => {
      const both = levelLabelsForElements(ukcNosework, ['Container', 'Handler Discrimination']);
      expect(both).toContain('Superior');
      expect(both).toContain('Excellent');
    });
  });

  describe('AKC', () => {
    it('gives Detective exactly its own level', () => {
      expect(levelLabelsForElements(akcScentWork, ['Detective'])).toEqual(['Detective']);
    });

    it('leaves the progression elements unchanged', () => {
      expect(levelLabelsForElements(akcScentWork, ['Container'])).toEqual([
        'Novice',
        'Advanced',
        'Excellent',
        'Master',
      ]);
      expect(levelLabelsForElements(akcScentWork, ['Handler Discrimination'])).toEqual([
        'Novice',
        'Advanced',
        'Excellent',
        'Master',
      ]);
    });
  });

  describe('ASCA', () => {
    it('is unchanged — every seeded element shares one level set', () => {
      const expected = ['Novice', 'Open', 'Advanced', 'Excellent'];
      for (const element of ['Container', 'Interior', 'Exterior', 'Vehicle']) {
        expect(levelLabelsForElements(ascaScentDetection, [element])).toEqual(expected);
      }
    });
  });

  describe('scope fallbacks', () => {
    it('returns the whole sport when no element is in scope', () => {
      expect(levelLabelsForElements(ukcNosework)).toEqual([
        'Novice',
        'Advanced',
        'Superior',
        'Excellent',
        'Master',
        'Elite',
      ]);
      expect(levelLabelsForElements(ukcNosework, [])).toEqual(levelLabelsForElements(ukcNosework));
    });

    it('widens rather than narrows for an unrecognised element', () => {
      // An element with no registry entry must never silently produce an empty picker.
      expect(levelLabelsForElements(ukcNosework, ['Buried'])).toEqual(
        levelLabelsForElements(ukcNosework)
      );
    });
  });

  it('returns labels in progression order, not declaration or alphabetical order', () => {
    expect(levelLabelsForElements(ascaScentDetection, ['Container'])).toEqual([
      'Novice',
      'Open',
      'Advanced',
      'Excellent',
    ]);
  });
});

describe('getRegistrySportForTemplate', () => {
  it.each([
    ['akc-scent-work', akcScentWork],
    ['ukc-nosework', ukcNosework],
    ['asca-scent-detection', ascaScentDetection],
  ])('resolves %s', (sport_code, expected) => {
    expect(getRegistrySportForTemplate({ sport_code })).toBe(expected);
  });

  it('returns null for a sport with no registry config', () => {
    expect(getRegistrySportForTemplate({ sport_code: 'nacsw-nosework' })).toBeNull();
    expect(getRegistrySportForTemplate({ sport_code: null })).toBeNull();
    expect(getRegistrySportForTemplate(null)).toBeNull();
  });
});

describe('levelResolverForTemplate', () => {
  it('is registry-backed when the sport is configured', () => {
    const resolve = levelResolverForTemplate(
      { sport_code: 'ukc-nosework' },
      ['Novice', 'Advanced', 'Superior', 'Master', 'Elite'] // the flat column
    );
    expect(resolve(['Handler Discrimination'])).toEqual([
      'Novice',
      'Advanced',
      'Excellent',
      'Master',
    ]);
  });

  it('falls back to the template column for an unmodeled sport', () => {
    const flat = ['Novice', 'Open'];
    const resolve = levelResolverForTemplate({ sport_code: 'nacsw-nosework' }, flat);
    expect(resolve(['Container'])).toEqual(flat);
    expect(resolve([])).toEqual(flat);
  });
});
