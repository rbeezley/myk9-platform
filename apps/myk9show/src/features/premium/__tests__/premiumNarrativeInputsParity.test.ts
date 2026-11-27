/**
 * MYK9-2280: "Use the show's current details" is held while a narrative input that Edit show can
 * change is unsaved. This keeps that list in step with the edge function's `NarrativeShowRow`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { NARRATIVE_SHOW_INPUTS, hasUnsavedNarrativeInputs } from '../premiumNarrativeInputs';
import { showToFormData } from '@/components/panels/edit/ShowEditPanel.helpers';

const source = readFileSync(
  join(__dirname, '../../../../../../supabase/functions/generate-premium/premiumNarratives.ts'),
  'utf-8'
);

function narrativeShowRowKeys(): string[] {
  const body = /export interface NarrativeShowRow \{([^}]*)\}/.exec(source)?.[1];
  if (!body) throw new Error('NarrativeShowRow not found in the edge function');
  return [...body.matchAll(/^\s*(\w+)\??:/gm)].map(match => match[1] as string);
}

describe('narrative inputs classification', () => {
  it('names every non-trial key of the edge function NarrativeShowRow, and no other', () => {
    const nonTrial = narrativeShowRowKeys()
      .filter(key => key !== 'trials')
      .sort();
    expect(nonTrial.length).toBeGreaterThan(0);
    expect(Object.keys(NARRATIVE_SHOW_INPUTS).sort()).toEqual(nonTrial);
  });

  it('maps each editable entry to a key showToFormData actually sets', () => {
    const formKeys = Object.keys(showToFormData({}));
    const editable = Object.values(NARRATIVE_SHOW_INPUTS).filter(key => key !== null);
    expect(editable.length).toBeGreaterThan(0);
    for (const key of editable) expect(formKeys).toContain(key);
  });
});

describe('hasUnsavedNarrativeInputs', () => {
  const saved = showToFormData({ id: 's1', name: 'Fall', location: 'Hall' });

  it('is false when nothing differs, or when the only change is another control', () => {
    expect(hasUnsavedNarrativeInputs(saved, { ...saved })).toBe(false);
    expect(hasUnsavedNarrativeInputs(saved, { ...saved, publishExperience: true })).toBe(false);
    expect(hasUnsavedNarrativeInputs(saved, { ...saved, preEntryFee: '99' })).toBe(false);
  });

  it('is true when the name or location differs', () => {
    expect(hasUnsavedNarrativeInputs(saved, { ...saved, name: 'Spring' })).toBe(true);
    expect(hasUnsavedNarrativeInputs(saved, { ...saved, location: 'Barn' })).toBe(true);
  });

  it('is false with no saved snapshot to compare against', () => {
    expect(hasUnsavedNarrativeInputs(undefined, saved)).toBe(false);
  });
});
