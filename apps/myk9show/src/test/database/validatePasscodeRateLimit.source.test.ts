import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const source = readFileSync(
  resolve(repoRoot, 'supabase/functions/validate-passcode/index.ts'),
  'utf8'
);

describe('validate-passcode rate-limit integration', () => {
  it('runs the fail-closed orchestration seam before passcode validation', () => {
    expect(source).toContain("from './rateLimitGate.ts'");

    const gate = source.indexOf('enforcePasscodeRateLimit({');
    const validation = source.indexOf("supabaseClient.rpc('validate_passcode'");

    expect(gate).toBeGreaterThan(-1);
    expect(validation).toBeGreaterThan(gate);
    expect(source).not.toContain('Continue without rate limiting');
  });

  it('does not log submitted passcode material', () => {
    expect(source).not.toContain('prefix: ${passcodePrefix}');
    expect(source).not.toMatch(/console\.(?:log|error|warn)\([^\n]*passcodePrefix/);
  });
});
