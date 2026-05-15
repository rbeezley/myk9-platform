/**
 * App Version Configuration
 *
 * Two types of versioning:
 * 1. Product Version (from package.json) - Marketing version shown to users (e.g., "0.0.1")
 * 2. Build Timestamp (from Vite) - Auto-generated for cache busting and debugging
 */

import { version } from '../../package.json';

// Build timestamp - injected by Vite at build time
declare const __BUILD_TIMESTAMP__: string;

/** Product version from package.json */
export const productVersion = version;

/** Build timestamp - unique per deployment. Stable 'dev' fallback so the
 *  PWA prompt-once de-dup key doesn't change on every page load when the
 *  define isn't injected (unit tests, dev server, misconfigured build). */
export const buildTimestamp =
  typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'dev';

/** Formatted build date for display (e.g., "Dec 16, 2025 2:30 PM") */
export const formattedBuildDate =
  buildTimestamp === 'dev'
    ? 'Development'
    : new Date(buildTimestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
