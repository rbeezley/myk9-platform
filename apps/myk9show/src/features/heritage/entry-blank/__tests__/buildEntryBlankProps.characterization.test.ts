import { describe, it, expect } from 'vitest';
import { buildEntryBlankProps } from '../buildEntryBlankProps';

/**
 * Characterization test for the §II class grid (Phase 1b of the multi-registry plan).
 * Pins the EXACT current levelCells output — including the PLURAL element labels
 * ('Containers', 'Interiors', 'Exteriors', 'Buried') and the 'Other' special rows — so the
 * refactor that sources this grid from the AKC registry provably renders identical text.
 */
const BASE = {
  show: { name: 'S', start_date: '2026-06-12', end_date: '2026-06-14' },
  trials: [{ id: 't1', date: '2026-06-12', display_order: 1, registry_id: 'AKC' }],
  classes: [],
  judges: [],
  club: { name: 'C' },
  secretary: {},
};

describe('buildEntryBlankProps — §II grid (characterization)', () => {
  const props = buildEntryBlankProps(BASE);
  const cells = props.levelCells.map(c => `${c.level} / ${c.element}`);

  it('renders the 4×4 grid then the two special rows, with plural element labels', () => {
    expect(cells).toEqual([
      'Novice / Containers',
      'Novice / Interiors',
      'Novice / Exteriors',
      'Novice / Buried',
      'Advanced / Containers',
      'Advanced / Interiors',
      'Advanced / Exteriors',
      'Advanced / Buried',
      'Excellent / Containers',
      'Excellent / Interiors',
      'Excellent / Exteriors',
      'Excellent / Buried',
      'Master / Containers',
      'Master / Interiors',
      'Master / Exteriors',
      'Master / Buried',
      'Other / Handler Discrimination',
      'Other / Detective',
    ]);
  });

  it('all cells start unchecked in blank mode', () => {
    expect(props.levelCells.every(c => c.checked === false)).toBe(true);
  });

  it('marks the matching grid cell checked for a pre-filled entry (canonical element label)', () => {
    const filled = buildEntryBlankProps({
      ...BASE,
      // Real classes store the canonical singular element label ('Exterior'); the grid displays
      // the pluralized 'Exteriors' but matches on the canonical label.
      classes: [{ id: 'c1', trial_id: 't1', level: 'Master', element: 'Exterior' }],
      entry: { trial_id: 't1', class_id: 'c1' },
    });
    const checked = filled.levelCells.filter(c => c.checked).map(c => `${c.level} / ${c.element}`);
    expect(checked).toEqual(['Master / Exteriors']);
  });

  it('marks the special row checked for a level-less Detective entry (any level)', () => {
    const filled = buildEntryBlankProps({
      ...BASE,
      classes: [{ id: 'c1', trial_id: 't1', element: 'Detective' }], // Detective has no level
      entry: { trial_id: 't1', class_id: 'c1' },
    });
    const checked = filled.levelCells.filter(c => c.checked).map(c => `${c.level} / ${c.element}`);
    expect(checked).toEqual(['Other / Detective']);
  });

  it('marks the HD special row checked for a non-Master HD entry (Advanced)', () => {
    const filled = buildEntryBlankProps({
      ...BASE,
      classes: [{ id: 'c1', trial_id: 't1', level: 'Advanced', element: 'Handler Discrimination' }],
      entry: { trial_id: 't1', class_id: 'c1' },
    });
    const checked = filled.levelCells.filter(c => c.checked).map(c => `${c.level} / ${c.element}`);
    expect(checked).toEqual(['Other / Handler Discrimination']);
  });

  it('defaults to AKC for a blank/whitespace registry_id (does not throw)', () => {
    for (const registry_id of ['', '   ', null, undefined]) {
      const props = buildEntryBlankProps({
        ...BASE,
        trials: [
          {
            id: 't1',
            date: '2026-06-12',
            display_order: 1,
            ...(registry_id !== undefined ? { registry_id } : {}),
          },
        ],
      });
      expect(props.licenseLanguage).toBe('An A.K.C. Licensed Trial');
      // Grid still renders the AKC structure (plural labels), proving AKC fallback.
      expect(props.levelCells[0]).toMatchObject({ level: 'Novice', element: 'Containers' });
    }
  });
});

describe('buildEntryBlankProps — UKC trial', () => {
  const UKC_BASE = {
    ...BASE,
    trials: [{ id: 't1', date: '2026-06-12', display_order: 1, registry_id: 'UKC' }],
  };

  it('renders UKC license language + Vehicle grid (registry-aware)', () => {
    const props = buildEntryBlankProps(UKC_BASE);
    expect(props.licenseLanguage).toBe('A UKC Licensed Nosework Trial');
    expect(props.levelCells.some(c => c.element === 'Vehicle')).toBe(true);
    expect(props.levelCells.some(c => c.element === 'Buried')).toBe(false);
  });

  it('prefills the HD special row for a UKC Excellent HD entry', () => {
    const props = buildEntryBlankProps({
      ...UKC_BASE,
      classes: [
        { id: 'c1', trial_id: 't1', level: 'Excellent', element: 'Handler Discrimination' },
      ],
      entry: { trial_id: 't1', class_id: 'c1' },
    });
    const checked = props.levelCells.filter(c => c.checked).map(c => `${c.level} / ${c.element}`);
    expect(checked).toEqual(['Other / Handler Discrimination']);
  });
});

describe('buildEntryBlankProps — ASCA trial (Level C continuation rows)', () => {
  const ASCA_BASE = {
    ...BASE,
    trials: [{ id: 't1', date: '2026-06-12', display_order: 1, registry_id: 'ASCA' }],
  };

  it('renders Level C rows alongside the base levels on a blank form', () => {
    const rows = new Set(buildEntryBlankProps(ASCA_BASE).levelCells.map(c => c.level));
    // Base levels AND their Level C continuation rows both appear.
    expect(rows.has('Novice')).toBe(true);
    expect(rows.has('Novice Level C')).toBe(true);
    expect(rows.has('Excellent')).toBe(true);
    expect(rows.has('Excellent Level C')).toBe(true);
  });

  it('prefills the Level C cell (not the base) for a Level C entry', () => {
    const props = buildEntryBlankProps({
      ...ASCA_BASE,
      classes: [{ id: 'c1', trial_id: 't1', level: 'Novice', element: 'Container', section: 'C' }],
      entry: { trial_id: 't1', class_id: 'c1' },
    });
    const checked = props.levelCells.filter(c => c.checked).map(c => `${c.level} / ${c.element}`);
    expect(checked).toEqual(['Novice Level C / Containers']);
  });

  it('prefills the BASE cell (not Level C) for a base Novice entry', () => {
    const props = buildEntryBlankProps({
      ...ASCA_BASE,
      classes: [{ id: 'c1', trial_id: 't1', level: 'Novice', element: 'Container' }], // no section
      entry: { trial_id: 't1', class_id: 'c1' },
    });
    const checked = props.levelCells.filter(c => c.checked).map(c => `${c.level} / ${c.element}`);
    expect(checked).toEqual(['Novice / Containers']);
  });
});
