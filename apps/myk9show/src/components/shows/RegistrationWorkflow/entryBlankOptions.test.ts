import { describe, expect, it } from 'vitest';
import { buildRegistrationEntryBlankDownloads } from './entryBlankOptions';

describe('buildRegistrationEntryBlankDownloads', () => {
  it('assembles the exact created entry, registration, judge, and handler', () => {
    const result = buildRegistrationEntryBlankDownloads({
      show: {
        id: 'show-1',
        name: 'Summer Scent Work',
        organization: 'AKC',
        startDate: '2026-08-08',
        endDate: '2026-08-09',
        entryCloseDate: '2026-07-30',
        preEntryFee: '25',
        clubName: 'Prairie Dog Club',
        clubEmail: 'secretary@prairie.example',
      },
      trials: [
        {
          id: 'trial-1',
          showId: 'show-1',
          trialDate: '2026-08-08',
          trialNumber: 'I',
          order: '1',
          registryId: 'AKC',
          timezone: 'America/Chicago',
        },
        {
          id: 'trial-2',
          showId: 'show-1',
          trialDate: '2026-08-09',
          trialNumber: 'II',
          order: '2',
          registryId: 'UKC',
          timezone: 'America/Chicago',
        },
      ],
      classes: [
        {
          id: 'class-1',
          trialId: 'trial-1',
          className: 'Novice Containers',
          element: 'Containers',
          level: 'Novice',
          section: 'A',
          judge: 'First Judge',
        },
        {
          id: 'class-2',
          trialId: 'trial-2',
          className: 'Advanced Exterior',
          element: 'Exterior',
          level: 'Advanced',
          section: 'B',
          judge: 'Selected Judge',
        },
      ],
      dogs: [
        {
          id: 'dog-1',
          name: 'First Dog',
          callName: 'First',
          ownerId: 'person-1',
          registrations: [],
        },
        {
          id: 'dog-2',
          name: 'Tera',
          callName: 'Tera',
          ownerId: 'person-2',
          sex: 'female',
          dateOfBirth: '2022-04-03',
          registrations: [
            {
              id: 'ukc-registration',
              organization: 'UKC (United Kennel Club)',
              registrationNumber: 'P935-254',
              registeredName: 'Maia TeraByte Van Neerland',
              breed: 'Belgian Tervuren',
              variety: 'Longhaired',
              isPrimary: true,
              createdAt: '2025-02-01T00:00:00Z',
              status: 'Active',
            },
          ],
        },
      ],
      people: [
        {
          id: 'handler-2',
          firstName: 'Jamie',
          lastName: 'Smith',
          email: 'jamie@example.com',
          phone: '555-0100',
          streetAddress: '12 Main Street',
          city: 'Madison',
          state: 'WI',
          zipCode: '53703',
        },
      ],
      handlerAssignments: {
        'dog-2|class-2': {
          handlerId: 'handler-2',
          handlerName: 'Jamie Smith',
          isOwner: false,
        },
      },
      paymentMethod: 'credit_card',
      outcomes: [
        {
          dogId: 'dog-1',
          classId: 'class-1',
          outcome: 'denied',
          entryId: null,
          waitlistEntryId: null,
          feeCents: 0,
          capacityOverride: false,
        },
        {
          dogId: 'dog-2',
          classId: 'class-2',
          outcome: 'created',
          entryId: 'entry-2',
          waitlistEntryId: null,
          feeCents: 2_500,
          capacityOverride: false,
        },
      ],
    });

    expect(result.unavailable).toEqual([]);
    expect(result.downloads).toHaveLength(1);
    expect(result.downloads[0]).toMatchObject({
      entryId: 'entry-2',
      label: 'Tera — Advanced Exterior',
      options: {
        entry: {
          trial_id: 'trial-2',
          class_id: 'class-2',
          entry_fee: 25,
          payment_status: 'online',
        },
        dog: {
          call_name: 'Tera',
          registrations: [
            {
              id: 'ukc-registration',
              organization: 'UKC (United Kennel Club)',
              registration_number: 'P935-254',
              registered_name: 'Maia TeraByte Van Neerland',
              breed: 'Belgian Tervuren',
              variety: 'Longhaired',
              is_primary: true,
              created_at: '2025-02-01T00:00:00Z',
            },
          ],
        },
        judges: expect.arrayContaining([
          {
            trial_id: 'trial-2',
            judgeName: 'Selected Judge',
          },
        ]),
        handler: {
          first_name: 'Jamie',
          last_name: 'Smith',
          email: 'jamie@example.com',
          phone: '555-0100',
          address: '12 Main Street',
          city: 'Madison',
          state: 'WI',
          zip_code: '53703',
        },
      },
    });
  });
});
