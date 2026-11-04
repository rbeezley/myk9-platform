import { describe, expect, it } from 'vitest';
import {
  akcSetupSheet,
  getSetupSheet,
  getSetupValue,
  ukcSetupSheet,
  type SetupSheet,
} from '../setupRules';

function allCells(sheet: SetupSheet): string[] {
  return sheet.pages.flatMap(page =>
    page.groups.flatMap(group =>
      group.rows.flatMap(row => page.columns.map(column => row.values[column.key] ?? ''))
    )
  );
}

describe('getSetupSheet', () => {
  it('has a sheet for UKC and AKC and none for ASCA or unknown ids', () => {
    expect(getSetupSheet('UKC')).toBe(ukcSetupSheet);
    expect(getSetupSheet('AKC')).toBe(akcSetupSheet);
    expect(getSetupSheet('ASCA')).toBeNull();
    expect(getSetupSheet(undefined)).toBeNull();
  });
});

describe.each([
  ['UKC', ukcSetupSheet],
  ['AKC', akcSetupSheet],
])('%s sheet integrity', (_name, sheet) => {
  it('fills every cell and carries no placeholder text', () => {
    for (const cell of allCells(sheet)) {
      expect(cell.trim()).not.toBe('');
      expect(cell).not.toMatch(/check rulebook|tbd|todo/i);
    }
  });

  it('prints at 10pt or larger', () => {
    expect(sheet.tableFontPt).toBeGreaterThanOrEqual(10);
    for (const page of sheet.pages) {
      if (page.tableFontPt !== undefined) expect(page.tableFontPt).toBeGreaterThanOrEqual(10);
    }
  });

  it('uses no em dashes in printed text', () => {
    const text = [
      sheet.title,
      sheet.edition,
      ...sheet.pages.flatMap(p => [
        p.title,
        ...p.notes.flatMap(n => [n.heading, ...n.excerpts.flatMap(e => [e.quote, e.cite])]),
      ]),
      ...allCells(sheet),
    ].join(' ');
    expect(text).not.toContain('—');
  });
});

describe('UKC setup data', () => {
  const levels = ['novice', 'advanced', 'superior', 'master', 'elite'];

  it('covers 4 grid elements across the 5 levels, with times in the header', () => {
    const elements = ukcSetupSheet.pages.flatMap(p => p.groups.map(g => g.elementKey));
    expect(elements).toEqual(['vehicle', 'container', 'interior', 'exterior', 'hd']);
    for (const page of ukcSetupSheet.pages.filter(p => p.id !== 'handler-discrimination')) {
      expect(page.columns.map(c => c.key)).toEqual(levels);
      expect(page.columns.map(c => c.note)).toEqual([
        'Max time 3 min',
        'Max time 4 min',
        'Max time 5 min',
        'Max time 6 min',
        'Max time 6 min',
      ]);
    }
    for (const element of elements.filter(e => e !== 'hd')) {
      for (const level of levels) {
        expect(getSetupValue(ukcSetupSheet, element, 'hides', level)).toBeTruthy();
      }
    }
  });

  it('Master Vehicle: 5 vehicles, cars 3 ft and other 4 ft, 6 minutes', () => {
    expect(getSetupValue(ukcSetupSheet, 'vehicle', 'vehicles', 'master')).toBe('5 (up to 2 other)');
    expect(getSetupValue(ukcSetupSheet, 'vehicle', 'max-height', 'master')).toBe(
      'Cars 3 ft, other 4 ft'
    );
    expect(getSetupValue(ukcSetupSheet, 'vehicle', 'max-height', 'elite')).toBe(
      'Cars 3 ft, other 5 ft'
    );
    expect(ukcSetupSheet.pages[0]?.columns.find(c => c.key === 'master')?.note).toBe(
      'Max time 6 min'
    );
  });

  it('matches the rulebook for odors, boxes, areas and hide locations', () => {
    expect(getSetupValue(ukcSetupSheet, 'container', 'boxes', 'novice')).toBe('12');
    expect(getSetupValue(ukcSetupSheet, 'container', 'boxes', 'elite')).toBe('24');
    expect(getSetupValue(ukcSetupSheet, 'exterior', 'area', 'elite')).toBe('3,000 to 4,000 sq ft');
    expect(getSetupValue(ukcSetupSheet, 'interior', 'locations', 'novice')).toBe('8 to 12');
    expect(getSetupValue(ukcSetupSheet, 'interior', 'locations', 'elite')).toContain('18 to 26');
    expect(getSetupValue(ukcSetupSheet, 'interior', 'odors', 'elite')).toContain('Vetiver');
    expect(getSetupValue(ukcSetupSheet, 'exterior', 'max-height', 'elite')).toBe('5 ft');
  });
});

describe('AKC setup data', () => {
  const levels = ['novice', 'advanced', 'excellent', 'master'];

  it('covers 4 odor elements across the 4 levels, with times in each element', () => {
    const odorElements = ['container', 'buried', 'interior', 'exterior'];
    const onSheet = akcSetupSheet.pages.flatMap(p => p.groups.map(g => g.elementKey));
    expect(onSheet).toEqual([...odorElements, 'hd']);
    for (const page of akcSetupSheet.pages) {
      expect(page.columns.map(c => c.key)).toEqual(levels);
      expect(page.columns.every(c => c.note === undefined)).toBe(true);
    }
    for (const element of odorElements) {
      for (const level of levels) {
        expect(getSetupValue(akcSetupSheet, element, 'time', level)).toBeTruthy();
      }
    }
  });

  it('Buried Master: 16 totes, 8 sand and 8 water, 400-500 sq ft, 1-4 unknown hides, 5 min', () => {
    expect(getSetupValue(akcSetupSheet, 'buried', 'totes', 'master')).toBe('16');
    expect(getSetupValue(akcSetupSheet, 'buried', 'fill', 'master')).toBe('8 sand and 8 water');
    expect(getSetupValue(akcSetupSheet, 'buried', 'area', 'master')).toBe('400 to 500 sq ft');
    expect(getSetupValue(akcSetupSheet, 'buried', 'hides', 'master')).toBe(
      '1 to 4, number not announced'
    );
    expect(getSetupValue(akcSetupSheet, 'buried', 'time', 'master')).toBe('5 minutes');
  });

  it('Buried Novice is all sand and Excellent is the first mixed level', () => {
    expect(getSetupValue(akcSetupSheet, 'buried', 'fill', 'novice')).toMatch(/^All sand/);
    expect(getSetupValue(akcSetupSheet, 'buried', 'fill', 'excellent')).toBe('6 sand and 6 water');
    expect(getSetupValue(akcSetupSheet, 'buried', 'totes', 'novice')).toBe('6');
    expect(getSetupValue(akcSetupSheet, 'buried', 'layout', 'novice')).toBe('2 rows of 3');
  });

  it('Container Novice: ten identical boxes, two rows of five, 250-400 sq ft, 2 minutes', () => {
    expect(getSetupValue(akcSetupSheet, 'container', 'containers', 'novice')).toBe('10');
    expect(getSetupValue(akcSetupSheet, 'container', 'container-type', 'novice')).toBe(
      'Identical cardboard boxes'
    );
    expect(getSetupValue(akcSetupSheet, 'container', 'layout', 'novice')).toBe('2 rows of 5');
    expect(getSetupValue(akcSetupSheet, 'container', 'spacing', 'novice')).toBe(
      'at least 12 in apart, rows at least 36 in apart'
    );
    expect(getSetupValue(akcSetupSheet, 'container', 'area', 'novice')).toBe('250 to 400 sq ft');
    expect(getSetupValue(akcSetupSheet, 'container', 'time', 'novice')).toBe('2 minutes');
    expect(getSetupValue(akcSetupSheet, 'container', 'odors', 'novice')).toBe('Birch');
  });

  it('Interior Excellent: 2 areas, 400-800 sq ft total, 3 hides', () => {
    expect(getSetupValue(akcSetupSheet, 'interior', 'area', 'excellent')).toBe(
      '2 areas, 400 to 800 sq ft total'
    );
    expect(getSetupValue(akcSetupSheet, 'interior', 'hides', 'excellent')).toMatch(/^3, known/);
    expect(getSetupValue(akcSetupSheet, 'interior', 'max-height', 'excellent')).toBe('48 in');
  });

  it('shows hide height and accessibility on Interior and Exterior only', () => {
    for (const element of ['interior', 'exterior']) {
      expect(getSetupValue(akcSetupSheet, element, 'max-height', 'master')).toBe('60 in');
      expect(getSetupValue(akcSetupSheet, element, 'accessibility', 'master')).toBe(
        'All hides may be inaccessible'
      );
    }
    for (const element of ['container', 'buried']) {
      expect(getSetupValue(akcSetupSheet, element, 'max-height', 'master')).toBeUndefined();
      expect(getSetupValue(akcSetupSheet, element, 'accessibility', 'master')).toBeUndefined();
    }
  });
});

describe('AKC Handler Discrimination data', () => {
  it('Master: combined search, 2 areas, 300-800 sq ft, 3 handler hides, judge and steward aids', () => {
    const get = (row: string) => getSetupValue(akcSetupSheet, 'hd', row, 'master');
    expect(get('search-type')).toMatch(/^Combined/);
    expect(get('area')).toBe('2 areas, 300 to 800 sq ft total');
    expect(get('handler-hides')).toBe('3 hides: cotton ball or swab');
    expect(get('other-scents')).toBe('1 judge-scented aid and 1 steward-scented aid');
    expect(get('max-height')).toContain('24 in');
    expect(get('time')).toBe('Judge sets, 2 to 3 min per area');
  });

  it('Advanced: interior, 150-400 sq ft, one accessible hide at 24 in, 2 to 5 minutes', () => {
    const get = (row: string) => getSetupValue(akcSetupSheet, 'hd', row, 'advanced');
    expect(get('search-type')).toBe('Interior');
    expect(get('area')).toBe('150 to 400 sq ft');
    expect(get('handler-hides')).toBe('1 hide: cotton ball or swab');
    expect(get('other-scents')).toBe('1 judge-scented aid');
    expect(get('max-height')).toBe('Accessible, 24 in max');
    expect(get('distractions')).toBe('None');
    expect(get('time')).toBe('Judge sets, 2 to 5 min');
  });

  it('prints as its own card and carries the steward, Novice box and cueing notes', () => {
    const page = akcSetupSheet.pages.find(p => p.id === 'handler-discrimination');
    expect(page?.title).toContain('single-sided');
    expect(page?.notes.map(n => n.heading)).toEqual([
      'Hide steward',
      'Handler waits out of sight',
      'Novice boxes',
      'Handler cueing',
    ]);
    const steward = page?.notes.find(n => n.heading === 'Hide steward');
    const quotes = steward?.excerpts.map(e => e.quote).join(' ') ?? '';
    expect(quotes).toMatch(/the judge must designate another individual to set the hides/);
    expect(quotes).toMatch(/latex, nitrile, or vinyl gloves/);
  });
});

describe('UKC Handler Discrimination data', () => {
  const get = (row: string, level: string) => getSetupValue(ukcSetupSheet, 'hd', row, level);

  it('is page 3 of the UKC sheet with its own four HD levels', () => {
    expect(ukcSetupSheet.pages.map(p => p.id)).toEqual([
      'vehicles-containers',
      'interior-exterior',
      'handler-discrimination',
    ]);
    const page = ukcSetupSheet.pages[2];
    expect(page?.columns.map(c => c.key)).toEqual(['novice', 'advanced', 'excellent', 'master']);
    expect(akcSetupSheet.pages).toHaveLength(3);
  });

  it('fills every row for every level', () => {
    const rows = ukcSetupSheet.pages[2]?.groups[0]?.rows ?? [];
    expect(rows.map(r => r.id)).toEqual([
      'area',
      'layout',
      'box',
      'article',
      'prep',
      'target',
      'other-scents',
      'distractions',
      'start',
      'time',
      'calls',
    ]);
    for (const r of rows) {
      for (const level of ['novice', 'advanced', 'excellent', 'master']) {
        expect(get(r.id, level)?.trim()).toBeTruthy();
      }
    }
  });

  it('Novice: 12 boxes in a line 24 in apart, one cotton glove, no distractions, 3 min', () => {
    expect(get('layout', 'novice')).toMatch(/^12 boxes in a straight line.*24 in or more apart/);
    expect(get('article', 'novice')).toMatch(/^1 clean cotton glove/);
    expect(get('other-scents', 'novice')).toMatch(/^None/);
    expect(get('distractions', 'novice')).toMatch(/^None/);
    expect(get('start', 'novice')).toMatch(/^On leash/);
    expect(get('time', 'novice')).toMatch(/^Not over 3 min/);
  });

  it('Advanced: 11 judge-scented gloves among 12, steward removes the empty box', () => {
    expect(get('other-scents', 'advanced')).toBe(
      '11 judge-scented cotton gloves, 12 gloves in 12 boxes'
    );
    expect(get('prep', 'advanced')).toMatch(/^Steward takes the empty box from the line/);
    expect(get('calls', 'advanced')).toMatch(/incorrect Alert ends the search/);
    expect(get('start', 'advanced')).toMatch(/^On leash/);
  });

  it('Excellent: bagged glove in an open box, random numbering, on leash, 3 min', () => {
    expect(get('article', 'excellent')).toMatch(
      /sealed plastic bag marked with the armband number/
    );
    expect(get('layout', 'excellent')).toMatch(/marked 1 to 12 at random/);
    expect(get('prep', 'excellent')).toMatch(/no sooner than 15 min before the section/);
    expect(get('start', 'excellent')).toMatch(/^On leash/);
    expect(get('time', 'excellent')).toMatch(/^Not over 3 min/);
  });

  it('Master: 2,400 sq ft, personal item (not a glove), scattered boxes, off leash, 4 min', () => {
    expect(get('area', 'master')).toMatch(/^At least 40 x 60 ft \(2,400 sq ft\)/);
    expect(get('area', 'master')).toMatch(/6 x 4 ft handler station/);
    expect(get('article', 'master')).toMatch(/not a glove or undergarment/);
    expect(get('box', 'master')).toMatch(/^12 x 9 x 3 in/);
    expect(get('layout', 'master')).toMatch(/6 ft or more from any item or ring edge/);
    expect(get('start', 'master')).toMatch(/leash off at the station/);
    expect(get('time', 'master')).toMatch(/^4 min/);
    expect(get('calls', 'master')).toMatch(/Sits or Downs at the item/);
  });

  it('carries cited stewarding, article and Master station notes', () => {
    const headings = ukcSetupSheet.pages[2]?.notes.map(n => n.heading);
    expect(headings).toEqual(['Stewards', 'Articles', 'Master station']);
  });
});
