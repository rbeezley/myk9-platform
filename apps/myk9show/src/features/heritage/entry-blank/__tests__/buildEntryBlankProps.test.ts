import { describe, it, expect } from 'vitest';
import { buildEntryBlankProps } from '../buildEntryBlankProps';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SHOW = {
  id: 'show-1',
  name: 'Spring Scent Work Trial 2026',
  club_id: 'club-1',
  start_date: '2026-06-12',
  end_date: '2026-06-14',
  entry_close_date: '2026-06-03',
  pre_entry_fee: 25,
  day_of_show_fee: 28,
  venue_name: 'Bexar County Fairgrounds',
  city: 'San Antonio',
  state: 'TX',
  address: '200 Fair Ave',
  zip_code: '78212',
  organization: 'AKC',
} as const;

const TRIALS = [
  {
    id: 'trial-1',
    show_id: 'show-1',
    name: 'Trial I',
    date: '2026-06-12',
    trial_number: 'I',
    display_order: 1,
    timezone: 'America/Chicago',
    registry_id: 'AKC',
  },
  {
    id: 'trial-2',
    show_id: 'show-1',
    name: 'Trial II',
    date: '2026-06-13',
    trial_number: 'II',
    display_order: 2,
    timezone: 'America/Chicago',
    registry_id: 'AKC',
  },
];

const CLASSES = [
  {
    id: 'cls-1',
    trial_id: 'trial-1',
    name: 'Containers · Interiors · Buried',
    element: 'Containers',
    level: 'Novice',
    entry_fee: 25,
  },
];

const JUDGES = [
  { trial_id: 'trial-1', judgeName: 'C. Beagles' },
  { trial_id: 'trial-2', judgeName: 'M. Whitfield' },
];

const CLUB = { name: 'Bexar County Kennel Club' };

const SECRETARY = {
  name: 'James Nakamura',
  poBox: 'PO Box 4421',
  cityStateZip: 'San Antonio, TX 78212',
  email: 'secretary@bckc.org',
};

// ─── Blank mode ───────────────────────────────────────────────────────────────

describe('buildEntryBlankProps — blank mode', () => {
  const props = buildEntryBlankProps({
    show: SHOW,
    trials: TRIALS,
    classes: CLASSES,
    judges: JUDGES,
    club: CLUB,
    secretary: SECRETARY,
  });

  it('sets licenseLanguage from AKC registry', () => {
    expect(props.licenseLanguage).toBe('An A.K.C. Licensed Trial');
  });

  it('builds one trial row per trial with checked=false', () => {
    expect(props.trials).toHaveLength(2);
    expect(props.trials[0].numeral).toBe('I');
    expect(props.trials[0].checked).toBe(false);
    expect(props.trials[1].numeral).toBe('II');
    expect(props.trials[1].checked).toBe(false);
  });

  it('all dog fields are null', () => {
    expect(props.dog.registeredName).toBeNull();
    expect(props.dog.callName).toBeNull();
    expect(props.dog.breed).toBeNull();
    expect(props.dog.registrationNumber).toBeNull();
  });

  it('all owner fields are null', () => {
    expect(props.owner.ownerName).toBeNull();
    expect(props.owner.email).toBeNull();
  });

  it('totalAmount is null in blank mode', () => {
    expect(props.fees.totalAmount).toBeNull();
  });

  it('paymentMethod is null in blank mode', () => {
    expect(props.fees.paymentMethod).toBeNull();
  });

  it('clubName comes from club fixture', () => {
    expect(props.clubName).toBe('Bexar County Kennel Club');
  });
});

// ─── Pre-filled mode ──────────────────────────────────────────────────────────

const DOG = {
  id: 'dog-1',
  name: 'Riverside Quantum Leap',
  call_name: 'Quill',
  breed: 'Labrador Retriever',
  color: 'Black',
  sex: 'M',
  date_of_birth: '2021-03-15',
  akc_number: 'DN70123456',
  owner_id: 'person-1',
};

const HANDLER = {
  id: 'person-1',
  first_name: 'Sarah',
  last_name: 'Nakamura',
  email: 'sarah@example.com',
  phone: '210-555-0199',
  address: '411 River Walk',
  city: 'San Antonio',
  state: 'TX',
  zip_code: '78205',
};

const ENTRY = {
  id: 'entry-1',
  dog_id: 'dog-1',
  handler_id: 'person-1',
  trial_id: 'trial-1',
  class_id: 'cls-1',
  entry_fee: 25,
  payment_status: 'paid',
  handler: null,
};

describe('buildEntryBlankProps — pre-filled mode', () => {
  const props = buildEntryBlankProps({
    show: SHOW,
    trials: TRIALS,
    classes: CLASSES,
    judges: JUDGES,
    club: CLUB,
    secretary: SECRETARY,
    entry: ENTRY,
    dog: DOG,
    handler: HANDLER,
  });

  it('marks trial-1 row checked', () => {
    const row = props.trials.find(r => r.numeral === 'I');
    expect(row?.checked).toBe(true);
  });

  it('leaves trial-2 row unchecked', () => {
    const row = props.trials.find(r => r.numeral === 'II');
    expect(row?.checked).toBe(false);
  });

  it('populates dog fields from dog fixture', () => {
    expect(props.dog.registeredName).toBe('Riverside Quantum Leap');
    expect(props.dog.callName).toBe('Quill');
    expect(props.dog.breed).toBe('Labrador Retriever');
    expect(props.dog.registrationNumber).toBe('DN70123456');
    expect(props.dog.sex).toBe('M');
  });

  it('populates owner from handler fixture', () => {
    expect(props.owner.ownerName).toBe('Sarah Nakamura');
    expect(props.owner.email).toBe('sarah@example.com');
  });

  it('sets totalAmount from entry_fee', () => {
    expect(props.fees.totalAmount).toBe('$25.00');
  });

  it('marks the correct level cell checked', () => {
    const noviceContainer = props.levelCells.find(
      c => c.level === 'Novice' && c.element === 'Containers'
    );
    expect(noviceContainer?.checked).toBe(true);
  });

  it('other level cells are unchecked', () => {
    const others = props.levelCells.filter(c => !c.checked);
    expect(others.length).toBeGreaterThan(0);
  });

  it('paymentMethod is null when payment_status is "paid" (not a mail-in method)', () => {
    const propsWithPaid = buildEntryBlankProps({
      show: SHOW,
      trials: TRIALS,
      classes: CLASSES,
      judges: JUDGES,
      club: CLUB,
      secretary: SECRETARY,
      entry: { ...ENTRY, payment_status: 'paid' },
      dog: DOG,
      handler: HANDLER,
    });
    expect(propsWithPaid.fees.paymentMethod).toBeNull();
  });

  it('closeDate is null when show has no entry_close_date', () => {
    const propsNullClose = buildEntryBlankProps({
      show: { ...SHOW, entry_close_date: null },
      trials: TRIALS,
      classes: CLASSES,
      judges: JUDGES,
      club: CLUB,
      secretary: SECRETARY,
      entry: ENTRY,
      dog: DOG,
      handler: HANDLER,
    });
    expect(propsNullClose.closeDate).toBeNull();
  });
});
