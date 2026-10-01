import { describe, expect, it } from 'vitest';
import { canonicalizeAccommodationUrl } from './landingData';

describe('canonicalizeAccommodationUrl', () => {
  it('canonicalizes a bare-domain url', () => {
    expect(canonicalizeAccommodationUrl({ name: 'Inn', url: 'good-inn.com' }).url).toBe(
      'https://good-inn.com/'
    );
  });

  it('drops a url with userinfo or a script scheme', () => {
    for (const url of ['https://good-inn.com\t@evil.com', 'javascript:alert(1)']) {
      const result = canonicalizeAccommodationUrl({ name: 'Inn', url });
      expect(result).toEqual({ name: 'Inn' });
      expect('url' in result).toBe(false);
    }
  });

  it('leaves an item without a url untouched', () => {
    const item = { name: 'Inn' };
    expect(canonicalizeAccommodationUrl(item)).toBe(item);
  });
});
