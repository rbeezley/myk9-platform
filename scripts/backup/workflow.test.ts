import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('scheduled export workflow contract', () => {
  it('keeps export and independent health jobs actionable and separately scheduled', () => {
    const exportWorkflow = readFileSync(
      '.github/workflows/independent-database-exports.yml',
      'utf8'
    );
    const healthWorkflow = readFileSync(
      '.github/workflows/independent-database-export-health.yml',
      'utf8'
    );
    expect(exportWorkflow).toContain("cron: '0 * * * *'");
    expect(exportWorkflow).toContain('issues: write');
    expect(healthWorkflow).toContain("cron: '15 * * * *'");
    expect(healthWorkflow).toContain('issues: write');
    expect(healthWorkflow).not.toContain('needs:');
  });
});
