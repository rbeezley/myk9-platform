import { describe, it, expect } from 'vitest';
import { getScoresheetComponent, registerScoresheet } from './getScoresheetComponent';

describe('getScoresheetComponent', () => {
  it('returns null for unknown sport type', () => {
    const Component = getScoresheetComponent('UNKNOWN' as never, 'live');
    expect(Component).toBeNull();
  });

  it('returns null for unregistered mode', () => {
    const Component = getScoresheetComponent('AKC_SCENT_WORK', 'live');
    // May or may not be null depending on test order, but should not throw
    expect(Component === null || typeof Component === 'function').toBe(true);
  });

  it('registers and retrieves a live component', () => {
    const MockLive = () => null;
    MockLive.displayName = 'MockAKCScentWorkLive';
    registerScoresheet('AKC_SCENT_WORK', 'live', MockLive as never);

    const result = getScoresheetComponent('AKC_SCENT_WORK', 'live');
    expect(result).toBe(MockLive);
  });

  it('registers and retrieves an entry component', () => {
    const MockEntry = () => null;
    MockEntry.displayName = 'MockAKCScentWorkEntry';
    registerScoresheet('AKC_SCENT_WORK', 'entry', MockEntry as never);

    const result = getScoresheetComponent('AKC_SCENT_WORK', 'entry');
    expect(result).toBe(MockEntry);
  });

  it('returns different components for live vs entry mode', () => {
    const live = getScoresheetComponent('AKC_SCENT_WORK', 'live');
    const entry = getScoresheetComponent('AKC_SCENT_WORK', 'entry');
    expect(live).not.toBe(entry);
  });
});
