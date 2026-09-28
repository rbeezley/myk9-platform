import { describe, expect, it } from 'vitest';
import { commonValidations, normalizeWebsiteUrl } from './validation';

describe('normalizeWebsiteUrl', () => {
  it('prepends https:// to a bare domain', () => {
    expect(normalizeWebsiteUrl('myclub.org')).toEqual({
      value: 'https://myclub.org',
      valid: true,
    });
  });

  it('prepends https:// to a bare www domain, keeping the www', () => {
    expect(normalizeWebsiteUrl('www.myclub.org')).toEqual({
      value: 'https://www.myclub.org',
      valid: true,
    });
  });

  it('keeps an existing https:// value as-is', () => {
    expect(normalizeWebsiteUrl('https://myclub.org')).toEqual({
      value: 'https://myclub.org',
      valid: true,
    });
  });

  it('keeps an existing http:// value as-is', () => {
    expect(normalizeWebsiteUrl('http://myclub.org')).toEqual({
      value: 'http://myclub.org',
      valid: true,
    });
  });

  it('keeps an uppercase or mixed-case scheme instead of prepending another', () => {
    expect(normalizeWebsiteUrl('HTTP://myclub.org')).toEqual({
      value: 'HTTP://myclub.org',
      valid: true,
    });
    expect(normalizeWebsiteUrl('Https://myclub.org')).toEqual({
      value: 'Https://myclub.org',
      valid: true,
    });
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizeWebsiteUrl('  myclub.org  ')).toEqual({
      value: 'https://myclub.org',
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
});

describe('commonValidations.url', () => {
  it('normalizes a bare domain to https:// on parse', () => {
    expect(commonValidations.url.parse('myclub.org')).toBe('https://myclub.org');
  });

  it('keeps an existing https:// value on parse', () => {
    expect(commonValidations.url.parse('https://myclub.org')).toBe('https://myclub.org');
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
