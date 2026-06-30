/**
 * Canonical myK9Show deep links built from the configured app base URL.
 *
 * V1 has no write tools; instead each diagnostic returns links to the app
 * surface where the admin can act. Routes verified against
 * apps/myk9show/src (show detail `/shows/:id`, entry management
 * `/shows/:showId/entry-management`).
 */
import type { AdminMcpConfig } from '../config';
import type { DiagnosticLink } from './types';

export function buildShowLink(
  config: AdminMcpConfig,
  showId: string,
): DiagnosticLink {
  return {
    label: 'Open show in myK9Show',
    url: `${config.appBaseUrl}/shows/${encodeURIComponent(showId)}`,
  };
}

export function buildEntryManagementLink(
  config: AdminMcpConfig,
  showId: string,
): DiagnosticLink {
  // Links to the show's Entry Management page. The page filters by a `trial`
  // query param, not an entry id, so we don't append an entry-select param it
  // would silently ignore — the diagnostic's evidence carries the entry id.
  return {
    label: 'Open entry management',
    url: `${config.appBaseUrl}/shows/${encodeURIComponent(showId)}/entry-management`,
  };
}
