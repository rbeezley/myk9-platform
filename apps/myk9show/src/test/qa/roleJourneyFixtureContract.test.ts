import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const auditSkill = readFileSync(
  resolve(repoRoot, '.codex/skills/role-journey-ux-audit/SKILL.md'),
  'utf8'
);

describe('role journey audit fixture contract', () => {
  it('resolves the canonical secretary fixture instead of naming or banning a domain', () => {
    expect(auditSkill).toContain('TEST_USERS.SECRETARY');
    expect(auditSkill).toContain('E2E_SECRETARY_EMAIL');
    expect(auditSkill).toContain('E2E_SECRETARY_PASSWORD');
    expect(auditSkill).toContain(
      'pnpm exec tsx scripts/verify-e2e-auth-preflight.ts secretary'
    );
    expect(auditSkill).not.toContain('never use legacy `*@myk9t.com` fixtures');
  });

  it('fails as a precise environment coverage gap without exposing secrets', () => {
    expect(auditSkill).toContain('environment coverage gap');
    expect(auditSkill).toMatch(/Never print, log, or copy resolved\s+credential values/);
  });
});
