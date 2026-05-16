import { describe, it, expect } from 'vitest';
import {
  buildMagazineConfirmationProps,
  type BuildMagazineConfirmationPropsOptions,
} from '../buildConfirmationProps';

function makeOpts(
  overrides: Partial<BuildMagazineConfirmationPropsOptions> = {}
): BuildMagazineConfirmationPropsOptions {
  return {
    show: {
      name: 'Spring Scent Work',
      start_date: '2026-06-12',
      end_date: '2026-06-14',
      venue_name: 'Live Oak Civic Center',
      address: '8101 Pat Booker Rd',
      city: 'Live Oak',
      state: 'TX',
    },
    allTrials: [
      { id: 't1', date: '2026-06-12', trial_number: 'I', display_order: 1 },
      { id: 't2', date: '2026-06-13', trial_number: 'II', display_order: 2 },
      { id: 't3', date: '2026-06-14', trial_number: 'III', display_order: 3 },
    ],
    allClasses: [
      { id: 'c1', trial_id: 't1', name: 'Excellent Containers', level: 'Excellent', element: 'Containers' },
      { id: 'c2', trial_id: 't2', name: 'Excellent Interiors', level: 'Excellent', element: 'Interiors' },
      { id: 'c3', trial_id: 't3', name: 'Excellent Buried', level: 'Excellent', element: 'Buried' },
    ],
    judges: [
      { trial_id: 't1', judgeName: 'Mrs. Beagles' },
      { trial_id: 't2', judgeName: 'Mrs. Beagles' },
      { trial_id: 't3', judgeName: 'Mrs. Beagles' },
    ],
    entries: [
      { id: 'e1', trial_id: 't1', class_id: 'c1', armband: '247', entry_fee: 2500 },
      { id: 'e2', trial_id: 't2', class_id: 'c2', armband: '247', entry_fee: 2200 },
      { id: 'e3', trial_id: 't3', class_id: 'c3', armband: '247', entry_fee: 2200 },
    ],
    dog: {
      name: "CH Cedarwood's Risen On Pointe RN",
      call_name: 'Pointe',
      breed: 'German Shorthaired Pointer',
      sex: 'F',
    },
    handler: {
      first_name: 'Ms.',
      last_name: 'Patricia Holloway',
      email: 'pat@example.com',
    },
    club: {
      name: 'Bexar County Kennel Club',
      established: 'Est. 1947',
      city: 'San Antonio',
      state: 'TX',
    },
    ...overrides,
  };
}

describe('buildMagazineConfirmationProps', () => {
  // ─── Critical: lowercase Roman numerals (the bug #1 from PR review) ──────

  it('emits LOWERCASE Roman numerals regardless of how trial_number is stored', () => {
    // Upstream trial_number values are uppercase ("I", "II", "III") because
    // that's what AKC convention puts in the DB. The magazine voice is
    // lowercase, and the email pipeline must agree with the landing-page
    // hook. This is the assertion that catches PR-review bug #1.
    const props = buildMagazineConfirmationProps(makeOpts());
    expect(props.runs.map(r => r.trialNumeral)).toEqual(['i', 'ii', 'iii']);
  });

  it('derives numerals from display_order, not from upstream trial_number string', () => {
    // Sanity: even if trial_number is missing entirely, the numeral falls
    // back to lowercase Roman of display_order (or sort index).
    const props = buildMagazineConfirmationProps(
      makeOpts({
        allTrials: [
          { id: 't1', date: '2026-06-12', display_order: 1 },
          { id: 't2', date: '2026-06-13', display_order: 2 },
        ],
        entries: [
          { id: 'e1', trial_id: 't1', class_id: 'c1', armband: null, entry_fee: 2500 },
          { id: 'e2', trial_id: 't2', class_id: 'c2', armband: null, entry_fee: 2200 },
        ],
        allClasses: [
          { id: 'c1', trial_id: 't1', name: 'Containers', element: 'Containers' },
          { id: 'c2', trial_id: 't2', name: 'Interiors', element: 'Interiors' },
        ],
        judges: [],
      })
    );
    expect(props.runs.map(r => r.trialNumeral)).toEqual(['i', 'ii']);
  });

  it('falls back to lowercase Roman of the sort index when display_order is missing', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        allTrials: [
          { id: 't1', date: '2026-06-12' },
          { id: 't2', date: '2026-06-13' },
          { id: 't3', date: '2026-06-14' },
        ],
        entries: [
          { id: 'e1', trial_id: 't1', class_id: 'c1', armband: null, entry_fee: 2500 },
          { id: 'e3', trial_id: 't3', class_id: 'c3', armband: null, entry_fee: 2200 },
        ],
        allClasses: [
          { id: 'c1', trial_id: 't1', name: 'Containers', element: 'Containers' },
          { id: 'c3', trial_id: 't3', name: 'Buried', element: 'Buried' },
        ],
        judges: [],
      })
    );
    // sort-index → "i", "ii", "iii"; only t1 and t3 have entries.
    expect(props.runs.map(r => r.trialNumeral)).toEqual(['i', 'iii']);
  });

  // ─── primaryArmband derivation ────────────────────────────────────────────

  it('sets primaryArmband when every entry shares the same armband', () => {
    const props = buildMagazineConfirmationProps(makeOpts());
    expect(props.primaryArmband).toBe('247');
  });

  it('returns null primaryArmband when entries have different armbands', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        entries: [
          { id: 'e1', trial_id: 't1', class_id: 'c1', armband: '247', entry_fee: 2500 },
          { id: 'e2', trial_id: 't2', class_id: 'c2', armband: '248', entry_fee: 2200 },
        ],
      })
    );
    expect(props.primaryArmband).toBeNull();
  });

  it('returns null primaryArmband when no entries have an armband assigned', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        entries: [
          { id: 'e1', trial_id: 't1', class_id: 'c1', armband: null, entry_fee: 2500 },
        ],
      })
    );
    expect(props.primaryArmband).toBeNull();
  });

  // ─── editionLabel fallback ────────────────────────────────────────────────

  it('defaults editionLabel to "Edition · {year}" derived from show.start_date', () => {
    const props = buildMagazineConfirmationProps(makeOpts());
    expect(props.editionLabel).toBe('Edition · 2026');
  });

  it('uses settings.editionLabel override when provided', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({ settings: { editionLabel: 'Vol LXXIX · Spring 2026' } })
    );
    expect(props.editionLabel).toBe('Vol LXXIX · Spring 2026');
  });

  it('falls back to "Edition" with no year when start_date is unparseable', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        show: {
          name: 'X',
          start_date: '',
          end_date: '',
        },
      })
    );
    // Empty start_date → new Date('T00:00:00') is Invalid → getFullYear NaN;
    // helper code returns the plain "Edition" string.
    expect(props.editionLabel).toMatch(/^Edition/);
  });

  // ─── Trial-chair detection ────────────────────────────────────────────────

  it('detects the trial chair by role regex (matches "Chair")', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        officers: [
          { role: 'Trial Chair', name: 'Sarah Whitman' },
          { role: 'Treasurer', name: 'Marcia Liu' },
        ],
      })
    );
    expect(props.trialChairName).toBe('Sarah Whitman');
    expect(props.trialChairTitle).toBe('Trial Chair, Bexar County Kennel Club');
  });

  it('detects the trial chair by role regex (matches "President")', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        officers: [{ role: 'President', name: 'Eleanor Park' }],
      })
    );
    expect(props.trialChairName).toBe('Eleanor Park');
  });

  it('returns null trial chair when no officer matches the regex', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        officers: [
          { role: 'Treasurer', name: 'Marcia Liu' },
          { role: 'Volunteers', name: 'Kevin O\'Brien' },
        ],
      })
    );
    expect(props.trialChairName).toBeNull();
    expect(props.trialChairTitle).toBeNull();
  });

  // ─── Other contract assertions ────────────────────────────────────────────

  it('formats date range with en-dash for same-month shows', () => {
    const props = buildMagazineConfirmationProps(makeOpts());
    expect(props.dateRange).toBe('12–14 June 2026');
  });

  it('formats date range across months', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        show: {
          name: 'Cross-Month Trial',
          start_date: '2026-06-30',
          end_date: '2026-07-02',
        },
      })
    );
    expect(props.dateRange).toBe('30 June – 2 July 2026');
  });

  it('builds the salutation from handler first + last name', () => {
    const props = buildMagazineConfirmationProps(makeOpts());
    expect(props.salutation).toBe('Ms. Patricia Holloway');
  });

  it('falls back to "Exhibitor" when handler has no name parts', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({ handler: { email: 'anon@example.com' } })
    );
    expect(props.salutation).toBe('Exhibitor');
  });

  it('totals the entry fees from cents to dollar string', () => {
    const props = buildMagazineConfirmationProps(makeOpts());
    // 2500 + 2200 + 2200 = 6900 cents = $69.00
    expect(props.totalFeesFormatted).toBe('$69.00');
  });

  it('falls back to $25-per-entry placeholder when no entry_fee is set', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        entries: [
          { id: 'e1', trial_id: 't1', class_id: 'c1', armband: null, entry_fee: null },
          { id: 'e2', trial_id: 't2', class_id: 'c2', armband: null, entry_fee: null },
        ],
      })
    );
    expect(props.totalFeesFormatted).toBe('$50.00');
  });

  it('builds the venueNameAndAddress string from show.venue + address parts', () => {
    const props = buildMagazineConfirmationProps(makeOpts());
    expect(props.venueNameAndAddress).toBe(
      'Live Oak Civic Center\n8101 Pat Booker Rd, Live Oak, TX'
    );
  });

  it('returns null venue when venue_name is missing', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        show: {
          name: 'Venueless',
          start_date: '2026-06-12',
          end_date: '2026-06-14',
        },
      })
    );
    expect(props.venueNameAndAddress).toBeNull();
  });

  it('runs are sorted by display_order even when entries are unordered', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        entries: [
          // Submit out-of-order on purpose
          { id: 'e3', trial_id: 't3', class_id: 'c3', armband: '247', entry_fee: 2200 },
          { id: 'e1', trial_id: 't1', class_id: 'c1', armband: '247', entry_fee: 2500 },
          { id: 'e2', trial_id: 't2', class_id: 'c2', armband: '247', entry_fee: 2200 },
        ],
      })
    );
    expect(props.runs.map(r => r.trialNumeral)).toEqual(['i', 'ii', 'iii']);
  });

  it('renders a "—" placeholder for runs whose trial is missing from allTrials', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        entries: [
          { id: 'orphan', trial_id: 'unknown-trial', class_id: null, armband: null, entry_fee: 2500 },
        ],
      })
    );
    expect(props.runs[0].trialNumeral).toBe('—');
    expect(props.runs[0].dayLabel).toBe('—');
    expect(props.runs[0].classLabel).toBe('—');
  });

  it('passes through optional settings to the corresponding props', () => {
    const props = buildMagazineConfirmationProps(
      makeOpts({
        settings: {
          doorsTime: '7:00 AM',
          firstClassTime: '8:30 AM',
          parkingNotes: 'On-site, free.',
          hospitalityNotes: 'Lunch on site.',
          cratingNotes: 'Adjacent ballroom.',
          secretaryEmail: 'secretary@bckc.org',
          secretaryPhone: '(210) 555-0142',
          trialUrl: 'https://myk9show.com/bckc-spring-2026',
          showSlug: 'bckc-spring-2026',
          licenseReference: 'License № 2026-2841',
        },
      })
    );
    expect(props.doorsTime).toBe('7:00 AM');
    expect(props.firstClassTime).toBe('8:30 AM');
    expect(props.parkingNotes).toBe('On-site, free.');
    expect(props.hospitalityNotes).toBe('Lunch on site.');
    expect(props.cratingNotes).toBe('Adjacent ballroom.');
    expect(props.secretaryEmail).toBe('secretary@bckc.org');
    expect(props.secretaryPhone).toBe('(210) 555-0142');
    expect(props.trialUrl).toBe('https://myk9show.com/bckc-spring-2026');
    expect(props.showSlug).toBe('bckc-spring-2026');
    expect(props.licenseReference).toBe('License № 2026-2841');
  });
});
