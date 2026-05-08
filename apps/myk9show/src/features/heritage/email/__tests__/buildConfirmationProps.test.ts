import { describe, it, expect } from 'vitest';
import { buildConfirmationProps } from '../buildConfirmationProps';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SHOW = {
  name: 'Spring Scent Work Trial',
  start_date: '2026-06-12',
  end_date: '2026-06-14',
  venue_name: 'Live Oak Civic Center',
  city: 'Live Oak',
  state: 'TX',
  address: '8001 Shin Oak Dr',
};

const TRIALS = [
  {
    id: 't1',
    date: '2026-06-12',
    trial_number: 'I',
    display_order: 1,
    timezone: 'America/Chicago',
  },
  {
    id: 't2',
    date: '2026-06-13',
    trial_number: 'III',
    display_order: 2,
    timezone: 'America/Chicago',
  },
  {
    id: 't3',
    date: '2026-06-14',
    trial_number: 'V',
    display_order: 3,
    timezone: 'America/Chicago',
  },
];

const CLASSES = [
  {
    id: 'c1',
    trial_id: 't1',
    name: 'Excellent Containers',
    level: 'Excellent',
    element: 'Containers',
  },
  {
    id: 'c2',
    trial_id: 't2',
    name: 'Excellent Interiors',
    level: 'Excellent',
    element: 'Interiors',
  },
  { id: 'c3', trial_id: 't3', name: 'Excellent Buried', level: 'Excellent', element: 'Buried' },
];

const JUDGES = [
  { trial_id: 't1', judgeName: 'C. Beagles' },
  { trial_id: 't2', judgeName: 'C. Beagles' },
  { trial_id: 't3', judgeName: 'C. Beagles' },
];

const ENTRIES = [
  { id: 'e1', trial_id: 't1', class_id: 'c1', armband: '142', entry_fee: 2500 },
  { id: 'e2', trial_id: 't2', class_id: 'c2', armband: '142', entry_fee: 2200 },
  { id: 'e3', trial_id: 't3', class_id: 'c3', armband: '142', entry_fee: 2200 },
];

const DOG = {
  name: "GCh. Ridgeway's Wandering Cooper, CGC",
  call_name: 'Cooper',
  breed: 'Labrador Retriever',
  sex: 'M',
};

const HANDLER = { first_name: 'Patricia', last_name: 'Holloway', email: 'pat@example.com' };

const CLUB = {
  name: 'Bexar County Kennel Club',
  established: 'MCMXLVII',
  city: 'San Antonio',
  state: 'TX',
};

const BASE_OPTS = {
  show: SHOW,
  allTrials: TRIALS,
  allClasses: CLASSES,
  judges: JUDGES,
  entries: ENTRIES,
  dog: DOG,
  handler: HANDLER,
  club: CLUB,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildConfirmationProps', () => {
  it('builds salutation from handler name', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    expect(props.salutation).toBe('Patricia Holloway');
  });

  it('builds dateRange in Heritage European format', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    expect(props.dateRange).toContain('12');
    expect(props.dateRange).toContain('14');
    expect(props.dateRange).toContain('June');
    expect(props.dateRange).toContain('2026');
  });

  it('sets club name and established', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    expect(props.clubName).toBe('Bexar County Kennel Club');
    expect(props.clubEstablished).toBe('MCMXLVII');
  });

  it('builds venue string from show address', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    expect(props.venueNameAndAddress).toContain('Live Oak Civic Center');
    expect(props.venueNameAndAddress).toContain('8001 Shin Oak Dr');
  });

  it('builds one run per entry sorted by display_order', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    expect(props.runs).toHaveLength(3);
    expect(props.runs[0].trialNumeral).toBe('I');
    expect(props.runs[1].trialNumeral).toBe('III');
    expect(props.runs[2].trialNumeral).toBe('V');
  });

  it('populates class label as level · element', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    expect(props.runs[0].classLabel).toBe('Excellent · Containers');
  });

  it('sets armband from entry', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    expect(props.runs[0].armband).toBe('142');
  });

  it('sets judge name', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    expect(props.runs[0].judgeName).toBe('C. Beagles');
  });

  it('calculates runCount', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    expect(props.runCount).toBe(3);
  });

  it('formats total fees from entry_fee cents', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    // 2500 + 2200 + 2200 = 6900 cents = $69.00
    expect(props.totalFeesFormatted).toBe('$69.00');
  });

  it('uses AKC memberClubLanguage from registry', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    expect(props.memberClubLanguage).toBe('A member club of the American Kennel Club');
  });

  it('all optional fields are null when settings omitted', () => {
    const props = buildConfirmationProps(BASE_OPTS);
    expect(props.doorsTime).toBeNull();
    expect(props.secretaryEmail).toBeNull();
    expect(props.trialUrl).toBeNull();
    expect(props.trialChairName).toBeNull();
    expect(props.receiptNumber).toBeNull();
  });

  it('wires settings through correctly', () => {
    const props = buildConfirmationProps({
      ...BASE_OPTS,
      settings: {
        doorsTime: '7:00 AM',
        secretaryEmail: 'sec@bckc.org',
        secretaryPhone: '210-555-0100',
        trialUrl: 'https://bckc.org/spring-2026',
        showSlug: 'bckc-spring-2026',
      },
    });
    expect(props.doorsTime).toBe('7:00 AM');
    expect(props.secretaryEmail).toBe('sec@bckc.org');
    expect(props.trialUrl).toBe('https://bckc.org/spring-2026');
  });

  it('finds trial chair from officers list', () => {
    const props = buildConfirmationProps({
      ...BASE_OPTS,
      officers: [{ role: 'Trial Chair', name: 'Sarah Whitman' }],
    });
    expect(props.trialChairName).toBe('Sarah Whitman');
    expect(props.trialChairTitle).toContain('Trial Chair');
  });

  it('falls back to toRoman when trial_number absent', () => {
    const props = buildConfirmationProps({
      ...BASE_OPTS,
      allTrials: [
        { id: 't1', date: '2026-06-12', display_order: 1, timezone: 'America/Chicago' },
        { id: 't2', date: '2026-06-13', display_order: 2, timezone: 'America/Chicago' },
      ],
      entries: [{ id: 'e1', trial_id: 't1', class_id: 'c1', armband: '10', entry_fee: 2500 }],
    });
    expect(props.runs[0].trialNumeral).toBe('I');
  });
});
