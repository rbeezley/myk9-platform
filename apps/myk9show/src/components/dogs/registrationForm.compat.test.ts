import { describe, expect, it } from 'vitest';
import {
  registrationFormSchema,
  registrationOrgCode,
  registrationOrgLabel,
  registrationToFormData,
  formDataToRegistration,
} from './registrationForm';
const registration = {
  id: 'r1',
  organization: 'UKC',
  registeredName: 'Test Dog',
  registrationNumber: 'R123',
  breed: 'Beagle',
  status: 'pending',
} as const;
describe('registration compatibility', () => {
  it('resolves bare registry codes without falling back to AKC', () => {
    expect(registrationOrgCode('UKC')).toBe('UKC');
    expect(registrationOrgCode('ASCA (Australian Shepherd Club of America)')).toBe('ASCA');
  });
  it('does not rewrite the raw status when another field is edited in memory', () => {
    const data = registrationToFormData(registration);
    expect(formDataToRegistration({ ...data, registrationDate: '2026-09-23' }).status).toBe(
      'pending'
    );
  });
});

it('preserves an unfamiliar stored status on an unrelated edit, but saves deliberate status changes', () => {
  const data = registrationToFormData({ ...registration, status: 'legacy-review' });
  expect(formDataToRegistration({ ...data, registrationDate: '2026-09-23' }).status).toBe(
    'legacy-review'
  );
  expect(formDataToRegistration({ ...data, status: 'Pending' }).status).toBe('Pending');
});

it.each(['pending', 'approved', 'suspended', 'rejected'])(
  'keeps %s as the actual form value and accepts it in the shared schema',
  status => {
    const data = registrationToFormData({ ...registration, status });
    expect(data.status).toBe(status);
    expect(registrationFormSchema.safeParse(data).success).toBe(true);
    expect(formDataToRegistration({ ...data, status: 'Active' }).status).toBe('Active');
  }
);

describe('stored short organization codes (MYK9-1207)', () => {
  it.each([
    ['AKC', 'AKC (American Kennel Club)'],
    ['akc', 'AKC (American Kennel Club)'],
    ['UKC', 'UKC (United Kennel Club)'],
    ['ASCA', 'ASCA (Australian Shepherd Club of America)'],
    [' AKC ', 'AKC (American Kennel Club)'],
    ['akc (american kennel club)', 'AKC (American Kennel Club)'],
    ['American Kennel Club', 'AKC (American Kennel Club)'],
    ['other', 'Other'],
    ['PAL', 'PAL (Purebred Alternative Listing)'],
    ['ilp', 'ILP (Indefinite Listing Privilege)'],
  ])('loads %s as the full label %s', (stored, label) => {
    expect(registrationToFormData({ ...registration, organization: stored }).organization).toBe(
      label
    );
  });

  it('leaves an unrecognized or empty value as stored', () => {
    expect(registrationOrgLabel('NACSW')).toBe('NACSW');
    expect(registrationOrgLabel('')).toBe('');
  });

  it('saves the full label for a registration stored as a short code', () => {
    const data = registrationToFormData({ ...registration, organization: 'AKC' });
    expect(formDataToRegistration(data).organization).toBe('AKC (American Kennel Club)');
  });
});
