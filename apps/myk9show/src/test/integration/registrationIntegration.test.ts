// Registration System Integration Test
// Phase 4.3: Registration System Integration

import { describe, it, expect } from 'vitest';
import { 
  mapRegistrationInputToInsert, 
  mapDatabaseToRegistration,
  validateRegistrationData,
  getRegistrationStatusInfo,
  getOrganizationInfo,
  type RegistrationInput 
} from '@/services/mappers/registrationMappers';

describe('Registration System Integration', () => {
  const mockRegistrationInput: RegistrationInput = {
    dogId: 'dog-123',
    organization: 'AKC',
    registeredName: 'Champion Goldenworth Max',
    breed: 'Golden Retriever',
    variety: 'Standard',
    registrationNumber: 'SS12345678',
    status: 'approved',
    applicationNumber: 'APP-2024-001',
    submissionDate: '2024-01-15',
    registrationDate: '2024-02-01',
    certificate: 'cert-file-url',
  };

  it('should correctly map registration input to database insert', () => {
    const dbInsert = mapRegistrationInputToInsert(mockRegistrationInput);
    
    expect(dbInsert).toEqual({
      dog_id: 'dog-123',
      organization: 'AKC',
      registered_name: 'Champion Goldenworth Max',
      breed: 'Golden Retriever',
      variety: 'Standard',
      registration_number: 'SS12345678',
      status: 'approved',
      application_number: 'APP-2024-001',
      submission_date: '2024-01-15',
      registration_date: '2024-02-01',
      certificate: 'cert-file-url',
    });
  });

  it('should correctly map database result to registration type', () => {
    const mockDbResult = {
      id: 'reg-123',
      dog_id: 'dog-123',
      organization: 'AKC',
      registered_name: 'Champion Goldenworth Max',
      breed: 'Golden Retriever',
      variety: 'Standard',
      registration_number: 'SS12345678',
      status: 'approved',
      application_number: 'APP-2024-001',
      submission_date: '2024-01-15',
      registration_date: '2024-02-01',
      certificate: 'cert-file-url',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-02-01T10:00:00Z',
    };

    const registration = mapDatabaseToRegistration(mockDbResult);

    expect(registration).toEqual({
      id: 'reg-123',
      organization: 'AKC',
      registeredName: 'Champion Goldenworth Max',
      breed: 'Golden Retriever',
      variety: 'Standard',
      registrationNumber: 'SS12345678',
      status: 'approved',
      applicationNumber: 'APP-2024-001',
      submissionDate: '2024-01-15',
      registrationDate: '2024-02-01',
      certificate: 'cert-file-url',
    });
  });

  it('should validate registration data correctly', () => {
    const validData = validateRegistrationData(mockRegistrationInput);
    expect(validData.isValid).toBe(true);
    expect(validData.errors).toHaveLength(0);

    const invalidData = validateRegistrationData({
      ...mockRegistrationInput,
      dogId: '',
      organization: '',
      registrationNumber: 'INVALID',
    });
    expect(invalidData.isValid).toBe(false);
    expect(invalidData.errors.length).toBeGreaterThan(0);
  });

  it('should validate AKC registration numbers correctly', () => {
    const validAKC = validateRegistrationData({
      ...mockRegistrationInput,
      organization: 'AKC',
      registrationNumber: 'SS12345678',
    });
    expect(validAKC.isValid).toBe(true);

    const invalidAKC = validateRegistrationData({
      ...mockRegistrationInput,
      organization: 'AKC',
      registrationNumber: 'INVALID123',
    });
    expect(invalidAKC.isValid).toBe(false);
    expect(invalidAKC.errors).toContain('Invalid registration number format for AKC');
  });

  it('should validate UKC registration numbers correctly', () => {
    const validUKC = validateRegistrationData({
      ...mockRegistrationInput,
      organization: 'UKC',
      registrationNumber: 'A123456',
    });
    expect(validUKC.isValid).toBe(true);

    const invalidUKC = validateRegistrationData({
      ...mockRegistrationInput,
      organization: 'UKC',
      registrationNumber: '123456',
    });
    expect(invalidUKC.isValid).toBe(false);
  });

  it('should provide correct status information', () => {
    const pendingInfo = getRegistrationStatusInfo('pending');
    expect(pendingInfo.label).toBe('Pending');
    expect(pendingInfo.color).toBe('orange');

    const approvedInfo = getRegistrationStatusInfo('approved');
    expect(approvedInfo.label).toBe('Approved');
    expect(approvedInfo.color).toBe('green');

    const expiredInfo = getRegistrationStatusInfo('expired');
    expect(expiredInfo.label).toBe('Expired');
    expect(expiredInfo.color).toBe('red');
  });

  it('should provide correct organization information', () => {
    const akcInfo = getOrganizationInfo('AKC');
    expect(akcInfo.fullName).toBe('American Kennel Club');
    expect(akcInfo.country).toBe('USA');
    expect(akcInfo.registrationPattern).toBe('XX########');

    const ukcInfo = getOrganizationInfo('UKC');
    expect(ukcInfo.fullName).toBe('United Kennel Club');
    expect(ukcInfo.country).toBe('USA');

    const ckcInfo = getOrganizationInfo('CKC');
    expect(ckcInfo.fullName).toBe('Canadian Kennel Club');
    expect(ckcInfo.country).toBe('Canada');

    const fciInfo = getOrganizationInfo('FCI');
    expect(fciInfo.fullName).toBe('Fédération Cynologique Internationale');
    expect(fciInfo.country).toBe('International');
  });

  it('should handle invalid dates correctly', () => {
    const invalidDateData = validateRegistrationData({
      ...mockRegistrationInput,
      submissionDate: 'invalid-date',
      registrationDate: 'also-invalid',
    });
    expect(invalidDateData.isValid).toBe(false);
    expect(invalidDateData.errors).toContain('Invalid submission date format');
    expect(invalidDateData.errors).toContain('Invalid registration date format');
  });

  it('should handle unknown organizations gracefully', () => {
    const unknownOrgData = validateRegistrationData({
      ...mockRegistrationInput,
      organization: 'UNKNOWN_ORG',
      registrationNumber: 'ABC123',
    });
    // Should be valid for unknown organizations with reasonable length
    expect(unknownOrgData.isValid).toBe(true);

    const unknownOrgInfo = getOrganizationInfo('UNKNOWN_ORG');
    expect(unknownOrgInfo.fullName).toBe('UNKNOWN_ORG');
    expect(unknownOrgInfo.country).toBe('Unknown');
    expect(unknownOrgInfo.registrationPattern).toBe('Varies');
  });

  it('should handle missing optional fields correctly', () => {
    const minimalData: RegistrationInput = {
      dogId: 'dog-123',
      organization: 'AKC',
      registeredName: 'Test Dog',
      breed: 'Test Breed',
      status: 'pending',
    };

    const validation = validateRegistrationData(minimalData);
    expect(validation.isValid).toBe(true);

    const dbInsert = mapRegistrationInputToInsert(minimalData);
    expect(dbInsert.variety).toBe(null);
    expect(dbInsert.registration_number).toBe(null);
    expect(dbInsert.application_number).toBe(null);
  });
});