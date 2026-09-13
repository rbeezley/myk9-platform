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
  /**
   * MYK9-487. The seeded Heartland Saturday trial really does run two classes
   * that share an element AND a level:
   *   dec1a55e-...032  "Interior Advanced"
   *   dec1a55e-...040  "Interior Advanced Preliminary"
   * Keying the level map on the level string alone merged them into one entry,
   * so the public premium under-reported what the show offers — silently, with
   * no error, just a shorter list. Every pre-existing section test used a
   * distinct `section`, which was handled; nothing exercised this shape.
   */
  it('keeps two classes that share an element and a level distinct', () => {
    const result = buildOfferedClasses(
      show([
        {
          id: 't1',
          name: 'Saturday Trial',
          classes: [
            { id: 'c1', element: 'Interior', level: 'Advanced', name: 'Interior Advanced' },
            {
              id: 'c2',
              element: 'Interior',
              level: 'Advanced',
              name: 'Interior Advanced Preliminary',
            },
          ],
        },
      ])
    );

    expect(result[0]?.elements[0]?.levels).toEqual([
      { level: 'Advanced', sections: [] },
      { level: 'Advanced Preliminary', sections: [] },
    ]);
  });

  it('still merges sections of one level rather than splitting on the name', () => {
    // The split-level case must NOT regress into two entries: a class name that
    // only restates element + level + section carries no extra information.
    const result = buildOfferedClasses(
      show([
        {
          id: 't1',
          name: 'T',
          classes: [
            {
              id: 'c1',
              element: 'Interior',
              level: 'Novice',
              section: 'A',
              name: 'Interior Novice A',
            },
            {
              id: 'c2',
              element: 'Interior',
              level: 'Novice',
              section: 'B',
              name: 'Interior Novice B',
            },
          ],
        },
      ])
    );

    expect(result[0]?.elements[0]?.levels).toEqual([{ level: 'Novice', sections: ['A', 'B'] }]);
  });
});
