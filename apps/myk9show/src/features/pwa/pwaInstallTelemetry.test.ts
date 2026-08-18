import { describe, expect, it } from 'vitest';
import {
  buildPwaAnalyticsRow,
  detectBrowser,
  detectPlatform,
  isIOSSafariUA,
  isPushReachable,
  markSnapshotRecorded,
  requiresInstallForPush,
  shouldRecordSnapshot,
  todayKey,
  type PwaEnvironment,
} from './pwaInstallTelemetry';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36';
const DESKTOP_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

function env(overrides: Partial<PwaEnvironment> = {}): PwaEnvironment {
  return {
    platform: 'ios',
    browser: 'safari',
    standalone: false,
    pushPermission: 'granted',
    ...overrides,
  };
}

describe('platform and browser detection', () => {
  it('classifies the phones exhibitors actually carry', () => {
    expect(detectPlatform(IPHONE_SAFARI)).toBe('ios');
    expect(detectPlatform(ANDROID_CHROME)).toBe('android');
    expect(detectPlatform(DESKTOP_SAFARI)).toBe('desktop');
  });

  it('does not mistake iOS Chrome for Safari (its UA still says Safari)', () => {
    expect(detectBrowser(IPHONE_CHROME)).toBe('chrome');
    expect(detectBrowser(IPHONE_SAFARI)).toBe('safari');
    expect(isIOSSafariUA(IPHONE_CHROME)).toBe(false);
    expect(isIOSSafariUA(IPHONE_SAFARI)).toBe(true);
  });

  it('does not treat desktop Safari as an iOS install candidate', () => {
    expect(isIOSSafariUA(DESKTOP_SAFARI)).toBe(false);
  });
});

describe('push reachability — the number L4/L6 hinge on', () => {
  it('requires an install only on iOS', () => {
    expect(requiresInstallForPush('ios')).toBe(true);
    expect(requiresInstallForPush('android')).toBe(false);
    expect(requiresInstallForPush('desktop')).toBe(false);
  });

  it('marks an uninstalled iOS user UNREACHABLE even with permission granted', () => {
    expect(isPushReachable(env({ standalone: false }))).toBe(false);
    expect(isPushReachable(env({ standalone: true }))).toBe(true);
  });

  it('treats an uninstalled Android browser tab as reachable', () => {
    expect(isPushReachable(env({ platform: 'android', standalone: false }))).toBe(true);
  });

  it('is unreachable when permission is denied or unsupported, on any platform', () => {
    expect(isPushReachable(env({ standalone: true, pushPermission: 'denied' }))).toBe(false);
    expect(
      isPushReachable(env({ platform: 'android', pushPermission: 'unsupported' }))
    ).toBe(false);
  });
});

describe('buildPwaAnalyticsRow', () => {
  it('records the environment split plus the derived reachability', () => {
    const row = buildPwaAnalyticsRow('pwa_install_state', env({ standalone: true }), '/exhibitor');

    expect(row).toEqual({
      event_type: 'pwa_install_state',
      section_name: 'pwa_install',
      page: '/exhibitor',
      metadata: {
        platform: 'ios',
        browser: 'safari',
        standalone: true,
        pushPermission: 'granted',
        pushReachable: true,
      },
    });
  });

  it('keeps section_name stable across event types so one query covers them', () => {
    for (const event of [
      'pwa_install_state',
      'pwa_install_accepted',
      'pwa_install_dismissed',
      'pwa_ios_instructions_shown',
    ] as const) {
      expect(buildPwaAnalyticsRow(event, env(), '/').section_name).toBe('pwa_install');
    }
  });
});

describe('daily snapshot dedup', () => {
  const day = new Date(2026, 7, 16, 9, 30);

  it('records once per local calendar day', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };

    expect(shouldRecordSnapshot(storage, day)).toBe(true);
    markSnapshotRecorded(storage, day);

    expect(shouldRecordSnapshot(storage, new Date(2026, 7, 16, 22, 0))).toBe(false);
    expect(shouldRecordSnapshot(storage, new Date(2026, 7, 17, 8, 0))).toBe(true);
  });

  it('records when storage is unavailable rather than losing the metric', () => {
    expect(shouldRecordSnapshot(null, day)).toBe(true);
    expect(
      shouldRecordSnapshot(
        {
          getItem: () => {
            throw new Error('private mode');
          },
        },
        day
      )
    ).toBe(true);
    expect(() =>
      markSnapshotRecorded(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        day
      )
    ).not.toThrow();
  });

  it('keys on local date, not UTC, so a show weekend reads correctly', () => {
    expect(todayKey(new Date(2026, 7, 16, 23, 59))).toBe('2026-08-16');
    expect(todayKey(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
});
