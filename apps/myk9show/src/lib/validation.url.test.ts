import { describe, expect, it } from 'vitest';
import { commonValidations, normalizeWebsiteUrl } from './validation';

describe('normalizeWebsiteUrl', () => {
  it('prepends https:// to a bare domain', () => {
    expect(normalizeWebsiteUrl('myclub.org')).toEqual({
      value: 'https://myclub.org/',
      valid: true,
    });
  });

  it('prepends https:// to a bare www domain, keeping the www', () => {
    expect(normalizeWebsiteUrl('www.myclub.org')).toEqual({
      value: 'https://www.myclub.org/',
      valid: true,
    });
  });

  it('keeps an existing https:// value as-is', () => {
    expect(normalizeWebsiteUrl('https://myclub.org')).toEqual({
      value: 'https://myclub.org/',
      valid: true,
    });
  });

  it('keeps an existing http:// value as-is', () => {
    expect(normalizeWebsiteUrl('http://myclub.org')).toEqual({
      value: 'http://myclub.org/',
      valid: true,
    });
  });

  it('lowercases an uppercase or mixed-case scheme instead of prepending another', () => {
    expect(normalizeWebsiteUrl('HTTP://myclub.org')).toEqual({
      value: 'http://myclub.org/',
      valid: true,
    });
    expect(normalizeWebsiteUrl('Https://myclub.org')).toEqual({
      value: 'https://myclub.org/',
      valid: true,
    });
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizeWebsiteUrl('  myclub.org  ')).toEqual({
      value: 'https://myclub.org/',
      valid: true,
    });
  });

  it('percent-encodes spaces in paths and queries', () => {
    expect(normalizeWebsiteUrl('https://example.org/dog show')).toEqual({
      value: 'https://example.org/dog%20show',
      valid: true,
    });
    expect(normalizeWebsiteUrl('https://example.org/?q=dog show')).toEqual({
      value: 'https://example.org/?q=dog%20show',
      valid: true,
    });
  });

  it('treats empty input as valid and empty', () => {
    expect(normalizeWebsiteUrl('')).toEqual({ value: '', valid: true });
    expect(normalizeWebsiteUrl(null)).toEqual({ value: '', valid: true });
    expect(normalizeWebsiteUrl(undefined)).toEqual({ value: '', valid: true });
  });

  it('reports invalid for a single word with no dot', () => {
    const result = normalizeWebsiteUrl('myclub');
    expect(result.valid).toBe(false);
  });

  it('reports invalid for text containing a space', () => {
    const result = normalizeWebsiteUrl('my club.org');
    expect(result.valid).toBe(false);
  });

  it('reports invalid for a malformed https:// value', () => {
    const result = normalizeWebsiteUrl('https://');
    expect(result.valid).toBe(false);
  });

  it('rejects a non-http(s) scheme instead of prepending https:// on top of it', () => {
    expect(normalizeWebsiteUrl('ftp://myclub.org')).toEqual({
      value: 'ftp://myclub.org',
      valid: false,
    });
  });

  it('rejects a javascript: scheme', () => {
    expect(normalizeWebsiteUrl('javascript://myclub.org')).toEqual({
      value: 'javascript://myclub.org',
      valid: false,
    });
  });

  it('rejects a mailto: value instead of treating it as a bare domain', () => {
    expect(normalizeWebsiteUrl('mailto:info@myclub.org')).toEqual({
      value: 'mailto:info@myclub.org',
      valid: false,
    });
  });

  it('rejects whitespace that hides a different hostname in credentials', () => {
    expect(normalizeWebsiteUrl('https://good-club.org\t@evil.com')).toEqual({
      value: 'https://good-club.org\t@evil.com',
      valid: false,
    });
  });

  it('rejects userinfo that would spoof the displayed domain', () => {
    for (const spoof of [
      'https://good-club.org@evil.com',
      'https://good-club.org\n@evil.com',
      'good-club.org\t@evil.com',
      'https://user:pass@good-club.org',
    ]) {
      expect(normalizeWebsiteUrl(spoof).valid).toBe(false);
    }
  });

  it('reports invalid for an https:// hostname with no dot', () => {
    const result = normalizeWebsiteUrl('https://word');
    expect(result.valid).toBe(false);
  });
});

describe('commonValidations.url', () => {
  it('normalizes a bare domain to https:// on parse', () => {
    expect(commonValidations.url.parse('myclub.org')).toBe('https://myclub.org/');
  });

  it('keeps an existing https:// value on parse', () => {
    expect(commonValidations.url.parse('https://myclub.org')).toBe('https://myclub.org/');
  });

  it('throws for a bare word that is still not a valid URL after normalizing', () => {
    expect(() => commonValidations.url.parse('myclub')).toThrow(
      'Please enter a valid website URL (e.g., example.com or https://example.com)'
    );
  });

  it('throws a protocol-specific message for a malformed https:// value', () => {
    expect(() => commonValidations.url.parse('https://')).toThrow('Please enter a valid URL');
  });

  it('passes empty string through unchanged', () => {
    expect(commonValidations.url.parse('')).toBe('');
  });
});
