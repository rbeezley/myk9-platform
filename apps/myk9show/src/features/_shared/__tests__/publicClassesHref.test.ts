import { describe, it, expect } from 'vitest';
import type { Trial } from '@/components/trials/types/trial.types';
import { publicClassesHref } from '../publicClassesHref';

const trial = (id: string) => ({ id }) as Trial;

describe('publicClassesHref', () => {
  it('points at the first trial details page (a PUBLIC route), not the auth-gated wizard', () => {
    const href = publicClassesHref('show-1', [trial('trial-a'), trial('trial-b')]);
    expect(href).toBe('/shows/show-1/trials/trial-a');
    expect(href).not.toContain('/register');
  });

  it('returns null when there are no trials', () => {
    expect(publicClassesHref('show-1', [])).toBeNull();
  });

  it('returns null when the show id is missing', () => {
    expect(publicClassesHref(null, [trial('trial-a')])).toBeNull();
    expect(publicClassesHref(undefined, [trial('trial-a')])).toBeNull();
  });
});
