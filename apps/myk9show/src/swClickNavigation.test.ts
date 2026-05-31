import { describe, expect, it } from 'vitest';
import { getNotificationActionUrl } from './swClickNavigation';

const ORIGIN = 'https://myk9-platform-myk9show-eolf80hbs-richard-beezleys-projects.vercel.app';

describe('getNotificationActionUrl', () => {
  it('normalizes relative action URLs to same-origin absolute URLs', () => {
    expect(
      getNotificationActionUrl(
        { actionUrl: '/secretary/messages?showId=18802fc0-1558-4dc3-902d-989edef4df3c' },
        ORIGIN
      )
    ).toBe(`${ORIGIN}/secretary/messages?showId=18802fc0-1558-4dc3-902d-989edef4df3c`);
  });

  it('keeps same-origin absolute action URLs', () => {
    expect(
      getNotificationActionUrl(
        {
          actionUrl: `${ORIGIN}/secretary/messages?showId=18802fc0-1558-4dc3-902d-989edef4df3c`,
        },
        ORIGIN
      )
    ).toBe(`${ORIGIN}/secretary/messages?showId=18802fc0-1558-4dc3-902d-989edef4df3c`);
  });

  it('reads action URLs from nested push payload data', () => {
    expect(
      getNotificationActionUrl(
        {
          title: 'Message from the show secretary',
          data: {
            actionUrl: '/messages/18802fc0-1558-4dc3-902d-989edef4df3c',
          },
        },
        ORIGIN
      )
    ).toBe(`${ORIGIN}/messages/18802fc0-1558-4dc3-902d-989edef4df3c`);
  });

  it('falls back to the app root for cross-origin URLs', () => {
    expect(getNotificationActionUrl({ actionUrl: 'https://example.com/messages' }, ORIGIN)).toBe(
      `${ORIGIN}/`
    );
  });

  it.each([undefined, null, { actionUrl: '' }, { actionUrl: '   ' }])(
    'falls back to the app root when data has no usable action URL',
    data => {
      expect(getNotificationActionUrl(data, ORIGIN)).toBe(`${ORIGIN}/`);
    }
  );
});
