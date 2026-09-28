import { describe, expect, it } from 'vitest';
import { getShowPreviewHref, resolvePreviewReturnHref } from './showPreviewRoutes';

describe('getShowPreviewHref', () => {
  it('builds a preview link carrying the return step', () => {
    expect(getShowPreviewHref('show-1', '/shows/show-1?edit=true&editTab=premium')).toBe(
      '/shows/show-1?preview=public&returnTo=%2Fshows%2Fshow-1%3Fedit%3Dtrue%26editTab%3Dpremium'
    );
  });
});

describe('resolvePreviewReturnHref', () => {
  it('accepts the show overview as a return destination', () => {
    expect(resolvePreviewReturnHref('/shows/show-1', 'show-1')).toBe('/shows/show-1');
  });

  it('accepts a deep link back into the edit panel, query included', () => {
    expect(resolvePreviewReturnHref('/shows/show-1?edit=true&editTab=premium', 'show-1')).toBe(
      '/shows/show-1?edit=true&editTab=premium'
    );
  });

  it('rejects a missing return destination', () => {
    expect(resolvePreviewReturnHref(null, 'show-1')).toBeNull();
    expect(resolvePreviewReturnHref(undefined, 'show-1')).toBeNull();
  });

  it('rejects an off-site destination', () => {
    expect(resolvePreviewReturnHref('https://evil.example/steal', 'show-1')).toBeNull();
  });

  it('rejects a protocol-relative destination', () => {
    expect(resolvePreviewReturnHref('//evil.example/steal', 'show-1')).toBeNull();
  });

  it('rejects a destination for a different show', () => {
    expect(resolvePreviewReturnHref('/shows/show-2', 'show-1')).toBeNull();
  });

  it('rejects a destination that points back into preview, avoiding an exit loop', () => {
    expect(resolvePreviewReturnHref('/shows/show-1?preview=public', 'show-1')).toBeNull();
  });

  it('rejects a malformed percent escape instead of throwing', () => {
    expect(resolvePreviewReturnHref('/shows/%ZZ', 'show-1')).toBeNull();
  });

  it('rejects a nested path outside the show overview page', () => {
    expect(resolvePreviewReturnHref('/shows/show-1/setup', 'show-1')).toBeNull();
  });
});
