import {
  groupEntriesByExhibitor,
  deriveSummaryStatus,
  buildClassDisplayName,
} from '../useCheckInReport';

describe('groupEntriesByExhibitor', () => {
  const makeEntry = (
    overrides: Partial<{
      id: string;
      dog_id: string;
      handler_id: string;
      armband_number: number;
      handler_first_name: string;
      handler_last_name: string;
      dog_call_name: string;
      dog_breed_name: string;
      check_in_status: string;
      class_id: string;
      element: string;
      level: string;
      section: string | null;
      trial_id: string;
      trial_date: string;
      trial_name: string | null;
      trial_number: string | null;
    }> = {}
  ) => ({
    id: 'entry-1',
    dog_id: 'dog-1',
    handler_id: 'handler-1',
    armband_number: 142,
    handler_first_name: 'Sarah',
    handler_last_name: 'Mitchell',
    dog_call_name: 'Buddy',
    dog_breed_name: 'Golden Retriever',
    check_in_status: 'no-status',
    class_id: 'class-1',
    element: 'Buried',
    level: 'Novice',
    section: null,
    trial_id: 'trial-1',
    trial_date: '2026-04-12',
    trial_name: 'Trial 1',
    trial_number: 'Trial 1',
    ...overrides,
  });

  it('groups entries by dog_id + handler_id', () => {
    const entries = [
      makeEntry({ id: 'e1', class_id: 'c1', element: 'Buried' }),
      makeEntry({ id: 'e2', class_id: 'c2', element: 'Interior' }),
    ];
    const groups = groupEntriesByExhibitor(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].armbandNumber).toBe(142);
    expect(groups[0].handlerName).toBe('Sarah Mitchell');
    expect(groups[0].dogName).toBe('Buddy');
  });

  it('creates separate groups for different dogs', () => {
    const entries = [
      makeEntry({ id: 'e1', dog_id: 'dog-1', armband_number: 142 }),
      makeEntry({ id: 'e2', dog_id: 'dog-2', armband_number: 143, dog_call_name: 'Daisy' }),
    ];
    const groups = groupEntriesByExhibitor(entries);
    expect(groups).toHaveLength(2);
  });

  it('sorts groups by armband number', () => {
    const entries = [
      makeEntry({ id: 'e1', dog_id: 'dog-2', armband_number: 200, dog_call_name: 'Ziggy' }),
      makeEntry({ id: 'e2', dog_id: 'dog-1', armband_number: 100 }),
    ];
    const groups = groupEntriesByExhibitor(entries);
    expect(groups[0].armbandNumber).toBe(100);
    expect(groups[1].armbandNumber).toBe(200);
  });
});

describe('deriveSummaryStatus', () => {
  it('returns "none" when all entries have no-status', () => {
    expect(deriveSummaryStatus(['no-status', 'no-status'])).toBe('none');
  });
  it('returns "checked-in" when all entries have a non-none status', () => {
    expect(deriveSummaryStatus(['checked-in', 'completed', 'in-ring'])).toBe('checked-in');
  });
  it('returns "partial" when some entries are checked in and some are not', () => {
    expect(deriveSummaryStatus(['checked-in', 'no-status'])).toBe('partial');
  });
  it('treats pulled entries as having a status (not none)', () => {
    expect(deriveSummaryStatus(['pulled', 'checked-in'])).toBe('checked-in');
  });
});

describe('buildClassDisplayName', () => {
  it('formats with day abbreviation, trial number, element, and level', () => {
    const result = buildClassDisplayName({
      element: 'Buried',
      level: 'Novice',
      section: null,
      trialDate: '2026-04-12',
      trialName: 'Trial 1',
      trialNumber: 'Trial 1',
    });
    expect(result).toBe('Sun Trial 1: Buried Novice');
  });
  it('includes section for Novice level', () => {
    const result = buildClassDisplayName({
      element: 'Buried',
      level: 'Novice',
      section: 'A',
      trialDate: '2026-04-12',
      trialName: 'Trial 1',
      trialNumber: 'Trial 1',
    });
    expect(result).toBe('Sun Trial 1: Buried Novice A');
  });
  it('omits section for non-Novice levels', () => {
    const result = buildClassDisplayName({
      element: 'Buried',
      level: 'Advanced',
      section: 'A',
      trialDate: '2026-04-12',
      trialName: 'Trial 1',
      trialNumber: 'Trial 1',
    });
    expect(result).toBe('Sun Trial 1: Buried Advanced');
  });
  it('omits section for Detective element', () => {
    const result = buildClassDisplayName({
      element: 'Detective',
      level: 'Novice',
      section: 'A',
      trialDate: '2026-04-12',
      trialName: 'Trial 1',
      trialNumber: 'Trial 1',
    });
    expect(result).toBe('Sun Trial 1: Detective Novice');
  });
  // MYK9-704: wizard trials store the name in trial_number; the old parse read
  // 'Saturday T 2' as NaN and labelled every such trial "T1".
  it('labels the trial with its stored name, never a parsed number', () => {
    const result = buildClassDisplayName({
      element: 'Buried',
      level: 'Advanced',
      section: null,
      trialDate: '2026-04-11',
      trialName: 'Saturday T 2',
      trialNumber: 'Saturday T 2',
    });
    expect(result).toBe('Sat Saturday T 2: Buried Advanced');
  });
});
