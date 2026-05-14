import { beforeEach, describe, expect, it } from 'vitest';
import { EntryLimitChecker } from '@/services/entries/EntryLimitChecker';
import { EntryStatus as RegistrationEntryStatus } from '@/types/show-registration-types';
import type { ShowEntry, ShowEntryInput } from '@/store/entryStore';
import type { Class, Show, Trial } from '@/types/show-types';
import type { Dog } from '@/types/dog-types';

const submittedAt = '2026-06-12T14:00:00.000Z';

function makeEntry(overrides: Partial<ShowEntry> = {}): ShowEntry {
  const id = overrides.id ?? `entry-${overrides.dogId ?? 'dog'}`;

  return {
    id,
    showId: overrides.showId ?? 'waitlist-show-001',
    classId: overrides.classId ?? 'waitlist-class-001',
    dogId: overrides.dogId ?? 'dog-001',
    status: overrides.status ?? 'confirmed',
    registrationData: {
      submittedAt,
      handler: 'Test Handler',
      entryFee: 25,
      paymentStatus: 'paid',
      ...overrides.registrationData,
    },
    statusHistory: [],
    createdAt: submittedAt,
    updatedAt: submittedAt,
    ...overrides,
  };
}

function makeEntryInput(overrides: Partial<ShowEntryInput> = {}): ShowEntryInput {
  return {
    showId: overrides.showId ?? 'waitlist-show-001',
    classId: overrides.classId ?? 'waitlist-class-001',
    dogId: overrides.dogId ?? 'dog-001',
    registrationData: {
      submittedAt,
      handler: 'Test Handler',
      entryFee: 25,
      paymentStatus: 'pending',
      ...overrides.registrationData,
    },
  };
}

function makeClass(overrides: Partial<Class> = {}): Class {
  return {
    id: overrides.id ?? 'waitlist-class-001',
    name: overrides.name ?? 'Waitlist Test Class',
    maxEntries: overrides.maxEntries ?? 2,
    allowWaitlist: overrides.allowWaitlist ?? true,
    ...overrides,
  } as Class;
}

function makeTrial(classes: Class[], overrides: Partial<Trial> = {}): Trial {
  return {
    id: overrides.id ?? 'waitlist-trial-001',
    name: overrides.name ?? 'Waitlist Test Trial',
    classes,
    ...overrides,
  } as Trial;
}

function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: overrides.id ?? 'waitlist-show-001',
    name: overrides.name ?? 'Waitlist Test Show',
    trials: [],
    ...overrides,
  } as Show;
}

function waitlistedEntriesForClass(classId: string, entries: ShowEntry[]) {
  return entries
    .filter(
      entry =>
        entry.classId === classId &&
        ((entry.status as string) === 'waitlist' ||
          entry.status === RegistrationEntryStatus.WAITLIST)
    )
    .sort(
      (a, b) =>
        new Date(a.registrationData.submittedAt).getTime() -
        new Date(b.registrationData.submittedAt).getTime()
    );
}

describe('Phase 3.4: Entry Limits and Waitlists - Converted Service Coverage', () => {
  let entries: ShowEntry[];

  beforeEach(() => {
    entries = [];
  });

  it('enforces class capacity and returns waitlist placement for overflow entries', () => {
    const classData = makeClass({ maxEntries: 3, allowWaitlist: true });
    const trial = makeTrial([classData], { maxEntriesPerDog: 5, maxTotalEntries: 100 });
    const show = makeShow({ maxEntriesPerDog: 5, maxTotalEntries: 100, trials: [trial] });

    const decisions = Array.from({ length: 5 }, (_, index) => {
      const dog: Dog = {
        id: `capacity-dog-${index + 1}`,
        name: `Dog ${index + 1}`,
      } as Dog;
      const entryData = makeEntryInput({
        showId: show.id,
        classId: classData.id,
        dogId: dog.id,
        registrationData: { handler: `Handler ${index + 1}` },
      });

      const limitCheck = EntryLimitChecker.checkEntryLimits(entryData, {
        show,
        trial,
        class: classData,
        dog,
        existingEntries: entries,
      });

      const status = limitCheck.isWaitlisted ? RegistrationEntryStatus.WAITLIST : 'confirmed';
      entries.push(
        makeEntry({
          id: `capacity-entry-${index + 1}`,
          showId: entryData.showId,
          classId: entryData.classId,
          dogId: entryData.dogId,
          status,
          registrationData: entryData.registrationData,
        })
      );

      return limitCheck;
    });

    const finalStats = EntryLimitChecker.getClassEntryStats(classData.id, entries, classData);

    expect(decisions.slice(0, 3).every(result => result.isAllowed && !result.isWaitlisted)).toBe(
      true
    );
    expect(decisions[3].isAllowed).toBe(true);
    expect(decisions[3].isWaitlisted).toBe(true);
    expect(decisions[3].waitlistPosition).toBe(1);
    expect(decisions[4].waitlistPosition).toBe(2);
    expect(finalStats.confirmed).toBe(3);
    expect(finalStats.waitlisted).toBe(2);
    expect(finalStats.isFull).toBe(true);
  });

  it('promotes the earliest waitlisted entry after a confirmed entry withdraws', () => {
    const classData = makeClass({ maxEntries: 2, allowWaitlist: true });

    entries = [
      makeEntry({ id: 'confirmed-1', dogId: 'confirmed-dog-1', status: 'confirmed' }),
      makeEntry({ id: 'confirmed-2', dogId: 'confirmed-dog-2', status: 'confirmed' }),
      makeEntry({
        id: 'waitlist-1',
        dogId: 'waitlist-dog-1',
        status: RegistrationEntryStatus.WAITLIST,
        registrationData: { submittedAt: '2026-06-12T15:00:00.000Z', paymentStatus: 'pending' },
      }),
      makeEntry({
        id: 'waitlist-2',
        dogId: 'waitlist-dog-2',
        status: RegistrationEntryStatus.WAITLIST,
        registrationData: { submittedAt: '2026-06-12T15:15:00.000Z', paymentStatus: 'pending' },
      }),
      makeEntry({
        id: 'waitlist-3',
        dogId: 'waitlist-dog-3',
        status: RegistrationEntryStatus.WAITLIST,
        registrationData: { submittedAt: '2026-06-12T15:30:00.000Z', paymentStatus: 'pending' },
      }),
    ];

    entries = entries.map(entry =>
      entry.id === 'confirmed-1' ? { ...entry, status: 'withdrawn' } : entry
    );

    const promotionCheck = EntryLimitChecker.checkWaitlistPromotion(
      classData.id,
      entries,
      classData
    );
    const [firstWaitlisted] = waitlistedEntriesForClass(classData.id, entries);
    entries = entries.map(entry =>
      entry.id === firstWaitlisted.id ? { ...entry, status: 'confirmed' } : entry
    );

    const finalStats = EntryLimitChecker.getClassEntryStats(classData.id, entries, classData);

    expect(promotionCheck).toEqual({ canPromote: true, spotsAvailable: 1 });
    expect(firstWaitlisted.dogId).toBe('waitlist-dog-1');
    expect(finalStats.confirmed).toBe(2);
    expect(finalStats.waitlisted).toBe(2);
    expect(finalStats.availableSpots).toBe(0);
  });

  it('coordinates limits across multiple classes with and without waitlists', () => {
    const popularClass = makeClass({
      id: 'concurrent-class-001',
      name: 'Popular Class',
      maxEntries: 2,
      allowWaitlist: true,
    });
    const largeClass = makeClass({
      id: 'concurrent-class-002',
      name: 'Large Class',
      maxEntries: 3,
      allowWaitlist: false,
    });
    const trial = makeTrial([popularClass, largeClass]);
    const show = makeShow({ id: 'concurrent-show-001', trials: [trial], maxEntriesPerDog: 5 });

    const attempts = [
      ['dog-1', popularClass],
      ['dog-2', popularClass],
      ['dog-3', popularClass],
      ['dog-4', popularClass],
      ['dog-1', largeClass],
      ['dog-2', largeClass],
      ['dog-3', largeClass],
      ['dog-4', largeClass],
    ] as const;

    for (const [dogId, classData] of attempts) {
      const entryData = makeEntryInput({
        showId: show.id,
        classId: classData.id,
        dogId,
      });
      const result = EntryLimitChecker.checkEntryLimits(entryData, {
        show,
        trial,
        class: classData,
        dog: { id: dogId, name: dogId } as Dog,
        existingEntries: entries,
      });

      if (result.isAllowed || result.isWaitlisted) {
        entries.push(
          makeEntry({
            id: `${classData.id}-${dogId}`,
            showId: show.id,
            classId: classData.id,
            dogId,
            status: result.isWaitlisted ? RegistrationEntryStatus.WAITLIST : 'confirmed',
            registrationData: entryData.registrationData,
          })
        );
      }
    }

    const popularStats = EntryLimitChecker.getClassEntryStats(
      popularClass.id,
      entries,
      popularClass
    );
    const largeStats = EntryLimitChecker.getClassEntryStats(largeClass.id, entries, largeClass);

    expect(popularStats.confirmed).toBe(2);
    expect(popularStats.waitlisted).toBe(2);
    expect(largeStats.confirmed).toBe(3);
    expect(largeStats.waitlisted).toBe(0);
    expect(entries.filter(entry => entry.classId === largeClass.id)).toHaveLength(3);
  });

  it('enforces show-level limits before adding more class entries', () => {
    const firstClass = makeClass({ id: 'show-class-001', maxEntries: 5 });
    const secondClass = makeClass({ id: 'show-class-002', maxEntries: 5 });
    const trial = makeTrial([firstClass, secondClass], { maxTotalEntries: 8 });
    const show = makeShow({
      id: 'show-limit-test-001',
      maxTotalEntries: 8,
      maxEntriesPerDog: 3,
      trials: [trial],
    });

    entries = Array.from({ length: 8 }, (_, index) =>
      makeEntry({
        id: `show-entry-${index + 1}`,
        showId: show.id,
        classId: index % 2 === 0 ? firstClass.id : secondClass.id,
        dogId: `dog-${index + 1}`,
        status: 'confirmed',
      })
    );

    const result = EntryLimitChecker.checkEntryLimits(
      makeEntryInput({
        showId: show.id,
        classId: firstClass.id,
        dogId: 'dog-9',
      }),
      {
        show,
        trial,
        class: firstClass,
        dog: { id: 'dog-9', name: 'Dog 9' } as Dog,
        existingEntries: entries,
      }
    );

    expect(result.isAllowed).toBe(false);
    expect(result.errors.some(error => error.code === 'SHOW_FULL')).toBe(true);
    expect(entries.filter(entry => entry.showId === show.id)).toHaveLength(8);
  });
});
