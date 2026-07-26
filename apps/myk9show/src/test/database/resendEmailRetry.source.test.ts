import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');

const helperPaths = [
  'supabase/functions/_shared/resendEmail.ts',
  'apps/myk9show/supabase/functions/_shared/resendEmail.ts',
] as const;

const callerPaths = [
  'supabase/functions/send-confirmation-email/index.ts',
  'supabase/functions/send-email/index.ts',
  'supabase/functions/send-lifecycle-email/lifecycle-email-handler.ts',
  'supabase/functions/send-registration-email/index.ts',
  'supabase/functions/send-results/index.ts',
  'supabase/functions/send-waitlist-invite/index.ts',
  'supabase/functions/push-trigger-support-message/index.ts',
  'apps/myk9show/supabase/functions/cron-process-payouts/index.ts',
  'apps/myk9show/supabase/functions/_shared/alertAdmin.ts',
] as const;

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) return typescriptFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

describe('Resend retry source contract', () => {
  it('keeps the helpers byte-identical across the two deployment roots', () => {
    expect(source(helperPaths[1])).toBe(source(helperPaths[0]));
  });

  it.each(callerPaths)('%s sends through the shared retry helper', path => {
    const contents = source(path);

    expect(contents).toMatch(
      /import \{ sendResendEmailWithRetry \} from ['"].*resendEmail\.ts['"]/
    );
    expect(contents).toContain('sendResendEmailWithRetry(');
  });

  it('defaults the injectable auth-email sender to the shared retry helper', () => {
    const contents = source('supabase/functions/send-auth-email/delivery.ts');

    expect(contents).toMatch(
      /import \{ sendResendEmailWithRetry \} from ['"].*resendEmail\.ts['"]/
    );
    expect(contents).toContain('dependencies.sendEmail ?? sendResendEmailWithRetry');
  });

  it('allows the Resend emails endpoint only inside the shared helpers', () => {
    const roots = [
      resolve(repoRoot, 'supabase/functions'),
      resolve(repoRoot, 'apps/myk9show/supabase/functions'),
    ];
    const endpointOwners = roots
      .flatMap(typescriptFiles)
      .filter(path => readFileSync(path, 'utf8').includes('https://api.resend.com/emails'))
      .map(path => path.slice(repoRoot.length + 1))
      .sort();

    expect(endpointOwners).toEqual([...helperPaths].sort());
  });
});
