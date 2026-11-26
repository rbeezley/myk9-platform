import { describe, it, expect } from 'vitest';
import { parseOnboardRequest } from './onboardRequest';

describe('parseOnboardRequest', () => {
  it('accepts a well-formed body', () => {
    expect(
      parseOnboardRequest(JSON.stringify({ club_id: 'c1', return_path: '/club-admin/payments' }))
    ).toEqual({ ok: true, value: { club_id: 'c1', return_path: '/club-admin/payments' } });
  });

  it.each(['', '{not json', 'null', '[]', '"club"', '42'])('rejects %j as invalid JSON', raw => {
    expect(parseOnboardRequest(raw)).toEqual({ ok: false, error: 'Invalid JSON body' });
  });

  it.each([{}, { club_id: 'c1' }, { return_path: '/x' }, { club_id: 1, return_path: '/x' }])(
    'rejects %j as missing parameters',
    body => {
      expect(parseOnboardRequest(JSON.stringify(body))).toEqual({
        ok: false,
        error: 'Missing required parameters: club_id, return_path',
      });
    }
  );
});
