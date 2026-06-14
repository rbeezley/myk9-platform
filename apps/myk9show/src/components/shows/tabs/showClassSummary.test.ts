import { describe, expect, it } from 'vitest';

import { summarizeShowClasses } from './showClassSummary';

describe('summarizeShowClasses', () => {
  it('counts classes and extracts compact trial, element, and level labels', () => {
    const summary = summarizeShowClasses([
      {
        id: 'class-1',
        name: 'Novice Standard A',
        level: 'Novice',
        element: 'Standard',
        trialName: 'Saturday Trial',
      },
      {
        id: 'class-2',
        name: 'Open Jumpers',
        level: 'Open',
        element: 'Jumpers',
        trialName: 'Saturday Trial',
      },
      {
        id: 'class-3',
        name: 'Novice FAST',
        level: 'Novice',
        element: 'FAST',
        trialName: 'Sunday Trial',
      },
    ]);

    expect(summary.totalClasses).toBe(3);
    expect(summary.trialLabels).toEqual(['Saturday Trial', 'Sunday Trial']);
    expect(summary.elementLabels).toEqual(['FAST', 'Jumpers', 'Standard']);
    expect(summary.levelLabels).toEqual(['Novice', 'Open']);
  });

  it('falls back to class names when element and level fields are absent', () => {
    const summary = summarizeShowClasses([
      {
        id: 'class-1',
        name: 'Masters Standard',
        trialName: 'Main Trial',
      },
    ]);

    expect(summary.totalClasses).toBe(1);
    expect(summary.elementLabels).toEqual(['Masters Standard']);
    expect(summary.levelLabels).toEqual([]);
  });
});
