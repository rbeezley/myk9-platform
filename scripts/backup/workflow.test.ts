import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('scheduled export workflow contract', () => {
  it('isolates daily retention behind successful verification and explicit activation', () => {
    const workflow = readFileSync('.github/workflows/independent-database-exports.yml', 'utf8');
    const [exportJob, retentionJob] = workflow.split('\n  retention:\n');
    expect(retentionJob).toBeDefined();
    expect(exportJob).toContain('Verify latest export freshness');
    expect(exportJob).not.toContain('scripts/backup/retention.ts');
    expect(retentionJob).toContain('needs: export');
    expect(retentionJob).toContain(
      "if: vars.MYK9_EXPORTS_ENABLED == 'true' && github.event_name == 'schedule' && github.event.schedule == '37 10 * * *'"
    );
    expect(retentionJob).not.toContain('always() &&');
    expect(retentionJob).toContain('run: pnpm exec tsx scripts/backup/retention.ts');
    expect(retentionJob).toContain("BACKUP_RETENTION_APPLY: 'true'");
    expect(retentionJob).toContain(
      'BACKUP_RETENTION_CONFIRM: DELETE myk9-database-backups/myk9-platform'
    );
    expect(retentionJob).toContain('workflow-name: Independent Database Retention');
    expect(workflow).toContain("cron: '37 10 * * *'");
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
