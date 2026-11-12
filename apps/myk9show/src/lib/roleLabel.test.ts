import { describe, expect, it } from 'vitest';
import { formatRoleLabel } from './roleLabel';

describe('formatRoleLabel', () => {
  it('replaces every underscore and capitalises each word', () => {
    expect(formatRoleLabel('club_admin')).toBe('Club Admin');
    expect(formatRoleLabel('site_admin')).toBe('Site Admin');
    expect(formatRoleLabel('a_b_c')).toBe('A B C');
  });

  it('leaves a one-word role as a capitalised word', () => {
    expect(formatRoleLabel('secretary')).toBe('Secretary');
  });
});
