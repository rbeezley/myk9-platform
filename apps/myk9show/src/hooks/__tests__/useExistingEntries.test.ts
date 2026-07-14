import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useExistingEntries } from '../useExistingEntries';
import { createChainableQuery, mockSupabase } from '@/test/mocks/supabase';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import { EntryStatus, type ShowRegistration } from '@/types/show-registration-types';

describe('useExistingEntries', () => {
  it('does not block class re-entry for terminal server entries', async () => {
    mockSupabase.from.mockReturnValue(
      createChainableQuery({
        data: [
          {
            id: 'withdrawn-entry',
            dog_id: 'dog-1',
            class_id: 'class-withdrawn',
            registration_id: 'registration-withdrawn',
            entry_status: EntryStatus.CANCELLED,
            payment_status: 'refunded',
          },
          {
            id: 'scratched-entry',
            dog_id: 'dog-1',
            class_id: 'class-scratched',
            registration_id: 'registration-scratched',
            entry_status: EntryStatus.SCRATCHED,
            payment_status: 'paid_online',
          },
          {
            id: 'accepted-entry',
            dog_id: 'dog-1',
            class_id: 'class-accepted',
            registration_id: 'registration-accepted',
            entry_status: EntryStatus.ACCEPTED,
            payment_status: 'paid_online',
          },
          {
            id: 'completed-entry',
            dog_id: 'dog-1',
            class_id: 'class-completed',
            registration_id: 'registration-completed',
            entry_status: EntryStatus.COMPLETED,
            payment_status: 'paid_online',
          },
          {
            id: 'pulled-entry',
            dog_id: 'dog-1',
            class_id: 'class-pulled',
            registration_id: 'registration-pulled',
            entry_status: EntryStatus.ACCEPTED,
            check_in_status: 'pulled',
            payment_status: 'paid_online',
          },
        ],
        error: null,
      })
    );

    const { result } = renderHook(() => useExistingEntries('show-1'));

    await waitFor(() => {
      expect(result.current.getExistingEntry('dog-1', 'class-accepted')).toMatchObject({
        registrationId: 'registration-accepted',
        entryStatus: EntryStatus.ACCEPTED,
      });
    });

    expect(result.current.checkIfDogEnteredInClass('dog-1', 'class-withdrawn')).toBe(false);
    expect(result.current.checkIfDogEnteredInClass('dog-1', 'class-scratched')).toBe(false);
    expect(result.current.checkIfDogEnteredInClass('dog-1', 'class-completed')).toBe(false);
    expect(result.current.checkIfDogEnteredInClass('dog-1', 'class-pulled')).toBe(false);
    expect(result.current.getExistingEntry('dog-1', 'class-withdrawn')).toBeUndefined();
    expect(result.current.getExistingEntry('dog-1', 'class-scratched')).toBeUndefined();
    expect(result.current.getEntriesForDog('dog-1')).toHaveLength(1);
  });

  it('does not block class re-entry for withdrawn local registrations', () => {
    const registrations: ShowRegistration[] = [
      {
        id: 'registration-withdrawn',
        showId: 'show-1',
        userId: 'user-1',
        handlerId: 'handler-1',
        status: 'submitted',
        entryStatus: EntryStatus.CANCELLED,
        totalFees: 0,
        paymentStatus: 'pending',
        createdAt: new Date('2026-07-04T12:00:00.000Z'),
        updatedAt: new Date('2026-07-04T12:00:00.000Z'),
        entries: [
          {
            id: 'entry-withdrawn',
            registrationId: 'registration-withdrawn',
            dogId: 'dog-1',
            dogName: 'Scout',
            trialId: 'trial-1',
            trialName: 'Trial 1',
            handlerName: 'Handler',
            classes: [
              {
                id: 'class-entry-withdrawn',
                entryId: 'entry-withdrawn',
                classId: 'class-withdrawn',
                className: 'Novice',
                classNumber: '101',
                fee: 25,
                status: 'entered',
              },
            ],
          },
        ],
      },
      {
        id: 'registration-accepted',
        showId: 'show-1',
        userId: 'user-1',
        handlerId: 'handler-1',
        status: 'submitted',
        entryStatus: EntryStatus.ACCEPTED,
        totalFees: 0,
        paymentStatus: 'pending',
        createdAt: new Date('2026-07-04T12:00:00.000Z'),
        updatedAt: new Date('2026-07-04T12:00:00.000Z'),
        entries: [
          {
            id: 'entry-accepted',
            registrationId: 'registration-accepted',
            dogId: 'dog-1',
            dogName: 'Scout',
            trialId: 'trial-1',
            trialName: 'Trial 1',
            handlerName: 'Handler',
            classes: [
              {
                id: 'class-entry-accepted',
                entryId: 'entry-accepted',
                classId: 'class-accepted',
                className: 'Advanced',
                classNumber: '102',
                fee: 25,
                status: 'entered',
              },
            ],
          },
        ],
      },
    ];
    useShowRegistrationStore.setState({ registrations });

    const { result } = renderHook(() => useExistingEntries('show-1'));

    expect(result.current.checkIfDogEnteredInClass('dog-1', 'class-withdrawn')).toBe(false);
    expect(result.current.checkIfDogEnteredInClass('dog-1', 'class-accepted')).toBe(true);
    expect(result.current.getEntriesForDog('dog-1')).toHaveLength(1);
  });
});
