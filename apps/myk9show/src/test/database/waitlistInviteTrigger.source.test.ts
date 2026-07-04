import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const waitlistFormSource = readFileSync(
  resolve(__dirname, '../../components/landing/v2/WaitlistFormLanding.tsx'),
  'utf8'
);

const inviteFunctionSource = readFileSync(
  resolve(__dirname, '../../../../../supabase/functions/send-waitlist-invite/index.ts'),
  'utf8'
);

const migrationSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260703170000_waitlist_invite_trigger_secret.sql'
  ),
  'utf8'
);

describe('waitlist invite trigger wiring', () => {
  it('sends club-secretary waitlist invites from a DB trigger with a Vault-held secret', () => {
    expect(migrationSource).toContain('vault.decrypted_secrets');
    expect(migrationSource).toContain("where name = 'edge_function_base_url'");
    expect(migrationSource).toContain("where name = 'waitlist_invite_secret'");
    expect(migrationSource).toContain('net.http_post');
    expect(migrationSource).toContain("edge_function_base_url || '/send-waitlist-invite'");
    expect(migrationSource).toContain("'x-myk9-waitlist-invite-secret', invite_secret");
    expect(migrationSource).toContain('after insert on public.platform_waitlist');
    expect(migrationSource).toContain("when (new.role = 'club_official')");
  });

  it('keeps the browser out of the privileged invite function', () => {
    expect(waitlistFormSource).not.toContain("functions.invoke('send-waitlist-invite'");
    expect(waitlistFormSource).toContain('The browser');
    expect(waitlistFormSource).toContain('WAITLIST_INVITE_SECRET');
  });

  it('keeps the edge function protected by the shared secret', () => {
    expect(inviteFunctionSource).toContain('assertWaitlistInviteSecret');
  });
});
