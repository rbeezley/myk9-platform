/**
 * Show Management System Integration Test
 * 
 * Tests the complete show management system including registrations, armbands,
 * and check-in processes with database operations and React Query integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// Import types and hooks
import {
  ShowRegistration,
  CreateShowRegistrationData,
  CreateArmbandData,
  Armband,
  ShowConfig
} from '../../types/show-management';

// Mock interfaces for test data
interface MockArmband extends Partial<Armband> {
  armband_number: string;
}

interface MockShowRegistration extends Partial<ShowRegistration> {
  registration_status: string;
  payment_status: string;
  registration_date: string;
}

interface MockShowConfig extends Partial<ShowConfig> {
  abbreviation: string;
}

import {
  useShowRegistrations,
  useArmbands,
  useCheckInRecords,
  useShowManagementStats
} from '../../hooks/queries/useShowManagementDatabase';

import { showRegistrationMappers, armbandMappers, showManagementUtils, importMappers } from '../../services/mappers/showManagementMappers';

// Mock Supabase client
vi.mock('../../services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis()
    }))
  }
}));

// Test wrapper for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('Show Management System Integration', () => {
  const mockShowId = 'test-show-123';
  const mockPersonId = 'test-person-456';
  const mockDogId = 'test-dog-789';
  
  const mockShowRegistration: CreateShowRegistrationData = {
    show_id: mockShowId,
    person_id: mockPersonId,
    dog_id: mockDogId,
    class_id: 'test-class-101',
    registration_number: 'REG-2024-001',
    confirmation_number: 'CONF-2024-001',
    registration_date: '2024-01-15',
    registration_status: 'confirmed',
    check_in_status: 'not_checked_in',
    payment_status: 'paid',
    payment_amount: 30.00,
    payment_method: 'credit_card',
    payment_date: '2024-01-15',
    entry_notes: 'Test registration',
    special_requirements: 'None',
    is_active: true
  };

  const mockArmband: CreateArmbandData = {
    show_id: mockShowId,
    class_id: 'test-class-101',
    registration_id: 'test-registration-001',
    armband_number: '42',
    armband_type: 'standard',
    assignment_status: 'assigned',
    print_status: 'printed',
    print_date: '2024-01-20T08:00:00Z',
    assignment_date: '2024-01-20T07:30:00Z',
    checked_in: false,
    ring_number: '1',
    ring_time: '09:30',
    judge_name: 'Judge Smith',
    class_name: 'Novice A',
    notes: 'Test armband'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Show Registration Operations', () => {
    it('should validate show registration data correctly', () => {
      const validRegistration = { ...mockShowRegistration };
      const errors = showRegistrationMappers.validate(validRegistration);
      expect(errors).toHaveLength(0);
    });

    it('should catch missing required fields in registration validation', () => {
      const invalidRegistration = { ...mockShowRegistration, show_id: '' };
      const errors = showRegistrationMappers.validate(invalidRegistration);
      expect(errors).toContain('Show ID is required');
    });

    it('should validate registration date format', () => {
      const invalidRegistration = { ...mockShowRegistration, registration_date: 'invalid-date' };
      const errors = showRegistrationMappers.validate(invalidRegistration);
      expect(errors).toContain('Invalid registration date format');
    });

    it('should validate payment amount is not negative', () => {
      const invalidRegistration = { ...mockShowRegistration, payment_amount: -10 };
      const errors = showRegistrationMappers.validate(invalidRegistration);
      expect(errors).toContain('Payment amount cannot be negative');
    });

    it('should generate confirmation numbers correctly', () => {
      const confirmationNumber = showRegistrationMappers.generateConfirmationNumber(mockShowId, 'REG-001');
      expect(confirmationNumber).toMatch(/^[A-Z0-9]+-[A-Z0-9]+-REG-001$/);
    });

    it('should map registration data between database and app formats', () => {
      const dbData = showRegistrationMappers.toDatabase(mockShowRegistration);
      expect(dbData.show_id).toBe(mockShowRegistration.show_id);
      expect(dbData.person_id).toBe(mockShowRegistration.person_id);
      expect(dbData.payment_amount).toBe(mockShowRegistration.payment_amount);
    });
  });

  describe('Armband Operations', () => {
    it('should validate armband data correctly', () => {
      const validArmband = { ...mockArmband };
      const errors = armbandMappers.validate(validArmband);
      expect(errors).toHaveLength(0);
    });

    it('should catch missing required fields in armband validation', () => {
      const invalidArmband = { ...mockArmband, armband_number: '' };
      const errors = armbandMappers.validate(invalidArmband);
      expect(errors).toContain('Armband number is required');
    });

    it('should validate ring time format', () => {
      const invalidArmband = { ...mockArmband, ring_time: '25:00' };
      const errors = armbandMappers.validate(invalidArmband);
      expect(errors).toContain('Invalid ring time format (use HH:MM)');
    });

    it('should parse armband numbers correctly', () => {
      const parsed1 = armbandMappers.parseArmbandNumber('42');
      expect(parsed1.numeric).toBe(42);
      expect(parsed1.text).toBe('');

      const parsed2 = armbandMappers.parseArmbandNumber('A42');
      expect(parsed2.numeric).toBe(42);
      expect(parsed2.text).toBe('A');

      const parsed3 = armbandMappers.parseArmbandNumber('NO-NUM');
      expect(parsed3.numeric).toBe(0);
      expect(parsed3.text).toBe('NO-NUM');
    });

    it('should sort armbands by number correctly', () => {
      const armbands = [
        { ...mockArmband, armband_number: '10' },
        { ...mockArmband, armband_number: '2' },
        { ...mockArmband, armband_number: 'A5' },
        { ...mockArmband, armband_number: 'A10' },
        { ...mockArmband, armband_number: 'B1' }
      ];

      const sorted = armbandMappers.sortArmbandsByNumber(armbands);
      const sortedNumbers = sorted.map(a => a.armband_number);
      expect(sortedNumbers).toEqual(['2', '10', 'A5', 'A10', 'B1']);
    });

    it('should map armband data between database and app formats', () => {
      const dbData = armbandMappers.toDatabase(mockArmband);
      expect(dbData.show_id).toBe(mockArmband.show_id);
      expect(dbData.armband_number).toBe(mockArmband.armband_number);
      expect(dbData.checked_in).toBe(mockArmband.checked_in);
    });
  });

  describe('Show Management Utilities', () => {
    it('should check registration eligibility for check-in', () => {
      const eligibleRegistration = {
        ...mockShowRegistration,
        id: 'reg-1',
        registration_status: 'confirmed',
        payment_status: 'paid',
        is_active: true,
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z'
      } as ShowRegistration;

      const ineligibleRegistration = {
        ...mockShowRegistration,
        id: 'reg-2',
        registration_status: 'pending',
        payment_status: 'pending',
        is_active: true,
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z'
      } as ShowRegistration;

      expect(showManagementUtils.isEligibleForCheckIn(eligibleRegistration)).toBe(true);
      expect(showManagementUtils.isEligibleForCheckIn(ineligibleRegistration)).toBe(false);
    });

    it('should check if armband can be assigned', () => {
      const assignableArmband = {
        ...mockArmband,
        id: 'armband-1',
        assignment_status: 'unassigned',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z'
      } as Armband;

      const nonAssignableArmband = {
        ...mockArmband,
        id: 'armband-2',
        assignment_status: 'assigned',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z'
      } as Armband;

      expect(showManagementUtils.canAssignArmband(assignableArmband)).toBe(true);
      expect(showManagementUtils.canAssignArmband(nonAssignableArmband)).toBe(false);
    });

    it('should generate next armband number correctly', () => {
      const existingArmbands: MockArmband[] = [
        { armband_number: '1' },
        { armband_number: '3' },
        { armband_number: '5' }
      ];

      const nextNumber = showManagementUtils.generateNextArmbandNumber(existingArmbands);
      expect(nextNumber).toBe('6'); // Next available after highest (5)
    });

    it('should generate next armband number with class config', () => {
      const existingArmbands: MockArmband[] = [
        { armband_number: '1' },
        { armband_number: '3' }
      ];

      const classConfig = {
        armband_range_start: 1,
        armband_range_end: 100
      } as Record<string, unknown>;

      const nextNumber = showManagementUtils.generateNextArmbandNumber(existingArmbands, classConfig);
      expect(nextNumber).toBe('2'); // First gap in sequence
    });

    it('should calculate registration fees correctly', () => {
      const akc_fee = showManagementUtils.calculateRegistrationFee(
        mockShowRegistration,
        { abbreviation: 'AKC' } as MockShowConfig
      );
      
      const ukc_fee = showManagementUtils.calculateRegistrationFee(
        mockShowRegistration,
        { abbreviation: 'UKC' } as MockShowConfig
      );

      const default_fee = showManagementUtils.calculateRegistrationFee(mockShowRegistration);

      expect(akc_fee).toBe(30.00);
      expect(ukc_fee).toBe(25.00);
      expect(default_fee).toBe(25.00);
    });

    it('should format armband display correctly', () => {
      const armband = {
        ...mockArmband,
        id: 'armband-display',
        armband_number: '42',
        ring_number: '1',
        ring_time: '09:30',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z'
      } as Armband;

      const formatted = showManagementUtils.formatArmbandDisplay(armband);
      expect(formatted).toBe('#42 (Ring 1) at 09:30');
    });

    it('should sort registrations by check-in priority', () => {
      const registrations: MockShowRegistration[] = [
        { registration_status: 'pending', payment_status: 'pending', registration_date: '2024-01-15' },
        { registration_status: 'confirmed', payment_status: 'paid', registration_date: '2024-01-16' },
        { registration_status: 'confirmed', payment_status: 'pending', registration_date: '2024-01-14' },
        { registration_status: 'cancelled', payment_status: 'refunded', registration_date: '2024-01-17' }
      ];

      const sorted = showManagementUtils.sortRegistrationsByPriority(registrations);
      
      expect(sorted[0].registration_status).toBe('confirmed');
      expect(sorted[0].payment_status).toBe('paid');
      expect(sorted[1].registration_status).toBe('confirmed');
      expect(sorted[1].payment_status).toBe('pending');
    });

    it('should return correct status colors', () => {
      expect(showManagementUtils.getCheckInStatusColor('checked_in')).toBe('#10b981');
      expect(showManagementUtils.getCheckInStatusColor('no_show')).toBe('#ef4444');
      expect(showManagementUtils.getCheckInStatusColor('not_checked_in')).toBe('#6b7280');

      expect(showManagementUtils.getPaymentStatusColor('paid')).toBe('#10b981');
      expect(showManagementUtils.getPaymentStatusColor('pending')).toBe('#f59e0b');
      expect(showManagementUtils.getPaymentStatusColor('overdue')).toBe('#ef4444');
    });
  });

  describe('Import Mappers', () => {
    it('should convert import data to registration format', () => {
      const importData = {
        show_identifier: 'SHOW-2024-001',
        person_identifier: 'person@email.com',
        dog_identifier: 'DOG-REG-123',
        registration_number: 'REG-001',
        registration_date: '2024-01-15',
        payment_amount: 30.00,
        source: 'CSV Import'
      };

      const converted = importMappers.registrationFromImport(
        importData,
        mockShowId,
        mockPersonId,
        mockDogId
      );

      expect(converted.show_id).toBe(mockShowId);
      expect(converted.person_id).toBe(mockPersonId);
      expect(converted.dog_id).toBe(mockDogId);
      expect(converted.registration_number).toBe('REG-001');
      expect(converted.payment_amount).toBe(30.00);
      expect(converted.entry_notes).toContain('Imported from CSV Import');
    });

    it('should convert import data to armband format', () => {
      const importData = {
        show_identifier: 'SHOW-2024-001',
        armband_number: '42',
        armband_type: 'standard',
        ring_number: '1',
        judge_name: 'Judge Smith',
        source: 'CSV Import'
      };

      const converted = importMappers.armbandFromImport(importData, mockShowId);

      expect(converted.show_id).toBe(mockShowId);
      expect(converted.armband_number).toBe('42');
      expect(converted.armband_type).toBe('standard');
      expect(converted.ring_number).toBe('1');
      expect(converted.judge_name).toBe('Judge Smith');
      expect(converted.notes).toContain('Imported from CSV Import');
    });

    it('should validate registration import data', () => {
      const validImport = {
        show_identifier: 'SHOW-001',
        person_identifier: 'person@email.com',
        dog_identifier: 'DOG-123',
        registration_date: '2024-01-15',
        source: 'CSV'
      };

      const invalidImport = {
        show_identifier: '',
        person_identifier: 'person@email.com',
        dog_identifier: '',
        registration_date: '',
        source: 'CSV'
      };

      const validErrors = importMappers.validateRegistrationImport(validImport);
      const invalidErrors = importMappers.validateRegistrationImport(invalidImport);

      expect(validErrors).toHaveLength(0);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors).toContain('Show identifier is required');
      expect(invalidErrors).toContain('Dog identifier is required');
      expect(invalidErrors).toContain('Registration date is required');
    });

    it('should validate armband import data', () => {
      const validImport = {
        show_identifier: 'SHOW-001',
        armband_number: '42',
        source: 'CSV'
      };

      const invalidImport = {
        show_identifier: '',
        armband_number: '',
        source: 'CSV'
      };

      const validErrors = importMappers.validateArmbandImport(validImport);
      const invalidErrors = importMappers.validateArmbandImport(invalidImport);

      expect(validErrors).toHaveLength(0);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors).toContain('Show identifier is required');
      expect(invalidErrors).toContain('Armband number is required');
    });
  });

  describe('React Query Hooks Integration', () => {
    const wrapper = createWrapper();

    it('should handle show registrations query', async () => {
      const { result } = renderHook(
        () => useShowRegistrations(mockShowId),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle armbands query', async () => {
      const { result } = renderHook(
        () => useArmbands(mockShowId),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle check-in records query', async () => {
      const { result } = renderHook(
        () => useCheckInRecords(mockShowId),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle show management stats query', async () => {
      const { result } = renderHook(
        () => useShowManagementStats(mockShowId),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle filtered queries', async () => {
      const filters = {
        registration_status: 'confirmed',
        payment_status: 'paid'
      };

      const { result } = renderHook(
        () => useShowRegistrations(mockShowId, filters),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('Configuration Systems', () => {
    it('should provide show configuration data', () => {
      const akcConfig = showManagementUtils.getShowConfig('AKC');
      expect(akcConfig?.name).toBe('American Kennel Club');
      expect(akcConfig?.abbreviation).toBe('AKC');
      expect(akcConfig?.registration_types).toContain('Individual');
      expect(akcConfig?.armband_types).toContain('standard');

      const ukcConfig = showManagementUtils.getShowConfig('UKC');
      expect(ukcConfig?.name).toBe('United Kennel Club');
      expect(ukcConfig?.ring_assignment).toBe('manual');
    });

    it('should provide class configuration data', () => {
      const conformationConfig = showManagementUtils.getClassConfig('Conformation');
      expect(conformationConfig?.name).toBe('Conformation');
      expect(conformationConfig?.armband_type).toBe('numeric');
      expect(conformationConfig?.check_in_required).toBe(true);

      const agilityConfig = showManagementUtils.getClassConfig('Agility');
      expect(agilityConfig?.armband_range_end).toBe(500);
      expect(agilityConfig?.ring_assignment).toBe(true);
    });
  });

  describe('Data Transformation', () => {
    it('should handle database to application mapping for registrations', () => {
      const dbRegistration = {
        id: 'reg-123',
        show_id: mockShowId,
        person_id: mockPersonId,
        dog_id: mockDogId,
        registration_date: '2024-01-15',
        registration_status: 'confirmed',
        payment_amount: 30.00,
        is_active: true,
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z'
      };

      const appRegistration = showRegistrationMappers.fromDatabase(dbRegistration);
      expect(appRegistration.id).toBe('reg-123');
      expect(appRegistration.show_id).toBe(mockShowId);
      expect(appRegistration.payment_amount).toBe(30.00);
      expect(appRegistration.is_active).toBe(true);
    });

    it('should handle database to application mapping for armbands', () => {
      const dbArmband = {
        id: 'armband-123',
        show_id: mockShowId,
        armband_number: '42',
        armband_type: 'standard',
        checked_in: false,
        ring_number: '1',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z'
      };

      const appArmband = armbandMappers.fromDatabase(dbArmband);
      expect(appArmband.id).toBe('armband-123');
      expect(appArmband.armband_number).toBe('42');
      expect(appArmband.checked_in).toBe(false);
      expect(appArmband.ring_number).toBe('1');
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', () => {
      const invalidData = {
        show_id: '',
        person_id: '',
        dog_id: '',
        registration_date: 'invalid-date',
        payment_amount: -10
      } as CreateShowRegistrationData;

      const errors = showRegistrationMappers.validate(invalidData);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('Show ID is required');
      expect(errors).toContain('Person ID is required');
      expect(errors).toContain('Dog ID is required');
      expect(errors).toContain('Invalid registration date format');
      expect(errors).toContain('Payment amount cannot be negative');
    });

    it('should handle edge cases in armband number parsing', () => {
      const edgeCases = ['', '0', 'ABC', '123ABC456', 'A1B2C3'];
      
      edgeCases.forEach(testCase => {
        const parsed = armbandMappers.parseArmbandNumber(testCase);
        expect(typeof parsed.numeric).toBe('number');
        expect(typeof parsed.text).toBe('string');
      });
    });
  });
});