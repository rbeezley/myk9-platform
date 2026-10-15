import { describe, expect, it } from 'vitest';
import { draftToRegistration, normalizeRegistration } from '../dogRegistrationWrites';

/** MYK9-1207: a registration with no organization saves under the full AKC label, never `AKC`. */
describe('registration write mappers default organization', () => {
  it('normalizeRegistration', () => {
    expect(
      normalizeRegistration(
        { organization: '', registeredName: 'A', number: '', type: '', status: '' },
        '2026-10-15T00:00:00.000Z'
      ).organization
    ).toBe('AKC (American Kennel Club)');
  });

  it('draftToRegistration', () => {
    expect(
      draftToRegistration({ registered_name: 'A' } as never, '2026-10-15T00:00:00.000Z')
        .organization
    ).toBe('AKC (American Kennel Club)');
  });
});
