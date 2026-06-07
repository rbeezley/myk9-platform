/**
 * App Version Configuration
 *
 * Two types of versioning:
 * 1. Product Version (from package.json) - Marketing version shown to users (e.g., "0.0.1")
 * 2. Build Timestamp (from Vite) - Auto-generated for cache busting and debugging
 * 3. Build Reference (from Vercel git metadata) - PR number or commit SHA for support
 */

import { version } from '../../package.json';

/** Product version from package.json */
export const productVersion = version;

/** Build timestamp - unique per deployment. Stable 'dev' fallback so the
 *  PWA prompt-once de-dup key doesn't change on every page load when the
 *  define isn't injected (unit tests, dev server, misconfigured build). */
export const buildTimestamp =
  typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'dev';

export const buildCommitSha =
  typeof __GIT_COMMIT_SHA__ !== 'undefined' ? __GIT_COMMIT_SHA__ : '';

export const buildCommitMessage =
  typeof __GIT_COMMIT_MESSAGE__ !== 'undefined' ? __GIT_COMMIT_MESSAGE__ : '';

export const getBuildReference = (commitMessage: string, commitSha: string): string => {
  const prMatches = Array.from(commitMessage.matchAll(/\(#(\d+)\)/g));
  const lastPrMatch = prMatches[prMatches.length - 1];
  if (lastPrMatch?.[1]) return `#${lastPrMatch[1]}`;

  const normalizedSha = commitSha.trim();
  return normalizedSha.length >= 7 ? normalizedSha.slice(0, 7) : '';
};

export const buildReference = getBuildReference(buildCommitMessage, buildCommitSha);

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

export const formattedBuildLabel = buildReference
  ? `${formattedBuildDate} · ${buildReference}`
  : formattedBuildDate;
