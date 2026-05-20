import { beforeEach, describe, expect, it, vi } from 'vitest';

// Helpers to build DB row fixtures with the right shape for each sub-table.
const buildVaccination = (id: string, dateAdministered: string) => ({
  id,
  dog_id: 'dog-1',
  vaccine_name: 'Rabies',
  date_administered: dateAdministered,
  expiration_date: null,
  administered_by: null,
  lot_number: null,
  notes: null,
  created_at: dateAdministered,
  updated_at: dateAdministered,
});

const buildMedication = (id: string, startDate: string | null) => ({
  id,
  dog_id: 'dog-1',
  medication_name: 'Carprofen',
  dosage: null,
  frequency: null,
  prescribing_vet: null,
  start_date: startDate,
  end_date: null,
  is_active: true,
  reason: null,
  created_at: startDate ?? '2026-01-01',
  updated_at: startDate ?? '2026-01-01',
});

const buildAllergy = (id: string) => ({
  id,
  dog_id: 'dog-1',
  allergen: 'Chicken',
  reaction: null,
  severity: 'mild',
  diagnosed_date: null,
  notes: null,
  created_at: '2024-01-01',
});

const buildVetVisit = (id: string, visitDate: string) => ({
  id,
  dog_id: 'dog-1',
  visit_date: visitDate,
  reason: 'Checkup',
  diagnosis: null,
  treatment: null,
  vet_name: null,
  clinic_name: null,
  cost: null,
  follow_up_date: null,
  notes: null,
  created_at: visitDate,
  updated_at: visitDate,
});

const buildOFAScreening = (id: string) => ({
  id,
  dog_id: 'dog-1',
  owner_id: 'owner-1',
  test_type: 'hips',
  test_date: '2024-06-01',
  result: null,
  certification_number: null,
  status: 'normal',
  veterinarian: null,
  notes: null,
  created_at: '2024-06-01',
  updated_at: '2024-06-01',
});

const buildGeneticScreening = (id: string) => ({
  id,
  dog_id: 'dog-1',
  owner_id: 'owner-1',
  provider: 'Embark',
  test_date: '2024-06-01',
  results: [],
  notes: null,
  created_at: '2024-06-01',
  updated_at: '2024-06-01',
});

// vi.hoisted captures references the vi.mock factories will use. The
// per-sub-table reads are mocked so `getDogHealthOverview` (and the real
// `getDogHealthStatistics` it calls inside the same module) sees test data.
const mocks = vi.hoisted(() => {
  const okEmpty = () => Promise.resolve({ data: [], error: null });
  return {
    getAllVaccinations: vi.fn(okEmpty),
    getUpcomingVaccinations: vi.fn(okEmpty),
    getAllMedications: vi.fn(okEmpty),
    getActiveMedications: vi.fn(okEmpty),
    getAllAllergies: vi.fn(okEmpty),
    getActiveAllergies: vi.fn(okEmpty),
    getAllVetVisits: vi.fn(okEmpty),
    getVetVisitsRequiringFollowUp: vi.fn(okEmpty),
    getAllOFAScreenings: vi.fn(okEmpty),
    getAllGeneticScreenings: vi.fn(okEmpty),
  };
});

vi.mock('../vaccinations', () => ({
  getAllVaccinations: mocks.getAllVaccinations,
  getUpcomingVaccinations: mocks.getUpcomingVaccinations,
}));
vi.mock('../medications', () => ({
  getAllMedications: mocks.getAllMedications,
  getActiveMedications: mocks.getActiveMedications,
}));
vi.mock('../allergies', () => ({
  getAllAllergies: mocks.getAllAllergies,
  getActiveAllergies: mocks.getActiveAllergies,
}));
vi.mock('../vet-visits', () => ({
  getAllVetVisits: mocks.getAllVetVisits,
  getVetVisitsRequiringFollowUp: mocks.getVetVisitsRequiringFollowUp,
}));
vi.mock('../ofa-screenings', () => ({
  getAllOFAScreenings: mocks.getAllOFAScreenings,
}));
vi.mock('../genetic-screenings', () => ({
  getAllGeneticScreenings: mocks.getAllGeneticScreenings,
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {},
  logQuery: vi.fn(),
  createDatabaseError: (error: { message?: string }, table: string, op: string) =>
    new Error(`${table}:${op}:${error?.message ?? 'unknown'}`),
}));

// PostgREST filter sanitizer is used by `searchDogHealth` (sibling export);
// not exercised here but the module is imported, so stub it out.
vi.mock('@/utils/sanitizePostgRESTFilter', () => ({
  sanitizePostgRESTFilter: (s: string) => s,
}));

import { getDogHealthOverview } from '../umbrella';

const ok = <T,>(data: T) => Promise.resolve({ data, error: null });

describe('getDogHealthOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default resolved values to empty.
    mocks.getAllVaccinations.mockImplementation(() => ok([]));
    mocks.getUpcomingVaccinations.mockImplementation(() => ok([]));
    mocks.getAllMedications.mockImplementation(() => ok([]));
    mocks.getActiveMedications.mockImplementation(() => ok([]));
    mocks.getAllAllergies.mockImplementation(() => ok([]));
    mocks.getActiveAllergies.mockImplementation(() => ok([]));
    mocks.getAllVetVisits.mockImplementation(() => ok([]));
    mocks.getVetVisitsRequiringFollowUp.mockImplementation(() => ok([]));
    mocks.getAllOFAScreenings.mockImplementation(() => ok([]));
    mocks.getAllGeneticScreenings.mockImplementation(() => ok([]));
  });

  it('happy path: returns the bundle with all sub-table data mapped and windowed', async () => {
    const now = new Date();
    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const eighteenMonthsAgo = new Date(now);
    eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);

    mocks.getAllVaccinations.mockImplementation(() =>
      ok([
        buildVaccination('v-recent', twoMonthsAgo.toISOString()),
        buildVaccination('v-old', eighteenMonthsAgo.toISOString()),
      ])
    );
    mocks.getActiveMedications.mockImplementation(() =>
      ok([buildMedication('m-active', twoMonthsAgo.toISOString())])
    );
    mocks.getAllMedications.mockImplementation(() =>
      ok([
        buildMedication('m-recent', twoMonthsAgo.toISOString()),
        buildMedication('m-old', eighteenMonthsAgo.toISOString()),
      ])
    );
    mocks.getAllAllergies.mockImplementation(() => ok([buildAllergy('a-1')]));
    mocks.getAllVetVisits.mockImplementation(() =>
      ok([
        buildVetVisit('vv-recent', twoMonthsAgo.toISOString()),
        buildVetVisit('vv-old', eighteenMonthsAgo.toISOString()),
      ])
    );
    mocks.getAllOFAScreenings.mockImplementation(() => ok([buildOFAScreening('ofa-1')]));
    mocks.getAllGeneticScreenings.mockImplementation(() =>
      ok([buildGeneticScreening('g-1')])
    );

    const { data, error } = await getDogHealthOverview('dog-1');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.allergies).toHaveLength(1);
    expect(data!.ofaScreenings).toHaveLength(1);
    expect(data!.geneticScreenings).toHaveLength(1);
    expect(data!.activeMedications).toHaveLength(1);

    // Windowed lists: only the "recent" rows survive (default 12 months).
    expect(data!.recentVaccinations.map(v => v.id)).toEqual(['v-recent']);
    expect(data!.recentVetVisits.map(v => v.id)).toEqual(['vv-recent']);
    expect(data!.recentMedications.map(m => m.id)).toEqual(['m-recent']);

    // Statistics are computed by the real `getDogHealthStatistics`, which
    // reads the same mocked sub-tables. Vaccinations: 2, active medications: 1.
    expect(data!.statistics.total_vaccinations).toBe(2);
    expect(data!.statistics.active_medications).toBe(1);
  });

  it('surfaces the first sub-query error', async () => {
    const boom = new Error('vaccinations RLS denied');
    mocks.getAllVaccinations.mockImplementation(() =>
      Promise.resolve({ data: [], error: boom })
    );

    const { data, error } = await getDogHealthOverview('dog-1');

    expect(data).toBeNull();
    expect(error).toBe(boom);
  });

  it('recentMonths: 0 disables the window — all records appear in "recent"', async () => {
    const now = new Date();
    const eighteenMonthsAgo = new Date(now);
    eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);

    mocks.getAllVaccinations.mockImplementation(() =>
      ok([
        buildVaccination('v-recent', now.toISOString()),
        buildVaccination('v-old', eighteenMonthsAgo.toISOString()),
      ])
    );

    const { data, error } = await getDogHealthOverview('dog-1', { recentMonths: 0 });

    expect(error).toBeNull();
    expect(data!.recentVaccinations.map(v => v.id).sort()).toEqual(['v-old', 'v-recent']);
  });

  it('recentMonths: 6 windows to last 6 months', async () => {
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const nineMonthsAgo = new Date(now);
    nineMonthsAgo.setMonth(nineMonthsAgo.getMonth() - 9);

    mocks.getAllVaccinations.mockImplementation(() =>
      ok([
        buildVaccination('v-in', threeMonthsAgo.toISOString()),
        buildVaccination('v-out', nineMonthsAgo.toISOString()),
      ])
    );

    const { data, error } = await getDogHealthOverview('dog-1', { recentMonths: 6 });

    expect(error).toBeNull();
    expect(data!.recentVaccinations.map(v => v.id)).toEqual(['v-in']);
  });
});
