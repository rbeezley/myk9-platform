/**
 * myK9Show wiring for the shared PWA update lifecycle.
 *
 * Injects `registerSW` from vite-plugin-pwa's virtual module and the app's
 * LoggingService into the shared `@myk9/pwa-update` package. The package
 * owns a module-level singleton, so `applyPwaUpdate` / `checkForPwaUpdate`
 * / `onUpdateAvailable` can be imported anywhere from `@myk9/pwa-update`
 * directly once `setupPwa` has been called.
 */

import { registerSW } from 'virtual:pwa-register';
import { setupPwaUpdate } from '@myk9/pwa-update';
import { logger } from '@/services/LoggingService';
import { buildTimestamp } from '@/config/appVersion';

export {
  applyPwaUpdate,
  checkForPwaUpdate,
  onUpdateAvailable,
  __resetPwaUpdateSingleton as __resetPwaUpdateForTests,
} from '@myk9/pwa-update';

export interface SetupPwaOptions {
  onPrompt: () => void;
}

/**
 * Routes where an update prompt could lose user work or interrupt a
 * payment/check-in flow. The package re-checks every 2s and fires the
 * prompt once the user navigates away.
 */
const SENSITIVE_PATH_FRAGMENTS = [
  '/checkout/',
  '/shows/', // covers /shows/:id/register
  '/exhibitor/check-in/',
  '/secretary/register/',
  '/scoring/',
];

export const isOnSensitiveRoute = (): boolean => {
  const path = window.location.pathname;
  // /shows/ matches both the registration flow AND the show detail page;
  // only defer on the register sub-route to keep marketing pages snappy.
  if (path.includes('/shows/') && !/\/shows\/[^/]+\/register/.test(path)) {
    return SENSITIVE_PATH_FRAGMENTS.filter(f => f !== '/shows/').some(f => path.includes(f));
  }
  return SENSITIVE_PATH_FRAGMENTS.some(f => path.includes(f));
};

export const setupPwa = (opts: SetupPwaOptions): void => {
  setupPwaUpdate({
    registerSW,
    version: buildTimestamp,
    onPrompt: opts.onPrompt,
    shouldDefer: isOnSensitiveRoute,
    logger: {
      info: (msg, meta) => logger.info(msg, 'pwa', meta),
      warn: (msg, meta) => logger.warn(msg, 'pwa', meta),
      error: (msg, meta) => logger.error(msg, 'pwa', meta),
    },
  });
};
