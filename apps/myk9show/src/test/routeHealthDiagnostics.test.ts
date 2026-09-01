import { describe, expect, it, vi } from 'vitest';
import { logUnsettledAppApiRequests } from './harness/routeHealthDiagnostics';

describe('nightly route-health diagnostics', () => {
  it('writes pending URLs to the job log as an unambiguous JSON array', () => {
    const log = vi.fn();
    const diagnostic = logUnsettledAppApiRequests(
      'exhibitor/my-entries',
      ['https://example.test/rest/v1/classes?select=*', 'https://example.test/auth/v1/user'],
      log
    );

    expect(diagnostic).toBe(
      '["https://example.test/rest/v1/classes?select=*","https://example.test/auth/v1/user"]'
    );
    expect(log).toHaveBeenCalledWith(
      '[route-health] exhibitor/my-entries: unsettled app API requests: ["https://example.test/rest/v1/classes?select=*","https://example.test/auth/v1/user"]'
    );
  });

  it('reports an incomplete idle window when no URLs remain', () => {
    const log = vi.fn();

    expect(logUnsettledAppApiRequests('exhibitor/account', [], log)).toBe('idle-window-incomplete');
    expect(log).toHaveBeenCalledWith(
      '[route-health] exhibitor/account: unsettled app API requests: idle-window-incomplete'
    );
  });
});
