import { VaccinationRecord, VetVisitRecord, MedicationRecord, AllergyRecord } from '@/types/health';

// --- MOCK HEALTH RECORDS ---
export const MOCK_VACCINATIONS: VaccinationRecord[] = [
  {
    id: '1',
    dog_id: 'mock_dog_1',
    vaccine_name: 'Rabies',
    date_given: '2024-01-15',
    expiration_date: '2027-01-15',
    vet_name: 'Dr. Smith',
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: '2',
    dog_id: 'mock_dog_1',
    vaccine_name: 'DHPP',
    date_given: '2023-10-10',
    expiration_date: '2026-10-10',
    vet_name: 'Dr. Lee',
    created_at: '2023-10-10T00:00:00Z',
    updated_at: '2023-10-10T00:00:00Z',
  },
];

export const MOCK_VET_VISITS: VetVisitRecord[] = [
  {
    id: '1',
    dog_id: 'mock_dog_1',
    reason: 'Annual Checkup',
    visit_date: '2024-02-20',
    notes: 'All good. Weight stable.',
    vet_name: 'Dr. Smith',
    clinic_name: 'Happy Tails Vet',
    created_at: '2024-02-20T00:00:00Z',
    updated_at: '2024-02-20T00:00:00Z',
  },
];

export const MOCK_MEDICATIONS: MedicationRecord[] = [
  {
    id: '1',
    dog_id: 'mock_dog_1',
    medication_name: 'Heartgard',
    dosage: '1 tablet',
    frequency: 'Monthly',
    notes: 'Given on the 1st of each month',
    end_date: '2025-06-01',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

export const MOCK_ALLERGIES: AllergyRecord[] = [
  {
    id: '1',
    dog_id: 'mock_dog_1',
    allergen: 'Chicken',
    reaction: 'Avoid all chicken-based foods.',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];
