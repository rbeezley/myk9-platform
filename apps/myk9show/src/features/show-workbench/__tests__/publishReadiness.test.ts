import { describe, expect, it } from 'vitest';
import type { Show } from '@/types/show-types';
import {
  LANDING_CARD_ANCHOR,
  PREMIUM_CARD_ANCHOR,
  SHOW_STATUS_CONTROL_ANCHOR,
  buildPublishReadinessItems,
} from '../publishReadiness';

function show(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Heartland Classic',
    organization: 'Heartland Club',
    startDate: '2026-08-01',
    endDate: '2026-08-03',
    location: 'Springfield, IL',
    status: 'draft',
    events: [],
    source: 'myK9Show',
    entryOpenDate: '2026-07-01',
    entryCloseDate: '2026-07-20',
    preEntryFee: '30',
    clubId: 'club-1',
    clubName: 'Heartland Club',
    clubAddress: '',
    clubEmail: '',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: [],
    stats: [],
    trials: [],
    ...overrides,
  };
}

describe('buildPublishReadinessItems', () => {
  it('names all three publish states with qualified labels and actions', () => {
    const items = buildPublishReadinessItems(show());

    expect(items).toHaveLength(3);
    expect(items.map(item => item.title)).toEqual([
      'Show listing',
      'Premium PDF',
      'Landing page content',
    ]);
    expect(items.map(item => item.state)).toEqual([
      'Show listing is still draft',
      'Premium PDF is not published yet',
      'Landing page content is not published yet',
    ]);
    expect(items[0]?.href).toBe(`#${SHOW_STATUS_CONTROL_ANCHOR}`);
    expect(items[1]?.href).toBe(`#${PREMIUM_CARD_ANCHOR}`);
    expect(items[2]?.href).toBe(`#${LANDING_CARD_ANCHOR}`);
    // Every item must land on its own control, not a shared broad anchor.
    expect(new Set(items.map(item => item.href)).size).toBe(3);
  });

  it('marks each state ready independently', () => {
    const items = buildPublishReadinessItems(
      show({
        status: 'published',
        publishedPremiumUrl: 'https://example.test/premium.pdf',
        publishedPremiumAt: '2026-07-01T12:00:00.000Z',
        experienceIsPublished: true,
      })
    );

    expect(items.map(item => item.isReady)).toEqual([true, true, true]);
    expect(items.map(item => item.state)).toEqual([
      'Show listing is live',
      'Premium PDF is published',
      'Landing page content is published',
    ]);
  });

  it('does not treat the premium PDF as the same state as landing page content', () => {
    const items = buildPublishReadinessItems(
      show({
        status: 'published',
        publishedPremiumUrl: 'https://example.test/premium.pdf',
        publishedPremiumAt: '2026-07-01T12:00:00.000Z',
        experienceIsPublished: false,
      })
    );

    expect(items.find(item => item.id === 'premium-pdf')?.isReady).toBe(true);
    expect(items.find(item => item.id === 'landing-content')?.isReady).toBe(false);
  });

  it('distinguishes stale published premium from unpublished premium', () => {
    const items = buildPublishReadinessItems(
      show({
        status: 'published',
        publishedPremiumUrl: 'https://example.test/premium.pdf',
        publishedPremiumAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-01T12:05:30.000Z',
        experienceIsPublished: true,
      })
    );

    expect(items.find(item => item.id === 'premium-pdf')).toMatchObject({
      state: 'Premium PDF needs republish',
      actionLabel: 'Republish premium PDF',
      isReady: false,
    });
  });

  it('reads premium state from the premiumInfo override when the show object lacks it', () => {
    // Regression: `show` usually comes from the offline-replicated table,
    // which never carries publishedPremiumUrl/At, so this must not silently
    // fall back to reporting "not published yet" once fresher data exists.
    const items = buildPublishReadinessItems(show({ status: 'published' }), {
      publishedPremiumUrl: 'https://example.test/premium.pdf',
      publishedPremiumAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-01T12:00:00.000Z',
    });

    expect(items.find(item => item.id === 'premium-pdf')).toMatchObject({
      state: 'Premium PDF is published',
      isReady: true,
    });
  });

  it('prefers the premiumInfo override over stale/missing premium fields on the show object', () => {
    const items = buildPublishReadinessItems(
      show({
        status: 'published',
        publishedPremiumUrl: 'https://example.test/old.pdf',
        publishedPremiumAt: '2026-01-01T00:00:00.000Z',
      }),
      {
        publishedPremiumUrl: 'https://example.test/premium.pdf',
        publishedPremiumAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-01T12:05:30.000Z',
      }
    );

    expect(items.find(item => item.id === 'premium-pdf')).toMatchObject({
      state: 'Premium PDF needs republish',
      isReady: false,
    });
  });
});
