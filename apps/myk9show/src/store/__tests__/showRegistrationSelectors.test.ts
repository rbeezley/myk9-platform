import { describe, it, expect } from 'vitest';
import {
  selectRegistration,
  selectRegistrationsByShow,
  selectRegistrationsByUser,
  selectCurrentRegistration,
  selectEntry,
  selectEntriesForRegistration,
  selectClass,
  selectClassesForEntry,
  selectArmbandsByShow,
  selectArmbandConflict,
  selectStatusHistory,
  type ShowRegistrationState,
} from '@/store/showRegistrationSelectors';
import { buildRegistrationIndexes } from '@/store/buildRegistrationIndexes';
import {
  EntryStatus,
  PaymentStatus,
  type ShowRegistration,
  type ShowEntry,
  type ClassEntry,
  type StatusChange,
} from '@/types/show-registration-types';

const cls = (overrides: Partial<ClassEntry>): ClassEntry => ({
  id: 'cls-1',
  entryId: 'entry-1',
  classId: 'class-1',
  className: 'Novice A',
  classNumber: '1',
  fee: 25,
  status: 'entered',
  ...overrides,
});

const entry = (overrides: Partial<ShowEntry>): ShowEntry => ({
  id: 'entry-1',
  registrationId: 'reg-1',
  dogId: 'dog-1',
  dogName: 'Rex',
  trialId: 'trial-1',
  trialName: 'Trial 1',
  classes: [],
  handlerName: 'Alice',
  ...overrides,
});

const reg = (overrides: Partial<ShowRegistration>): ShowRegistration => ({
  id: 'reg-1',
  showId: 'show-1',
  userId: 'user-1',
  status: 'draft',
  totalFees: 0,
  paymentStatus: PaymentStatus.PENDING,
  entryStatus: EntryStatus.PENDING,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  entries: [],
  statusHistory: [],
  ...overrides,
});

// Build a full ShowRegistrationState from registrations[], auto-populating byId.
const makeState = (
  registrations: ShowRegistration[],
  extra: Partial<ShowRegistrationState> = {}
): ShowRegistrationState => ({
  registrations,
  currentRegistration: null,
  draftData: {},
  registrationContext: null,
  ...buildRegistrationIndexes(registrations),
  ...extra,
});

const emptyState = makeState([]);

describe('selectRegistration', () => {
  it('returns the registration with the matching id', () => {
    const r = reg({ id: 'reg-42' });
    const state = makeState([r]);
    expect(selectRegistration(state, 'reg-42')).toEqual(r);
  });

  it('returns undefined when not found', () => {
    expect(selectRegistration(emptyState, 'missing')).toBeUndefined();
  });
});

describe('selectRegistrationsByShow', () => {
  it('returns only registrations for the given show', () => {
    const a = reg({ id: 'a', showId: 'show-1' });
    const b = reg({ id: 'b', showId: 'show-2' });
    const c = reg({ id: 'c', showId: 'show-1' });
    const state = makeState([a, b, c]);
    const result = selectRegistrationsByShow(state, 'show-1');
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(['a', 'c']);
  });

  it('returns [] when none match', () => {
    expect(selectRegistrationsByShow(emptyState, 'show-1')).toEqual([]);
  });
});

describe('selectRegistrationsByUser', () => {
  it('returns only registrations for the given user', () => {
    const a = reg({ id: 'a', userId: 'u-1' });
    const b = reg({ id: 'b', userId: 'u-2' });
    const state = makeState([a, b]);
    const result = selectRegistrationsByUser(state, 'u-1');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('a');
  });
});

describe('selectCurrentRegistration', () => {
  it('returns the currentRegistration field as-is', () => {
    const r = reg({});
    expect(selectCurrentRegistration({ ...emptyState, currentRegistration: r })).toBe(r);
    expect(selectCurrentRegistration(emptyState)).toBeNull();
  });
});

describe('selectEntry', () => {
  it('returns the entry inside the matching registration', () => {
    const e = entry({ id: 'entry-7' });
    const r = reg({ id: 'reg-1', entries: [e] });
    const state = makeState([r]);
    expect(selectEntry(state, 'reg-1', 'entry-7')).toEqual(e);
  });

  it('returns undefined when registration is missing', () => {
    expect(selectEntry(emptyState, 'missing-reg', 'any-entry')).toBeUndefined();
  });

  it('returns undefined when entry is missing', () => {
    const r = reg({ id: 'reg-1', entries: [] });
    const state = makeState([r]);
    expect(selectEntry(state, 'reg-1', 'missing-entry')).toBeUndefined();
  });
});

describe('selectEntriesForRegistration', () => {
  it('returns the registration entries array', () => {
    const e1 = entry({ id: 'e1' });
    const e2 = entry({ id: 'e2' });
    const r = reg({ id: 'reg-1', entries: [e1, e2] });
    const state = makeState([r]);
    expect(selectEntriesForRegistration(state, 'reg-1')).toEqual([e1, e2]);
  });

  it('returns [] when registration is missing', () => {
    expect(selectEntriesForRegistration(emptyState, 'missing')).toEqual([]);
  });
});

describe('selectClass', () => {
  it('returns the matching class', () => {
    const c = cls({ id: 'cls-9', entryId: 'entry-1' });
    const e = entry({ id: 'entry-1', classes: [c] });
    const r = reg({ id: 'reg-1', entries: [e] });
    const state = makeState([r]);
    expect(selectClass(state, 'reg-1', 'entry-1', 'cls-9')).toEqual(c);
  });

  it('returns undefined when any link in the chain is missing', () => {
    expect(selectClass(emptyState, 'r', 'e', 'c')).toBeUndefined();
  });
});

describe('selectClassesForEntry', () => {
  it('returns the entry classes array', () => {
    const c1 = cls({ id: 'c1', entryId: 'entry-1' });
    const c2 = cls({ id: 'c2', entryId: 'entry-1' });
    const e = entry({ id: 'entry-1', classes: [c1, c2] });
    const r = reg({ id: 'reg-1', entries: [e] });
    const state = makeState([r]);
    expect(selectClassesForEntry(state, 'reg-1', 'entry-1')).toEqual(expect.arrayContaining([c1, c2]));
    expect(selectClassesForEntry(state, 'reg-1', 'entry-1')).toHaveLength(2);
  });

  it('returns [] when entry is missing', () => {
    expect(selectClassesForEntry(emptyState, 'r', 'e')).toEqual([]);
  });
});

describe('selectArmbandsByShow', () => {
  it('returns armband assignments scoped to the show, including only entries with assignments', () => {
    const e1 = entry({
      id: 'e1',
      registrationId: 'r1',
      armbandAssignment: { number: '101' },
    });
    const e2 = entry({ id: 'e2', registrationId: 'r1' });
    const e3 = entry({
      id: 'e3',
      registrationId: 'r2',
      armbandAssignment: { number: '202' },
    });
    const r1 = reg({ id: 'r1', showId: 'show-1', entries: [e1, e2] });
    const r2 = reg({ id: 'r2', showId: 'show-2', entries: [e3] });
    const state = makeState([r1, r2]);

    expect(selectArmbandsByShow(state, 'show-1')).toEqual([
      { entryId: 'e1', armband: { number: '101' } },
    ]);
  });
});

describe('selectArmbandConflict', () => {
  const e1 = entry({ id: 'e1', registrationId: 'r', armbandAssignment: { number: '101' } });
  const r = reg({ id: 'r', showId: 'show-1', entries: [e1] });
  const state = makeState([r]);

  it('returns true when the armband is already assigned', () => {
    expect(selectArmbandConflict(state, 'show-1', '101')).toBe(true);
  });

  it('returns false when the armband is unused', () => {
    expect(selectArmbandConflict(state, 'show-1', '999')).toBe(false);
  });

  it('returns false when the conflicting entry is excluded (renumbering itself)', () => {
    expect(selectArmbandConflict(state, 'show-1', '101', 'e1')).toBe(false);
  });
});

describe('selectStatusHistory', () => {
  it('returns the registration statusHistory array', () => {
    const change: StatusChange = {
      id: 'sc-1',
      registrationId: 'reg-1',
      changeType: 'entry_status',
      fromStatus: EntryStatus.PENDING,
      toStatus: EntryStatus.ACCEPTED,
      changedAt: new Date('2026-01-01'),
      changedByUserId: 'user-1',
    };
    const r = reg({ id: 'reg-1', statusHistory: [change] });
    const state = makeState([r]);
    expect(selectStatusHistory(state, 'reg-1')).toEqual([change]);
  });

  it('returns [] when the registration is missing or has no history', () => {
    expect(selectStatusHistory(emptyState, 'missing')).toEqual([]);
    const r = reg({ id: 'reg-1', statusHistory: undefined });
    const state = makeState([r]);
    expect(selectStatusHistory(state, 'reg-1')).toEqual([]);
  });
});
