import { describe, it, expect } from 'vitest';
import { extractRoles, mapDbAvailabilityToUI, mapUIAvailabilityToDb } from '../userMappers';

describe('extractRoles', () => {
  it('returns [] for missing user_roles + missing roles', () => {
    expect(extractRoles({})).toEqual([]);
  });

  it('extracts role names from joined user_roles shape', () => {
    const dbUser = {
      user_roles: [{ role: { name: 'judge' } }, { role: { name: 'exhibitor' } }],
    };
    expect(extractRoles(dbUser)).toEqual(['judge', 'exhibitor']);
  });

  it('falls back to flat roles array (RPC shape)', () => {
    expect(extractRoles({ roles: ['judge', 'exhibitor'] })).toEqual(['judge', 'exhibitor']);
  });

  it('dedupes duplicate role names from the joined shape', () => {
    // user_roles can hold multiple rows for the same (user, role) pair —
    // different assignments, granted_by, etc. The UI must not see duplicate
    // role badges (regression guard against React duplicate-key warnings).
    const dbUser = {
      user_roles: [
        { role: { name: 'secretary' } },
        { role: { name: 'exhibitor' } },
        { role: { name: 'secretary' } },
      ],
    };
    expect(extractRoles(dbUser)).toEqual(['secretary', 'exhibitor']);
  });

  it('dedupes duplicate role names from the flat RPC shape', () => {
    expect(extractRoles({ roles: ['secretary', 'exhibitor', 'secretary'] })).toEqual([
      'secretary',
      'exhibitor',
    ]);
  });

  it('drops role rows with null role and continues', () => {
    const dbUser = {
      user_roles: [{ role: { name: 'judge' } }, { role: null }],
    };
    expect(extractRoles(dbUser)).toEqual(['judge']);
  });
});

describe('judge availability date mapping', () => {
  it('round-trips DATE-only values without shifting them in New York', () => {
    const dbAvailability = {
      id: 'availability-1',
      person_id: 'person-1',
      start_date: '2026-09-05',
      end_date: '2026-09-07',
      blackout_dates: ['2026-09-06', '2026-10-31'],
      max_shows_per_month: 4,
      travel_radius_miles: 100,
      availability_status: 'available',
      created_at: '2026-09-01T12:00:00.000Z',
      updated_at: '2026-09-01T12:00:00.000Z',
    };

    const uiAvailability = mapDbAvailabilityToUI(dbAvailability);
    const dbPayload = mapUIAvailabilityToDb('person-1', uiAvailability);

    expect(dbPayload).toMatchObject({
      start_date: '2026-09-05',
      end_date: '2026-09-07',
      blackout_dates: ['2026-09-06', '2026-10-31'],
    });
  });
});
