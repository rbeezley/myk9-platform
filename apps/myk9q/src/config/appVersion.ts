/**
 * App Version Configuration
 *
 * Two types of versioning:
 * 1. Product Version (from package.json) - Marketing version shown to users (e.g., "3.0")
 * 2. Build Timestamp (from Vite) - Auto-generated for cache busting and debugging
 */

import { version } from '../../package.json';

// Build timestamp - injected by Vite at build time
declare const __BUILD_TIMESTAMP__: string;

/** Product version from package.json (e.g., "3.0") */
export const productVersion = version;

/** Build timestamp - unique per deployment */
export const buildTimestamp = typeof __BUILD_TIMESTAMP__ !== 'undefined'
  ? __BUILD_TIMESTAMP__
  : new Date().toISOString(); // Fallback for dev/test

/** Formatted build date for display (e.g., "Dec 16, 2025 2:30 PM") */
export const formattedBuildDate = new Date(buildTimestamp).toLocaleString('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
