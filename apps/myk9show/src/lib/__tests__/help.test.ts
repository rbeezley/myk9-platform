import { describe, it, expect } from 'vitest';
import { HELP_BASE_URL, helpUrl } from '../help';

describe('helpUrl', () => {
  it('returns the help home when given no slug', () => {
    expect(helpUrl()).toBe('https://help.myk9show.com');
    expect(helpUrl()).toBe(HELP_BASE_URL);
  });

  it('deep-links a role guide when given a slug', () => {
    expect(helpUrl('exhibitor-guide')).toBe(
      'https://help.myk9show.com/guides/exhibitor-guide'
    );
    expect(helpUrl('secretary-guide')).toBe(
      'https://help.myk9show.com/guides/secretary-guide'
    );
    expect(helpUrl('club-admin-guide')).toBe(
      'https://help.myk9show.com/guides/club-admin-guide'
    );
  });

  it('builds every guide URL under the same base', () => {
    for (const slug of [
      'exhibitor-guide',
      'secretary-guide',
      'club-admin-guide',
    ] as const) {
      expect(helpUrl(slug).startsWith(`${HELP_BASE_URL}/guides/`)).toBe(true);
    }
  });
});
