import { describe, expect, it } from 'vitest';
import type { Registration } from '@/types/dog-types';
import { toDogRegistrationInsert } from './useInlineDogRegistration';

describe('toDogRegistrationInsert', () => {
  it('keeps every organization-scoped registration field in the canonical mutation payload', () => {
    const registration: Registration = {
      id: 'local-registration',
      organization: 'UKC',
      registeredName: 'Official Name',
      registrationNumber: 'UKC-123',
      breed: 'Beagle',
      variety: '13 inch',
      status: 'Active',
      applicationNumber: 'APP-1',
      submissionDate: '2026-08-20',
      registrationDate: '2026-08-21',
      certificate: 'certificate.pdf',
    };

    expect(toDogRegistrationInsert('dog-1', registration)).toEqual({
      dog_id: 'dog-1',
      organization: 'UKC',
      registered_name: 'Official Name',
      registration_number: 'UKC-123',
      breed: 'Beagle',
      variety: '13 inch',
      status: 'Active',
      application_number: 'APP-1',
      submission_date: '2026-08-20',
      registration_date: '2026-08-21',
      certificate: 'certificate.pdf',
    });
  });
});
