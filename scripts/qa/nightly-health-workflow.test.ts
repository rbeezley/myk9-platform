import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/nightly-health.yml'),
  'utf8'
);

describe('nightly health workflow', () => {
  it('builds shared packages before running route health', () => {
    const buildStep = "run: pnpm -r --filter='./packages/*' build";
    const healthStep = 'run: pnpm qa:nightly:health';

    expect(workflow).toContain(buildStep);
    expect(workflow.indexOf(buildStep)).toBeLessThan(workflow.indexOf(healthStep));
  });
});
