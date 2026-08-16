/**
 * pwaInstallTelemetry — records whether exhibitors actually have the app on
 * their home screen, split by platform.
 *
 * WHY THIS NUMBER MATTERS (docs/plan-google-apple-integrations.md L4/L6):
 * iOS Safari only permits web push if the app has been added to the home
 * screen. So the iOS install rate decides whether SMS is a necessity or a
 * luxury, and whether the native-app question ever has to be answered. Without
 * it, both calls are guesses.
 *
 * Rides on the existing `analytics_events` table (migration 096) rather than a
 * new one — same append-only, admin-read RLS, same fire-and-forget contract as
 * useTrackSectionView. That table's user_id defaults to auth.uid() and is NOT
 * NULL, so signed-out visitors are not recorded; the metric is "of our
 * accounts, who installed", which is per-account by definition.
 */

export type PwaPlatform = 'ios' | 'android' | 'desktop';
export type PwaBrowser = 'safari' | 'chrome' | 'firefox' | 'other';

export interface PwaEnvironment {
  platform: PwaPlatform;
  browser: PwaBrowser;
  /** Running from the home screen / app window rather than a browser tab. */
  standalone: boolean;
  /** Notification permission at the time of the snapshot. */
  pushPermission: 'granted' | 'denied' | 'default' | 'unsupported';
}

export function detectPlatform(userAgent: string): PwaPlatform {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

export function detectBrowser(userAgent: string): PwaBrowser {
  const ua = userAgent.toLowerCase();
  // Order matters: Chrome/Firefox on iOS still carry "safari" in the UA.
  if (/crios|chrome|edg\//.test(ua)) return 'chrome';
  if (/fxios|firefox/.test(ua)) return 'firefox';
  if (/safari/.test(ua)) return 'safari';
  return 'other';
}

/** iOS Safari — the only iOS browser that can install a PWA or show web push. */
export function isIOSSafariUA(userAgent: string): boolean {
  return detectPlatform(userAgent) === 'ios' && detectBrowser(userAgent) === 'safari';
}

/**
 * True when this environment CAN receive web push only after being installed.
 * On iOS that is the whole population; elsewhere a browser tab can subscribe.
 */
export function requiresInstallForPush(platform: PwaPlatform): boolean {
  return platform === 'ios';
}

/**
 * The one number the plan is waiting on: is this session a push-capable
 * install, or an iOS user who will silently never receive a run alert?
 */
export function isPushReachable(environment: PwaEnvironment): boolean {
  if (environment.pushPermission === 'denied' || environment.pushPermission === 'unsupported') {
    return false;
  }
  if (requiresInstallForPush(environment.platform) && !environment.standalone) return false;
  return true;
}

export type PwaTelemetryEvent =
  /** Daily snapshot of where this account actually is. */
  | 'pwa_install_state'
  /** Native install prompt accepted. */
  | 'pwa_install_accepted'
  /** Native install prompt refused, or banner dismissed. */
  | 'pwa_install_dismissed'
  /** iOS "Add to Home Screen" instructions opened — intent without an outcome. */
  | 'pwa_ios_instructions_shown';

export interface PwaAnalyticsRow {
  event_type: PwaTelemetryEvent;
  section_name: string;
  page: string;
  metadata: Record<string, unknown>;
}

export function buildPwaAnalyticsRow(
  event: PwaTelemetryEvent,
  environment: PwaEnvironment,
  page: string
): PwaAnalyticsRow {
  return {
    event_type: event,
    section_name: 'pwa_install',
    page,
    metadata: {
      platform: environment.platform,
      browser: environment.browser,
      standalone: environment.standalone,
      pushPermission: environment.pushPermission,
      pushReachable: isPushReachable(environment),
    },
  };
}

const SNAPSHOT_KEY = 'pwa_install_state_recorded_on';

/** Local calendar day, so a daily snapshot is one row per account per day. */
export function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

/**
 * One state snapshot per account per day: enough to trend the install rate
 * without turning a show weekend into thousands of identical rows.
 */
export function shouldRecordSnapshot(
  storage: Pick<Storage, 'getItem'> | null,
  now: Date
): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(SNAPSHOT_KEY) !== todayKey(now);
  } catch {
    return true;
  }
}

export function markSnapshotRecorded(
  storage: Pick<Storage, 'setItem'> | null,
  now: Date
): void {
  if (!storage) return;
  try {
    storage.setItem(SNAPSHOT_KEY, todayKey(now));
  } catch {
    // Private mode / quota — losing dedup just means an extra row.
  }
}
