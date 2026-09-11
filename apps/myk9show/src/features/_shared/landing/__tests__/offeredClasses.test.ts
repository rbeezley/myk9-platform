import { describe, expect, it } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import type { Show } from '@/types/show-types';
import { buildOfferedClasses } from '../offeredClasses';

/**
 * Shapes taken from the real seeded show `Heartland Scent Work Classic`, which
 * spans three registries: an AKC Scent Work trial, a UKC Nosework trial and an
 * ASCA Scent Detection trial. That mix is the reason grouping is by trial —
 * only two of its four trials offer Interior.
 */
function show(trials: unknown[]): Show {
  return fromAny<Show, unknown>({ id: 'show-1', name: 'Heartland', trials });
}

describe('buildOfferedClasses', () => {
  it('groups by trial, then element, then level', () => {
    const result = buildOfferedClasses(
      show([
        {
          id: 't1',
          name: 'Saturday Trial',
          date: '2026-10-24',
          classes: [
            { id: 'c1', element: 'Interior', level: 'Advanced' },
            { id: 'c2', element: 'Interior', level: 'Novice' },
            { id: 'c3', element: 'Exterior', level: 'Excellent' },
          ],
        },
      ])
    );

    expect(result).toEqual([
      {
        trialId: 't1',
        trialName: 'Saturday Trial',
        date: '2026-10-24',
        elements: [
          {
            element: 'Interior',
            levels: [
              { level: 'Advanced', sections: [] },
              { level: 'Novice', sections: [] },
            ],
          },
          { element: 'Exterior', levels: [{ level: 'Excellent', sections: [] }] },
        ],
      },
    ]);
  });

  it('keeps registries apart so a missing element in one trial is visible', () => {
    const result = buildOfferedClasses(
      show([
        { id: 't1', name: 'Saturday Trial', classes: [{ id: 'c1', element: 'Interior' }] },
        { id: 't2', name: 'Sunday UKC Nosework', classes: [{ id: 'c2', element: 'Vehicle' }] },
      ])
    );

    expect(result.map(t => t.trialName)).toEqual(['Saturday Trial', 'Sunday UKC Nosework']);
    // The exhibitor's question: which trials actually run Interior?
    const interiorTrials = result
      .filter(t => t.elements.some(e => e.element === 'Interior'))
      .map(t => t.trialName);
    expect(interiorTrials).toEqual(['Saturday Trial']);
  });

  it('preserves first-seen order rather than sorting alphabetically', () => {
    // Alphabetical would be Buried, Container, Interior — this asserts it is not.
    const result = buildOfferedClasses(
      show([
        {
          id: 't1',
          name: 'T',
          classes: [
            { id: 'c1', element: 'Interior' },
            { id: 'c2', element: 'Container' },
            { id: 'c3', element: 'Buried' },
          ],
        },
      ])
    );

    expect(result[0]?.elements.map(e => e.element)).toEqual(['Interior', 'Container', 'Buried']);
  });

  it('collects section letters under their level and sorts them', () => {
    const result = buildOfferedClasses(
      show([
        {
          id: 't1',
          name: 'T',
          classes: [
            { id: 'c1', element: 'Interior', level: 'Novice', section: 'B' },
            { id: 'c2', element: 'Interior', level: 'Novice', section: 'A' },
          ],
        },
      ])
    );

    expect(result[0]?.elements[0]?.levels).toEqual([{ level: 'Novice', sections: ['A', 'B'] }]);
  });

  it('keeps a class whose level is unset under its element', () => {
    const result = buildOfferedClasses(
      show([{ id: 't1', name: 'T', classes: [{ id: 'c1', element: 'Interior', level: null }] }])
    );

    expect(result[0]?.elements).toEqual([
      { element: 'Interior', levels: [{ level: '', sections: [] }] },
    ]);
  });

  it('falls back to the class name when element is unset', () => {
    const result = buildOfferedClasses(
      show([{ id: 't1', name: 'T', classes: [{ id: 'c1', name: 'Handler Discrimination' }] }])
    );

    expect(result[0]?.elements[0]?.element).toBe('Handler Discrimination');
  });

  it('treats a blank element as absent rather than opening an empty group', () => {
    const result = buildOfferedClasses(
      show([{ id: 't1', name: 'T', classes: [{ id: 'c1', element: '   ', name: '  ' }] }])
    );

    expect(result).toEqual([]);
  });

  it('drops trials with no classes instead of rendering them empty', () => {
    const result = buildOfferedClasses(
      show([
        { id: 't1', name: 'Has classes', classes: [{ id: 'c1', element: 'Interior' }] },
        { id: 't2', name: 'No classes yet', classes: [] },
        { id: 't3', name: 'Undefined classes' },
      ])
    );

    expect(result.map(t => t.trialName)).toEqual(['Has classes']);
  });

  it('falls back to the trial number when the trial has no name', () => {
    const result = buildOfferedClasses(
      show([{ id: 't1', trialNumber: 'Trial 2', classes: [{ id: 'c1', element: 'Interior' }] }])
    );

    expect(result[0]?.trialName).toBe('Trial 2');
  });

  it('returns an empty array for a show with no trials at all', () => {
    expect(buildOfferedClasses(show([]))).toEqual([]);
    expect(buildOfferedClasses(null)).toEqual([]);
    expect(buildOfferedClasses(undefined)).toEqual([]);
  });
});
