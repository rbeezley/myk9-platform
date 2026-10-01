import { describe, expect, it } from 'vitest';
import { getAddClassesHref } from '../addClassesHref';

describe('getAddClassesHref', () => {
  it('opens the show-level flow without a trial', () => {
    expect(getAddClassesHref('show-1')).toBe(
      '/secretary/create-show/wizard?showId=show-1&mode=add-classes'
    );
  });

  it('adds the trial focus', () => {
    expect(getAddClassesHref('show-1', 'trial-2')).toBe(
      '/secretary/create-show/wizard?showId=show-1&mode=add-classes&trialId=trial-2'
    );
  });
});
