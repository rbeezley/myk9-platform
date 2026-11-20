import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import type { Show } from '@/types/show-types';
import { getDefaultTrialDate } from '@/components/shows/wizard/steps/TrialConfigurationStep.helpers';
import { parseWizardDay } from '@/utils/wizardTrialDates';
import { buildEditModeDraft } from '../buildEditModeDraft';
import { showToShowInput } from '../showCreationWizardTransformers';

/**
 * MYK9-2284: `shows.start_date` / `end_date` are timestamptz columns that hold
 * a calendar day at midnight UTC. The wizard reads its show dates as local
 * datetimes, so a show saved as Mar 6–7 opened in Add Trials from Central time
 * read as Mar 5–6: a new trial defaulted to the day before the show and the
 * last show day could not be picked.
 */
const ORIGINAL_TZ = process.env.TZ;

const showSavedAs = (overrides: Partial<Show>) =>
  ({
    id: 'show-1',
    name: 'Heartland',
    organization: 'AKC',
    startDate: '2027-03-06T00:00:00+00:00',
    endDate: '2027-03-07T00:00:00+00:00',
    location: 'Venue',
    clubId: 'club-1',
    entryOpenDate: '2027-01-15T00:00:00+00:00',
    entryCloseDate: '2027-02-24T00:00:00+00:00',
    preEntryFee: '30',
    dayOfShowFee: '35',
    assignedJudges: [],
    ...overrides,
  }) as unknown as Show;

const addTrialsDraft = (existingShow: Show) =>
  buildEditModeDraft({
    editMode: { showId: 'show-1', mode: 'add-trials' } as never,
    existingShow,
    showTrials: [{ id: 't1', timezone: 'America/Chicago' } as never],
    existingClasses: [],
    people: [],
  });

const day = (value: string | undefined) => {
  const parsed = parseWizardDay(value);
  return parsed ? format(parsed, 'yyyy-MM-dd') : undefined;
};

describe.each(['America/Chicago', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC'])(
  'edit-mode show dates viewed from %s (MYK9-2284)',
  tz => {
    beforeEach(() => {
      process.env.TZ = tz;
    });
    afterEach(() => {
      if (ORIGINAL_TZ === undefined) delete process.env.TZ;
      else process.env.TZ = ORIGINAL_TZ;
    });

    it.each([
      ['timestamptz with offset', '2027-03-06T00:00:00+00:00', '2027-03-07T00:00:00+00:00'],
      ['timestamptz, space separated', '2027-03-06 00:00:00+00', '2027-03-07 00:00:00+00'],
      ['date only', '2027-03-06', '2027-03-07'],
    ])('a show saved as Mar 6–7 (%s) loads as Mar 6–7', (_label, startDate, endDate) => {
      const draft = addTrialsDraft(showSavedAs({ startDate, endDate }));
      expect(day(draft.show.startDate)).toBe('2027-03-06');
      expect(day(draft.show.endDate)).toBe('2027-03-07');
      // Review and the show-dates picker read the value with `new Date`.
      expect(format(new Date(draft.show.startDate), 'yyyy-MM-dd')).toBe('2027-03-06');
      expect(format(new Date(draft.show.endDate), 'yyyy-MM-dd')).toBe('2027-03-07');
    });

    it('defaults a new trial to the first show day', () => {
      const draft = addTrialsDraft(showSavedAs({}));
      expect(getDefaultTrialDate(draft.show.startDate, draft.show.endDate, [])).toBe('2027-03-06');
    });

    it('loads the entry dates on their stored calendar days', () => {
      const draft = addTrialsDraft(showSavedAs({}));
      expect(day(draft.show.entryOpenDate)).toBe('2027-01-15');
      expect(day(draft.show.entryCloseDate)).toBe('2027-02-24');
    });

    it('a show still holding its in-session picker values keeps the picked days', () => {
      // Right after an online create the local store holds the wizard's own
      // value (local midnight as ISO) until replication brings the row back.
      const pickedStart = new Date(2027, 2, 6).toISOString();
      const pickedEnd = new Date(2027, 2, 7).toISOString();
      const draft = addTrialsDraft(showSavedAs({ startDate: pickedStart, endDate: pickedEnd }));
      expect(day(draft.show.startDate)).toBe('2027-03-06');
      expect(day(draft.show.endDate)).toBe('2027-03-07');
    });

    it('the edit save writes the calendar days the create save writes', () => {
      // Create writes `toLocalDateOnly(...)`; the edit and offline-create saves
      // go through showToShowInput and must write the same date-only days.
      const draft = addTrialsDraft(showSavedAs({}));
      const input = showToShowInput({ ...showSavedAs({}), ...draft.show } as unknown as Show);
      expect(input.startDate).toBe('2027-03-06');
      expect(input.endDate).toBe('2027-03-07');
      expect(input.entryOpenDate).toBe('2027-01-15');
      expect(input.entryCloseDate).toBe('2027-02-24');
    });
  }
);
