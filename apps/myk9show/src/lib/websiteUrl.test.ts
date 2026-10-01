import { describe, expect, it } from 'vitest';
import { canonicalizeWebsiteUrl, getSafeWebsiteLink } from './websiteUrl';

describe('canonicalizeWebsiteUrl', () => {
  it('canonicalizes a bare domain', () => {
    expect(canonicalizeWebsiteUrl('good-club.org')).toBe('https://good-club.org/');
  });

  it.each([
    'https://good-club.org\t@evil.com',
    'https://good-club.org\n@evil.com',
    'https://good-club.org@evil.com',
    'https://user:pw@good-club.org',
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://good-club.org',
    'mailto:a@good-club.org',
    'https://word',
    '',
    '   ',
    null,
    undefined,
  ])('returns null for %j', value => {
    expect(canonicalizeWebsiteUrl(value)).toBeNull();
  });
});

describe('getSafeWebsiteLink', () => {
  it('yields matching href and label for a normal value', () => {
    expect(getSafeWebsiteLink('good-club.org')).toEqual({
      href: 'https://good-club.org/',
      label: 'good-club.org',
    });
  });

  it('keeps path and query in the label so it agrees with the href', () => {
    expect(getSafeWebsiteLink('https://good-club.org/events?y=2026')).toEqual({
      href: 'https://good-club.org/events?y=2026',
      label: 'good-club.org/events?y=2026',
    });
  });

  it('renders no link for a stored raw spoof value', () => {
    expect(getSafeWebsiteLink('https://good-club.org\t@evil.com')).toBeNull();
    expect(getSafeWebsiteLink('https://good-club.org@evil.com')).toBeNull();
  });
});
