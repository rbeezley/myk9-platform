import { describe, it, expect } from 'vitest';
import {
  buildRegistrationIndexes,
  emptyRegistrationIndexes,
} from '@/store/buildRegistrationIndexes';
import {
  EntryStatus,
  PaymentStatus,
  type ShowRegistration,
  type ShowEntry,
  type ClassEntry,
} from '@/types/show-registration-types';

const cls = (id: string, entryId: string): ClassEntry => ({
  id,
  entryId,
  classId: `class-${id}`,
  className: 'Novice A',
  classNumber: '1',
  fee: 25,
  status: 'entered',
});

const entry = (id: string, registrationId: string, classes: ClassEntry[] = []): ShowEntry => ({
  id,
  registrationId,
  dogId: `dog-${id}`,
  dogName: 'Rex',
  trialId: 'trial-1',
  trialName: 'Trial 1',
  classes,
  handlerName: 'Alice',
});

const reg = (id: string, entries: ShowEntry[] = []): ShowRegistration => ({
  id,
  showId: 'show-1',
  userId: 'user-1',
  status: 'draft',
  totalFees: 0,
  paymentStatus: PaymentStatus.PENDING,
  entryStatus: EntryStatus.PENDING,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  entries,
  statusHistory: [],
});

describe('emptyRegistrationIndexes', () => {
  it('returns three empty objects', () => {
    expect(emptyRegistrationIndexes()).toEqual({
      registrationsById: {},
      entriesById: {},
      classesById: {},
    });
  });

  it('returns fresh objects each call (no shared mutation)', () => {
    const a = emptyRegistrationIndexes();
    const b = emptyRegistrationIndexes();
    a.registrationsById['x'] = reg('x');
    expect(b.registrationsById).toEqual({});
  });
});

describe('buildRegistrationIndexes', () => {
  it('returns empty indexes for null', () => {
    expect(buildRegistrationIndexes(null)).toEqual(emptyRegistrationIndexes());
  });

  it('returns empty indexes for undefined', () => {
    expect(buildRegistrationIndexes(undefined)).toEqual(emptyRegistrationIndexes());
  });

  it('returns empty indexes for an empty array', () => {
    expect(buildRegistrationIndexes([])).toEqual(emptyRegistrationIndexes());
  });

  it('indexes a single registration with no entries', () => {
    const r = reg('r1');
    const result = buildRegistrationIndexes([r]);
    expect(result.registrationsById).toEqual({ r1: r });
    expect(result.entriesById).toEqual({});
    expect(result.classesById).toEqual({});
  });

  it('indexes registrations, entries, and classes by id', () => {
    const c1 = cls('c1', 'e1');
    const c2 = cls('c2', 'e1');
    const c3 = cls('c3', 'e2');
    const e1 = entry('e1', 'r1', [c1, c2]);
    const e2 = entry('e2', 'r1', [c3]);
    const r1 = reg('r1', [e1, e2]);
    const r2 = reg('r2');

    const result = buildRegistrationIndexes([r1, r2]);

    expect(result.registrationsById).toEqual({ r1, r2 });
    expect(result.entriesById).toEqual({ e1, e2 });
    expect(result.classesById).toEqual({ c1, c2, c3 });
  });

  it('handles a registration with undefined entries (defensive against legacy state)', () => {
    const malformed = { ...reg('r1'), entries: undefined as unknown as ShowEntry[] };
    expect(() => buildRegistrationIndexes([malformed])).not.toThrow();
    const result = buildRegistrationIndexes([malformed]);
    expect(result.registrationsById['r1']).toBe(malformed);
    expect(result.entriesById).toEqual({});
  });

  it('handles an entry with undefined classes', () => {
    const malformed = { ...entry('e1', 'r1'), classes: undefined as unknown as ClassEntry[] };
    const r = reg('r1', [malformed]);
    expect(() => buildRegistrationIndexes([r])).not.toThrow();
    const result = buildRegistrationIndexes([r]);
    expect(result.entriesById['e1']).toBe(malformed);
    expect(result.classesById).toEqual({});
  });

  it('later entities with the same id win (last-write-wins semantics)', () => {
    const a = reg('dup');
    const b = { ...reg('dup'), userId: 'different' };
    const result = buildRegistrationIndexes([a, b]);
    expect(result.registrationsById['dup']).toBe(b);
  });
});
