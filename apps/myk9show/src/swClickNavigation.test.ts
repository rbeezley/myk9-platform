import { describe, expect, it } from 'vitest';
import { getNotificationActionUrl, routeNotificationClick } from './swClickNavigation';

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

describe('routeNotificationClick', () => {
  it('focuses an existing client already at the target URL without navigating', async () => {
    const events: string[] = [];
    const client = {
      url: `${ORIGIN}/at-show/show-1`,
      navigate: async (url: string) => {
        events.push(`navigate:${url}`);
        return null;
      },
      focus: async () => {
        events.push('focus:existing');
        return client;
      },
    };

    await routeNotificationClick([client], `${ORIGIN}/at-show/show-1`, async url => {
      events.push(`open:${url}`);
      return null;
    });

    expect(events).toEqual(['focus:existing']);
  });

  it('opens a new window instead of focusing a stale client when navigate returns null', async () => {
    const events: string[] = [];
    const staleClient = {
      url: `${ORIGIN}/exhibitor/entries`,
      navigate: async (url: string) => {
        events.push(`navigate:${url}`);
        return null;
      },
      focus: async () => {
        events.push('focus:stale');
        return staleClient;
      },
    };
    const openedClient = {
      url: `${ORIGIN}/at-show/show-1`,
      focus: async () => {
        events.push('focus:opened');
        return openedClient;
      },
    };

    await routeNotificationClick([staleClient], `${ORIGIN}/at-show/show-1`, async url => {
      events.push(`open:${url}`);
      return openedClient;
    });

    expect(events).toEqual([
      `navigate:${ORIGIN}/at-show/show-1`,
      `open:${ORIGIN}/at-show/show-1`,
      'focus:opened',
    ]);
  });

  it('opens a new window when client navigation throws', async () => {
    const events: string[] = [];
    const staleClient = {
      url: `${ORIGIN}/exhibitor/entries`,
      navigate: async (url: string) => {
        events.push(`navigate:${url}`);
        throw new Error('client went away');
      },
      focus: async () => {
        events.push('focus:stale');
        return staleClient;
      },
    };
    const openedClient = {
      url: `${ORIGIN}/at-show/show-1`,
      focus: async () => {
        events.push('focus:opened');
        return openedClient;
      },
    };

    await routeNotificationClick([staleClient], `${ORIGIN}/at-show/show-1`, async url => {
      events.push(`open:${url}`);
      return openedClient;
    });

    expect(events).toEqual([
      `navigate:${ORIGIN}/at-show/show-1`,
      `open:${ORIGIN}/at-show/show-1`,
      'focus:opened',
    ]);
  });

  it('opens a new window when no clients are available', async () => {
    const events: string[] = [];
    const openedClient = {
      url: `${ORIGIN}/at-show/show-1`,
      focus: async () => {
        events.push('focus:opened');
        return openedClient;
      },
    };

    await routeNotificationClick([], `${ORIGIN}/at-show/show-1`, async url => {
      events.push(`open:${url}`);
      return openedClient;
    });

    expect(events).toEqual([`open:${ORIGIN}/at-show/show-1`, 'focus:opened']);
  });
});
