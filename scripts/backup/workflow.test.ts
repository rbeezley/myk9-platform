import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('scheduled export workflow contract', () => {
  it('isolates daily retention behind successful verification and explicit activation', () => {
    const workflow = readFileSync('.github/workflows/independent-database-retention.yml', 'utf8');
    const exportWorkflow = readFileSync(
      '.github/workflows/independent-database-exports.yml',
      'utf8'
    );
    expect(exportWorkflow).not.toContain('scripts/backup/retention.ts');
    expect(workflow).toContain('group: independent-database-retention');
    expect(exportWorkflow).toContain('group: independent-database-export');
    expect(workflow).toContain("cron: '37 10 * * *'");
    expect(workflow).not.toContain('workflow_dispatch');
    expect(workflow.match(/^\s+if:.*$/gm)?.map(line => line.trim())).toEqual([
      "if: vars.MYK9_EXPORTS_ENABLED == 'true'",
      'if: always()',
    ]);
    const verify = workflow.indexOf('run: pnpm exec tsx scripts/backup/verify.ts');
    const retention = workflow.indexOf('run: pnpm exec tsx scripts/backup/retention.ts');
    const reporter = workflow.indexOf('if: always()');
    expect(verify).toBeGreaterThan(-1);
    expect(retention).toBeGreaterThan(verify);
    expect(reporter).toBeGreaterThan(retention);
    expect(workflow).toContain("BACKUP_RETENTION_APPLY: 'true'");
    expect(workflow).toContain('BACKUP_BUCKET: myk9-database-backups');
    expect(workflow).toContain('BACKUP_PREFIX: myk9-platform');
    expect(workflow).toContain(
      'BACKUP_RETENTION_CONFIRM: DELETE myk9-database-backups/myk9-platform'
    );
    expect(workflow).toContain('workflow-name: Independent Database Retention');
  });

  it('keeps export and independent health jobs actionable and separately scheduled', () => {
    const exportWorkflow = readFileSync(
      '.github/workflows/independent-database-exports.yml',
      'utf8'
    );
    const healthWorkflow = readFileSync(
      '.github/workflows/independent-database-export-health.yml',
      'utf8'
    );
    expect(exportWorkflow).toContain("cron: '7 * * * *'");
    expect(exportWorkflow).toContain('issues: write');
    expect(exportWorkflow).toContain('uses: ./.github/actions/setup-backup-clients');
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain(
      'uses: ./.github/actions/setup-backup-clients'
    );
    expect(exportWorkflow).toContain(
      "BACKUP_FORCE_RUN: ${{ github.event_name == 'workflow_dispatch' }}"
    );
    expect(healthWorkflow).toContain("cron: '22 * * * *'");
    expect(healthWorkflow).toContain('issues: write');
    expect(healthWorkflow).toContain('BACKUP_NIGHTLY_HOUR: ${{ vars.MYK9_EXPORT_NIGHTLY_HOUR }}');
    expect(healthWorkflow.match(/BACKUP_NIGHTLY_HOUR:/g)).toHaveLength(1);
    expect(healthWorkflow).not.toContain('needs:');
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('pnpm qa:backups:test');
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('pnpm qa:backups:typecheck');
  });
});
