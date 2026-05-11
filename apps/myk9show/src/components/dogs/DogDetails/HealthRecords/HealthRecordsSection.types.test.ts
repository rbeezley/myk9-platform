import { describe, expect, it, vi } from 'vitest';
import { importHealthRecords, type HealthMutations } from './HealthRecordsSection.types';

const makeMutations = (overrides: Partial<HealthMutations> = {}): HealthMutations => {
  const mutation = { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({ id: 'created' }) };

  return {
    createVaccination: mutation,
    createMedication: mutation,
    createAllergy: mutation,
    createVetVisit: mutation,
    createOFAScreening: mutation,
    createGeneticScreening: mutation,
    ...overrides,
  } as unknown as HealthMutations;
};

describe('importHealthRecords', () => {
  it('reports successful and failed imported records', async () => {
    const createVaccination = {
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: 'vaccination-1' }),
    };
    const createVetVisit = {
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockRejectedValue(new Error('Visit date is required')),
    };
    const mutations = makeMutations({
      createVaccination: createVaccination as unknown as HealthMutations['createVaccination'],
      createVetVisit: createVetVisit as unknown as HealthMutations['createVetVisit'],
    });

    const outcome = await importHealthRecords(
      [
        {
          type: 'vaccination',
          data: {
            dog_id: 'dog-123',
            vaccine_name: 'Rabies',
            date_given: '2026-02-14',
          },
        },
        {
          type: 'vet_visit',
          data: {
            dog_id: 'dog-123',
            reason: 'Annual Checkup',
            visit_date: '2026-03-01',
          },
        },
      ],
      mutations,
      'owner-123'
    );

    expect(createVaccination.mutateAsync).toHaveBeenCalledWith({
      dog_id: 'dog-123',
      vaccine_name: 'Rabies',
      date_given: '2026-02-14',
      expiration_date: undefined,
      vet_name: undefined,
      lot_number: undefined,
      notes: undefined,
    });
    expect(outcome).toEqual({
      succeeded: 1,
      failed: 1,
      errors: ['Annual Checkup: Visit date is required'],
    });
  });
});
