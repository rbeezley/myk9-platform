import { describe, expect, it } from 'vitest';
import { getAddTrialsHref } from '../addTrialsHref';

describe('getAddTrialsHref', () => {
  it('opens the wizard in add-trials mode for the show', () => {
    expect(getAddTrialsHref('show-1')).toBe(
      '/secretary/create-show/wizard?showId=show-1&mode=add-trials'
    );
  });

  it('encodes the show id', () => {
    expect(getAddTrialsHref('a b&c')).toBe(
      '/secretary/create-show/wizard?showId=a+b%26c&mode=add-trials'
    );
  });
});
