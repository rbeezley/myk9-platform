import { describe, expect, it } from 'vitest';
import { decodeOAuthRoleIntent, encodeOAuthRoleIntent } from './oauthRoleIntent';

describe('OAuth role intent', () => {
  it('serializes only supported role intents', () => {
    expect(encodeOAuthRoleIntent(['exhibitor', 'secretary', 'unknown'])).toBe(
      'exhibitor,secretary'
    );
  });

  it('decodes supported roles and ignores tampered values', () => {
    expect(decodeOAuthRoleIntent('exhibitor,secretary,site_admin')).toEqual([
      'exhibitor',
      'secretary',
    ]);
  });
});
