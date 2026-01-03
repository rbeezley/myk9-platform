// Health Records Integration Test
// Phase 4.2: Health Records System Integration

import { describe, it, expect } from 'vitest';
import {
  getAllVaccinations,
  // createVaccination,
  getAllMedications,
  // createMedication,
  getAllAllergies,
  // createAllergy,
  getAllVetVisits,
  // createVetVisit,
  getHealthStatistics,
  getHealthTimeline
} from '@/services/database/queries/healthQueries';

import {
  mapDbVaccinationToApp,
  mapAppVaccinationToDbInsert,
  generateHealthAlerts,
  calculateHealthStatisticsFromDb
} from '@/services/mappers/healthMappers';

import type { VaccinationRecord } from '@/types/health';

// Mock dog ID for testing
const TEST_DOG_ID = 'test-dog-123';

describe('Health Records Integration', () => {
  describe('Database Queries', () => {
    it('should handle getAllVaccinations without errors', async () => {
      const result = await getAllVaccinations(TEST_DOG_ID);
      
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      
      // Should not throw errors even if no data exists
      if (result.error) {
        console.warn('Expected test warning - vaccination query returned error:', result.error.message);
      }
    });

    it('should handle getAllMedications without errors', async () => {
      const result = await getAllMedications(TEST_DOG_ID);
      
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should handle getAllAllergies without errors', async () => {
      const result = await getAllAllergies(TEST_DOG_ID);
      
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should handle getAllVetVisits without errors', async () => {
      const result = await getAllVetVisits(TEST_DOG_ID);
      
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should handle getHealthStatistics without errors', async () => {
      const result = await getHealthStatistics(TEST_DOG_ID);
      
      expect(result).toBeDefined();
      // Should return either data or error, not both null
      expect(result.data !== null || result.error !== null).toBe(true);
    });

    it('should handle getHealthTimeline without errors', async () => {
      const result = await getHealthTimeline(TEST_DOG_ID);
      
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('Data Mappers', () => {
    it('should map vaccination data correctly', () => {
      const dbVaccination = {
        id: 'test-vac-1',
        dog_id: TEST_DOG_ID,
        health_record_id: null,
        vaccine_name: 'Rabies',
        date_given: '2024-01-15',
        expiration_date: '2025-01-15',
        vet_name: 'Dr. Smith',
        clinic_name: 'Pet Health Clinic',
        clinic_address: null,
        lot_number: 'LOT123',
        manufacturer: 'VetCorp',
        notes: 'Annual vaccination',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z'
      };

      const appVaccination = mapDbVaccinationToApp(dbVaccination);

      expect(appVaccination).toBeDefined();
      expect(appVaccination.id).toBe('test-vac-1');
      expect(appVaccination.dog_id).toBe(TEST_DOG_ID);
      expect(appVaccination.vaccine_name).toBe('Rabies');
      expect(appVaccination.date_given).toBe('2024-01-15');
      expect(appVaccination.expiration_date).toBe('2025-01-15');
      expect(appVaccination.vet_name).toBe('Dr. Smith');
      expect(appVaccination.clinic_name).toBe('Pet Health Clinic');
      expect(appVaccination.lot_number).toBe('LOT123');
      expect(appVaccination.manufacturer).toBe('VetCorp');
      expect(appVaccination.notes).toBe('Annual vaccination');
    });

    it('should map app vaccination to db insert format', () => {
      const appVaccination: Omit<VaccinationRecord, 'id' | 'created_at' | 'updated_at'> = {
        dog_id: TEST_DOG_ID,
        vaccine_name: 'DHPP',
        date_given: '2024-02-01',
        expiration_date: '2025-02-01',
        vet_name: 'Dr. Johnson',
        clinic_name: 'Animal Medical Center'
      };

      const dbInsert = mapAppVaccinationToDbInsert(appVaccination);

      expect(dbInsert).toBeDefined();
      expect(dbInsert.dog_id).toBe(TEST_DOG_ID);
      expect(dbInsert.vaccine_name).toBe('DHPP');
      expect(dbInsert.date_given).toBe('2024-02-01');
      expect(dbInsert.expiration_date).toBe('2025-02-01');
      expect(dbInsert.vet_name).toBe('Dr. Johnson');
      expect(dbInsert.clinic_name).toBe('Animal Medical Center');
      expect(dbInsert.created_at).toBeDefined();
      expect(dbInsert.updated_at).toBeDefined();
    });
  });

  describe('Health Alerts Generation', () => {
    it('should generate vaccination due alerts', () => {
      const now = new Date();
      const soonExpiration = new Date();
      soonExpiration.setDate(now.getDate() + 15); // 15 days from now
      
      const overdueExpiration = new Date();
      overdueExpiration.setDate(now.getDate() - 5); // 5 days ago

      const vaccinations = [
        {
          id: 'vac-1',
          dog_id: TEST_DOG_ID,
          vaccine_name: 'Rabies',
          date_given: '2024-01-01',
          expiration_date: soonExpiration.toISOString().split('T')[0],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          health_record_id: null,
          vet_name: null,
          clinic_name: null,
          clinic_address: null,
          lot_number: null,
          manufacturer: null,
          notes: null
        },
        {
          id: 'vac-2',
          dog_id: TEST_DOG_ID,
          vaccine_name: 'DHPP',
          date_given: '2023-12-01',
          expiration_date: overdueExpiration.toISOString().split('T')[0],
          created_at: '2023-12-01T00:00:00Z',
          updated_at: '2023-12-01T00:00:00Z',
          health_record_id: null,
          vet_name: null,
          clinic_name: null,
          clinic_address: null,
          lot_number: null,
          manufacturer: null,
          notes: null
        }
      ];

      const alerts = generateHealthAlerts(vaccinations, [], [], TEST_DOG_ID);

      expect(alerts).toBeDefined();
      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts.length).toBeGreaterThan(0);

      // Check for overdue alert
      const overdueAlert = alerts.find(alert => alert.severity === 'critical');
      expect(overdueAlert).toBeDefined();
      expect(overdueAlert?.type).toBe('vaccination_due');
      expect(overdueAlert?.title).toBe('Vaccination Overdue');

      // Check for upcoming alert
      const upcomingAlert = alerts.find(alert => alert.severity === 'medium' || alert.severity === 'high');
      expect(upcomingAlert).toBeDefined();
      expect(upcomingAlert?.type).toBe('vaccination_due');
      expect(upcomingAlert?.title).toBe('Vaccination Due Soon');
    });

    it('should generate medication ending alerts', () => {
      const now = new Date();
      const endingSoon = new Date();
      endingSoon.setDate(now.getDate() + 2); // 2 days from now

      const medications = [
        {
          id: 'med-1',
          dog_id: TEST_DOG_ID,
          medication_name: 'Antibiotics',
          start_date: '2024-01-01',
          end_date: endingSoon.toISOString().split('T')[0],
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          health_record_id: null,
          dosage: null,
          frequency: null,
          prescribed_by: null,
          pharmacy: null,
          prescription_number: null,
          notes: null
        }
      ];

      const alerts = generateHealthAlerts([], medications, [], TEST_DOG_ID);

      expect(alerts).toBeDefined();
      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts.length).toBeGreaterThan(0);

      const medicationAlert = alerts.find(alert => alert.type === 'medication_reminder');
      expect(medicationAlert).toBeDefined();
      expect(medicationAlert?.title).toBe('Medication Ending Soon');
      expect(medicationAlert?.severity).toBe('high'); // 2 days = high priority
    });
  });

  describe('Health Statistics Calculation', () => {
    it('should calculate health statistics correctly', () => {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + 20);
      
      const pastDate = new Date();
      pastDate.setDate(now.getDate() - 10);

      const vaccinations = [
        {
          id: 'vac-1',
          expiration_date: futureDate.toISOString().split('T')[0], // upcoming
          vaccine_name: 'Rabies',
          date_given: '2024-01-01',
          dog_id: TEST_DOG_ID,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          health_record_id: null,
          vet_name: null,
          clinic_name: null,
          clinic_address: null,
          lot_number: null,
          manufacturer: null,
          notes: null
        },
        {
          id: 'vac-2',
          expiration_date: pastDate.toISOString().split('T')[0], // overdue
          vaccine_name: 'DHPP',
          date_given: '2023-12-01',
          dog_id: TEST_DOG_ID,
          created_at: '2023-12-01T00:00:00Z',
          updated_at: '2023-12-01T00:00:00Z',
          health_record_id: null,
          vet_name: null,
          clinic_name: null,
          clinic_address: null,
          lot_number: null,
          manufacturer: null,
          notes: null
        }
      ];

      const medications = [
        {
          id: 'med-1',
          is_active: true,
          medication_name: 'Pain Relief',
          dog_id: TEST_DOG_ID,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          health_record_id: null,
          dosage: null,
          frequency: null,
          prescribed_by: null,
          pharmacy: null,
          prescription_number: null,
          start_date: null,
          end_date: null,
          notes: null
        }
      ];

      const allergies = [
        {
          id: 'allergy-1',
          is_active: true,
          allergen: 'Pollen',
          dog_id: TEST_DOG_ID,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          health_record_id: null,
          reaction: null,
          severity: null,
          discovered_date: null,
          discovered_by: null,
          notes: null
        }
      ];

      const vetVisits = [
        {
          id: 'visit-1',
          visit_date: '2024-01-15',
          reason: 'Checkup',
          requires_follow_up: true,
          follow_up_date: futureDate.toISOString().split('T')[0],
          dog_id: TEST_DOG_ID,
          created_at: '2024-01-15T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
          health_record_id: null,
          diagnosis: null,
          treatment: null,
          vet_name: null,
          clinic_name: null,
          clinic_address: null,
          clinic_phone: null,
          cost: null,
          follow_up_notes: null,
          notes: null
        }
      ];

      const statistics = calculateHealthStatisticsFromDb(
        vaccinations,
        medications,
        allergies,
        vetVisits
      );

      expect(statistics).toBeDefined();
      expect(statistics.total_vaccinations).toBe(2);
      expect(statistics.upcoming_vaccinations).toBe(1);
      expect(statistics.overdue_vaccinations).toBe(1);
      expect(statistics.active_medications).toBe(1);
      expect(statistics.total_allergies).toBe(1);
      expect(statistics.total_vet_visits).toBe(1);
      expect(statistics.upcoming_appointments).toBe(1);
      expect(statistics.last_visit_date).toBe('2024-01-15');
    });
  });
});

describe('Health Records Type Safety', () => {
  it('should enforce proper typing for vaccination records', () => {
    // This test verifies TypeScript compilation and type safety
    const vaccination: VaccinationRecord = {
      id: 'test-id',
      dog_id: 'test-dog',
      vaccine_name: 'Test Vaccine',
      date_given: '2024-01-01',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    };

    expect(vaccination.id).toBeDefined();
    expect(vaccination.dog_id).toBeDefined();
    expect(vaccination.vaccine_name).toBeDefined();
    expect(vaccination.date_given).toBeDefined();
    expect(vaccination.created_at).toBeDefined();
    expect(vaccination.updated_at).toBeDefined();
  });
});