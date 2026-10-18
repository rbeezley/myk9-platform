/**
 * The `event_type` values `usePwaInstallTelemetry` can write (the
 * `PwaTelemetryEvent` union in features/pwa/pwaInstallTelemetry.ts), always with
 * `section_name: 'pwa_install'`. A signed-in mount fires `pwa_install_state` on
 * its own, so a replay sees it whether or not it asked (MYK9-1255). Anything
 * else aimed at `analytics_events` is still an unanticipated write.
 */
export const AMBIENT_PWA_TELEMETRY_EVENTS: ReadonlySet<string> = new Set([
  'pwa_install_state',
  'pwa_install_accepted',
  'pwa_install_dismissed',
  'pwa_ios_instructions_shown',
]);

/** True only for a POST to analytics_events whose every row is PWA install telemetry. */
export function isPwaTelemetryInsert(method: string, pathname: string, body: unknown): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  if (pathname !== '/rest/v1/analytics_events') return false;

  const rows = Array.isArray(body) ? body : [body];
  return (
    rows.length > 0 &&
    rows.every(row => {
      if (typeof row !== 'object' || row === null) return false;
      const { event_type, section_name } = row as Record<string, unknown>;
      return (
        section_name === 'pwa_install' &&
        typeof event_type === 'string' &&
        AMBIENT_PWA_TELEMETRY_EVENTS.has(event_type)
      );
    })
  );
}
