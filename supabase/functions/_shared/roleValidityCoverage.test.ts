import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROLE_VALIDITY_PATHS = [
  '../admin-generate-reset-link/generateResetLinkHandler.ts',
  '../admin-delete-user/deleteUserHandler.ts',
  '../admin-invite-user/inviteUserHandler.ts',
  '../send-lifecycle-email/lifecycle-email-handler.ts',
  '../send-targeted-message/targeted-message-handler.ts',
  '../push-trigger-chat-message/recipients.ts',
  '../push-trigger-support-message/recipients.ts',
  '../send-email/authz.ts',
  '../send-access-request-emails/records.ts',
  '../send-results/authz.ts',
  '../push-trigger-announcement/index.ts',
];

describe('privileged Edge role-validity coverage', () => {
  // MYK9-1999: send-registration-email reads no user_roles row. It asks the database's own
  // predicates (can_manage_show, is_show_secretary), which apply is_active and expires_at.
  it('send-registration-email decides through the database predicates', () => {
    const source = readFileSync(join(__dirname, '../send-registration-email/index.ts'), 'utf8');
    expect(source).not.toContain("from('user_roles')");
    expect(source).toContain('resolveShowManager');
  });

  it.each(ROLE_VALIDITY_PATHS)('uses the shared role-validity helper: %s', relativePath => {
    const source = readFileSync(join(__dirname, relativePath), 'utf8');

    expect(source).toContain("from '../_shared/roleValidity.ts'");
    expect(source).toContain('applyActiveRoleValidity');
  });
});
