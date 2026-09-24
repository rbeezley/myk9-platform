import { describe, expect, it } from 'vitest';
import {
  derivePremiumPublish,
  PREMIUM_BUSY_REASON,
  PREMIUM_LOADING_REASON,
  PREMIUM_OFFLINE_REASON,
  PREMIUM_UNAVAILABLE_REASON,
  PREMIUM_UP_TO_DATE_REASON,
} from '../premiumPublishAction';
import type { PublishInfo } from '../usePublishInfo';

const PUBLISHED_AT = '2026-09-01T10:00:00Z';

function info(overrides: Partial<PublishInfo> = {}): PublishInfo {
  return {
    publishedLocator: 'https://example.test/premium.pdf',
    hasPublishedPremium: true,
    publishedAt: PUBLISHED_AT,
    updatedAt: PUBLISHED_AT,
    experienceIsPublished: true,
    ...overrides,
  };
}

const manager = { infoState: 'ready' as const, isBusy: false, showStaleBadge: true };

describe('derivePremiumPublish — what the card and the menu both read', () => {
  it('offers a first publish when nothing is published', () => {
    const { action, hasPublishedPremium } = derivePremiumPublish({
      ...manager,
      info: info({ publishedLocator: null, hasPublishedPremium: false, publishedAt: null }),
    });
    expect(hasPublishedPremium).toBe(false);
    expect(action).toEqual({ label: 'Generate & publish premium' });
  });

  it('disables publishing until the private-publication migration is available', () => {
    const { action } = derivePremiumPublish({
      ...manager,
      info: info({
        publishedLocator: null,
        hasPublishedPremium: false,
        publishedAt: null,
        versionedSchemaAvailable: false,
      }),
    });
    expect(action.disabledReason).toBe(
      'Premium publishing setup is still being deployed. Try again shortly.'
    );
  });

  it('GREYS the action when the premium is published and up to date', () => {
    // The defect this module exists to prevent: the card renders no publish
    // button in this state, while the header menu offered an enabled item that
    // would regenerate a live PDF nobody asked to change.
    const { needsRepublish, action } = derivePremiumPublish({ ...manager, info: info() });
    expect(needsRepublish).toBe(false);
    expect(action.disabledReason).toBe(PREMIUM_UP_TO_DATE_REASON);
  });

  it('offers a republish, in the card’s own words, when the show data moved on', () => {
    const { stale, action } = derivePremiumPublish({
      ...manager,
      info: info({ updatedAt: '2026-09-02T10:00:00Z' }),
    });
    expect(stale).toBe(true);
    expect(action).toEqual({ label: 'Republish premium' });
  });

  it('offers the landing publish when the PDF is current but the snapshot is not', () => {
    const { landingUnpublished, action } = derivePremiumPublish({
      ...manager,
      info: info({ experienceIsPublished: false }),
    });
    expect(landingUnpublished).toBe(true);
    expect(action).toEqual({ label: 'Publish landing page' });
  });

  it('greys while the publish read has not resolved, rather than guessing', () => {
    expect(
      derivePremiumPublish({ ...manager, info: undefined, infoState: 'loading' }).action
        .disabledReason
    ).toBe(PREMIUM_LOADING_REASON);
  });

  it('distinguishes a paused offline read from online loading', () => {
    expect(
      derivePremiumPublish({ ...manager, info: undefined, infoState: 'offline' }).action
        .disabledReason
    ).toBe(PREMIUM_OFFLINE_REASON);
  });

  it('greys when the publish read failed, and says so', () => {
    expect(
      derivePremiumPublish({ ...manager, info: undefined, infoState: 'unavailable' }).action
        .disabledReason
    ).toBe(PREMIUM_UNAVAILABLE_REASON);
  });

  it('greys while a publish is already running', () => {
    const { action } = derivePremiumPublish({ ...manager, info: info(), isBusy: true });
    expect(action).toEqual({ label: 'Publishing…', disabledReason: PREMIUM_BUSY_REASON });
  });

  it('hides staleness from a viewer it is not meant for', () => {
    // Exhibitors: the staleness signal is internal noise, so a stale premium
    // reads as published-and-current rather than as a job for them to do.
    const { stale, needsRepublish } = derivePremiumPublish({
      ...manager,
      showStaleBadge: false,
      info: info({ updatedAt: '2026-09-02T10:00:00Z' }),
    });
    expect(stale).toBe(false);
    expect(needsRepublish).toBe(false);
  });
});
