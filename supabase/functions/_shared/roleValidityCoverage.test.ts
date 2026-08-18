import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROLE_VALIDITY_PATHS = [
  '../admin-generate-reset-link/generateResetLinkHandler.ts',
  '../admin-delete-user/deleteUserHandler.ts',
  '../admin-invite-user/inviteUserHandler.ts',
  '../send-registration-email/index.ts',
  '../send-lifecycle-email/lifecycle-email-handler.ts',
  '../send-targeted-message/targeted-message-handler.ts',
  '../push-trigger-chat-message/index.ts',
  '../push-trigger-support-message/index.ts',
  '../generate-premium/index.ts',
  '../send-email/authz.ts',
  '../send-results/authz.ts',
  '../push-trigger-announcement/index.ts',
  '../ask-myk9show/index.ts',
];

describe('privileged Edge role-validity coverage', () => {
  it.each(ROLE_VALIDITY_PATHS)('uses the shared role-validity helper: %s', relativePath => {
    const source = readFileSync(join(__dirname, relativePath), 'utf8');

    expect(source).toContain("from '../_shared/roleValidity.ts'");
    expect(source).toContain('applyActiveRoleValidity');
  });

});
