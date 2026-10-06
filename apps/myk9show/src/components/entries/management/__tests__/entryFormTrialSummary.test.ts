import { describe, expect, it } from 'vitest';
import type { EntryClass, EntryManagementEntry } from '@/types/entry-management-types';
import { summarizeTrialClasses } from '../entryFormTrialSummary';

function entryIn(
  name: string,
  trial: { id: string; date: string; number: string },
  status: EntryClass['status'] = 'entered'
): EntryManagementEntry {
  return {
    classes: [
      {
        id: `entry-${name}-${trial.id}`,
        name,
        number: '1',
        fee: 0,
        status,
        trialId: trial.id,
        trialDate: trial.date,
        trialNumber: trial.number,
      },
    ],
  } as unknown as EntryManagementEntry;
}

const sat = { id: 't1', date: '2026-11-09', number: '1' };
const sun = { id: 't2', date: '2026-11-10', number: '2' };
const mon = { id: 't3', date: '2026-11-11', number: '3' };

describe('summarizeTrialClasses', () => {
  it('names the weekday, date, trial number and class for a single entry', () => {
    const { lines, hiddenClassCount } = summarizeTrialClasses([entryIn('Container Novice A', sat)]);
    expect(lines).toEqual([
      { key: 't1', label: 'Mon, Nov 9 · Trial 1', classes: ['Container Novice A'] },
    ]);
    expect(hiddenClassCount).toBe(0);
  });

  it('does not say "Trial" twice when the stored number already starts with it', () => {
    const { lines } = summarizeTrialClasses([
      entryIn('Interior Advanced', { id: 't9', date: '2026-11-09', number: 'Trial 1' }),
    ]);
    expect(lines[0]?.label).toBe('Mon, Nov 9 · Trial 1');
  });

  it('puts classes in the same trial on one line, once each', () => {
    const { lines } = summarizeTrialClasses([
      entryIn('Container Novice A', sat),
      entryIn('Interior Novice A', sat),
      entryIn('Container Novice A', sat),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.classes).toEqual(['Container Novice A', 'Interior Novice A']);
  });

  it('gives each trial its own line, earliest first, and counts the classes that do not fit', () => {
    const { lines, hiddenClassCount } = summarizeTrialClasses([
      entryIn('Buried Advanced B', mon),
      entryIn('Exterior Novice A', mon),
      entryIn('Container Novice A', sun),
      entryIn('Interior Novice A', sat),
    ]);
    expect(lines.map(line => line.label)).toEqual([
      'Mon, Nov 9 · Trial 1',
      'Tue, Nov 10 · Trial 2',
    ]);
    expect(hiddenClassCount).toBe(2);
  });

  it('leaves out a pulled class unless nothing else is left', () => {
    expect(
      summarizeTrialClasses([
        entryIn('Container Novice A', sat),
        entryIn('Interior Novice A', sat, 'scratched'),
      ]).lines[0]?.classes
    ).toEqual(['Container Novice A']);
    expect(
      summarizeTrialClasses([entryIn('Interior Novice A', sat, 'withdrawn')]).lines[0]?.classes
    ).toEqual(['Interior Novice A']);
  });

  it('still names the class when the trial is not known', () => {
    const noTrial = {
      classes: [{ id: 'e', name: 'Container Novice A', number: '1', fee: 0, status: 'entered' }],
    } as unknown as EntryManagementEntry;
    const { lines } = summarizeTrialClasses([noTrial]);
    expect(lines).toEqual([{ key: 'unknown', label: '', classes: ['Container Novice A'] }]);
  });
});
