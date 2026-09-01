import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeHealthSource = readFileSync(
  resolve(__dirname, 'e2e/route-health-by-role.spec.ts'),
  'utf8'
);

describe('nightly route-health diagnostics', () => {
  it('writes unsettled app API URLs to the job log', () => {
    expect(routeHealthSource).toContain(
      "console.log(`[route-health] ${routeId}: unsettled app API requests"
    );
    expect(routeHealthSource).toContain('settlement.pendingUrls.join(\',\')');
  });
});
