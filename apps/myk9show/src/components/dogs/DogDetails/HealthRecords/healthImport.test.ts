import { describe, expect, it } from 'vitest';
import { parseHealthRecordsCsv } from './healthImport';

describe('parseHealthRecordsCsv', () => {
  it('parses supported health record rows', () => {
    const result = parseHealthRecordsCsv(
      [
        'Type,Title,Date,Description,Veterinarian,Clinic,Expiration Date',
        'Vaccination,Rabies,2026-02-14,Three-year vaccine,Dr. Miller,Oak Vet,2029-02-14',
        'Vet Visit,Annual Checkup,2026-03-01,Healthy,Dr. Hale,Main Clinic,',
      ].join('\n'),
      'dog-123'
    );

    expect(result.errors).toEqual([]);
    expect(result.records).toEqual([
      {
        type: 'vaccination',
        data: {
          dog_id: 'dog-123',
          vaccine_name: 'Rabies',
          date_given: '2026-02-14',
          expiration_date: '2029-02-14',
          vet_name: 'Dr. Miller',
          clinic_name: 'Oak Vet',
          lot_number: undefined,
          notes: 'Three-year vaccine',
        },
      },
      {
        type: 'vet_visit',
        data: {
          dog_id: 'dog-123',
          visit_date: '2026-03-01',
          reason: 'Annual Checkup',
          diagnosis: undefined,
          treatment: undefined,
          vet_name: 'Dr. Hale',
          clinic_name: 'Main Clinic',
          cost: undefined,
          notes: 'Healthy',
        },
      },
    ]);
  });

  it('reports invalid rows without importing them', () => {
    const result = parseHealthRecordsCsv('Type,Title,Date\nPayment,Rabies,not-a-date', 'dog-123');

    expect(result.records).toEqual([]);
    expect(result.errors).toEqual([
      'Row 2: type must be vaccination, vet visit, medication, or allergy.',
    ]);
  });
});
