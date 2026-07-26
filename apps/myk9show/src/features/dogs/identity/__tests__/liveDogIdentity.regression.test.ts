/**
 * MYK9-90 task 3.5 / 8.3.1 — regression against REAL production-shaped rows.
 *
 * The fixtures below are verbatim `dog_registrations` rows read from the live
 * database (project sojmvhhwsjxmfistvzbe) on 2026-07-25, not invented shapes.
 * "Ziva" is the multi-organization dog that already exists in the data — three
 * registrations, three different registration numbers, one shared breed.
 *
 * What this pins:
 *  - A real registered dog produces a real registration number on an AKC
 *    submission and a printed entry blank. Before this change both surfaces
 *    read `dogs.akc_number`, which is NULL for all 16 dogs, so every document
 *    shipped blank.
 *  - The `AKC` / `AKC (American Kennel Club)` spelling drift that exists in the
 *    live data resolves to the same organization.
 *  - Asking for one organization never returns another one's number.
 */

import { describe, expect, it } from 'vitest';
import { buildEntryBlankProps } from '@/features/heritage/entry-blank/buildEntryBlankProps';
import { resolveDogIdentityForOrganization, type DogRegistrationLike } from '../resolveDogIdentity';

// Verbatim live rows for dog 5b5aef31-6450-44fc-a81b-479d6bd8e219 ("Ziva").
const ZIVA_REGISTRATIONS: DogRegistrationLike[] = [
  {
    organization: 'UKC (United Kennel Club)',
    registration_number: 'P935-254',
    registered_name:
      'ACH NNCH NTD BN ACD BA AHD UCDX CH URO3 EN BEL CANTO I WANT IT ALL SPOT-ON',
    breed: 'Belgian Tervuren',
    variety: null,
  },
  {
    organization: 'AKC (American Kennel Club)',
    registration_number: 'DN61191906',
    registered_name:
      ' BEL CANTO I WANT IT ALL - CDX - BN - RN - DCAT - ACT1 - ACT1J - SWE - SCNE - SCM - SEM - SHDA - RATCHX3 - CZ8P - CGC',
    breed: 'Belgian Tervuren',
    variety: null,
  },
  {
    organization: 'Other',
    registration_number: 'BH-44740',
    registered_name: 'RATCHX9 BEL CANTO I WANT IT ALL RATI CZ8P2G REMX6',
    breed: 'Belgian Tervuren',
    variety: null,
  },
];

// Verbatim live row for dog 2a9cf892-… — stored with the SHORT organization
// spelling, which the removed `.eq('organization', 'AKC')` filter matched while
// missing the six rows using the long spelling.
const SHORT_SPELLING_REGISTRATION: DogRegistrationLike = {
  organization: 'AKC',
  registration_number: 'UAT-1_a1564e',
  registered_name: null,
  breed: null,
  variety: null,
};

describe('live data — organization-scoped identity', () => {
  it('resolves the AKC registration number for a real multi-organization dog', () => {
    const akc = resolveDogIdentityForOrganization(ZIVA_REGISTRATIONS, 'AKC');
    expect(akc.registrationNumber).toBe('DN61191906');
    expect(akc.breed).toBe('Belgian Tervuren');
    // Stored with a leading space in the live row; the resolver trims.
    expect(akc.registeredName?.startsWith('BEL CANTO')).toBe(true);
  });

  it('resolves the UKC registration number for the same dog', () => {
    expect(resolveDogIdentityForOrganization(ZIVA_REGISTRATIONS, 'UKC').registrationNumber).toBe(
      'P935-254'
    );
  });

  it('never returns one organization’s number when another is asked for', () => {
    const akc = resolveDogIdentityForOrganization(ZIVA_REGISTRATIONS, 'AKC');
    expect(akc.registrationNumber).not.toBe('P935-254');
    expect(akc.registrationNumber).not.toBe('BH-44740');
  });

  it('matches the short "AKC" spelling that also exists in the live data', () => {
    expect(
      resolveDogIdentityForOrganization([SHORT_SPELLING_REGISTRATION], 'AKC').registrationNumber
    ).toBe('UAT-1_a1564e');
  });

  it('returns nothing for an organization the real dog is not registered with', () => {
    expect(resolveDogIdentityForOrganization(ZIVA_REGISTRATIONS, 'ASCA').registrationNumber).toBe(
      null
    );
  });
});

describe('live data — a printed entry blank carries the registration number', () => {
  const props = buildEntryBlankProps({
    show: { name: 'Live Data Show', start_date: '2026-08-01', end_date: '2026-08-02' },
    // No registry_id → the shared selector defaults to AKC.
    trials: [{ id: 't1', date: '2026-08-01', trial_number: '1', display_order: 1 }],
    classes: [{ id: 'c1', trial_id: 't1', level: 'Novice', element: 'Container', section: 'A' }],
    judges: [{ trial_id: 't1', judgeName: 'J. Judge' }],
    club: { name: 'Live Club' },
    secretary: { name: 'S. Secretary' },
    entry: { trial_id: 't1', class_id: 'c1', entry_fee: 25 },
    dog: {
      name: 'Ziva',
      call_name: 'Ziva',
      sex: 'F',
      date_of_birth: '2019-04-01',
      registrations: ZIVA_REGISTRATIONS,
    },
    handler: { first_name: 'Real', last_name: 'Owner' },
  });

  it('prints the AKC number, not a blank and not the UKC number', () => {
    expect(props.dog.registrationNumber).toBe('DN61191906');
    expect(props.dog.registrationNumber).not.toBe('P935-254');
  });

  it('prints the AKC breed from the registration', () => {
    expect(props.dog.breed).toBe('Belgian Tervuren');
  });

  it('does not flag a missing registration for a properly registered dog', () => {
    expect(props.dog.missingRegistration).toBe(false);
  });
});
