/**
 * MYK9-570 round-1 review. The secretary's person edit sends a HAND-LISTED
 * payload, so a column the panel collects but the list does not name is dropped
 * with nothing to show for it — the form keeps the value on screen and the save
 * reports success. That is what happened to the junior handler fields.
 */
import { describe, expect, it } from 'vitest';
import { buildUserEditSavePayload } from './userEditSavePayload';

describe('buildUserEditSavePayload', () => {
  it('forwards the junior handler fields the panel collects', () => {
    expect(
      buildUserEditSavePayload({
        firstName: 'Mariana',
        dateOfBirth: '2011-03-04',
        juniorHandlerNumbers: { AKC: '7654321', ASCA: 'ASCA-9' },
      })
    ).toMatchObject({
      dateOfBirth: '2011-03-04',
      juniorHandlerNumbers: { AKC: '7654321', ASCA: 'ASCA-9' },
    });
  });

  it('omits them entirely when the panel did not produce them', () => {
    // `undefined` must not become `null`: that would clear a stored date of
    // birth on any save from a surface that does not edit it.
    const payload = buildUserEditSavePayload({ firstName: 'Mariana' });
    expect('dateOfBirth' in payload).toBe(false);
    expect('juniorHandlerNumbers' in payload).toBe(false);
  });

  it('forwards a cleared date of birth as an empty string, not as absent', () => {
    expect(buildUserEditSavePayload({ dateOfBirth: '' })).toMatchObject({ dateOfBirth: '' });
  });

  it('never carries derived or display-only fields into a people update', () => {
    const payload = buildUserEditSavePayload({
      firstName: 'Mariana',
      name: 'Mariana Rivera',
      dogs: ['dog-1'],
      roles: [],
      status: 'suspended',
    });
    for (const forbidden of ['name', 'dogs', 'roles', 'status']) {
      expect(forbidden in payload, `${forbidden} must not reach a people UPDATE`).toBe(false);
    }
  });

  it('prefers address over streetAddress and always sends the location fields', () => {
    expect(buildUserEditSavePayload({ streetAddress: '1 Main St' })).toMatchObject({
      address: '1 Main St',
      city: '',
      state: '',
      zipCode: '',
    });
  });
});
