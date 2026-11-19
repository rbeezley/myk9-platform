// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { sendClubAdminInviteHandler, type InviteSendDeps } from './inviteHandler.ts';

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

const INVITE_ID = '00000000-0000-0000-0000-000000221199';

function makeDeps(overrides: Partial<InviteSendDeps> = {}) {
  const sendEmail = vi.fn<InviteSendDeps['sendEmail']>(
    async () => new Response('{}', { status: 200 })
  );
  const prepareSend = vi.fn(async () => ({
    data: [
      {
        invite_email: 'new.person@example.test',
        club_name: 'Test <Club>',
        inviter_name: 'Alice AdminA',
        expires_at: '2026-12-04T00:00:00Z',
        invite_token: TOKEN,
      },
    ],
    error: null,
  }));
  const deps: InviteSendDeps = {
    resendApiKey: 'key',
    siteUrl: 'https://app.test/',
    fromEmail: 'myK9Show <n@example.test>',
    sendEmail,
    prepareSend,
    ...overrides,
  };
  return { deps, sendEmail, prepareSend };
}

describe('sendClubAdminInviteHandler', () => {
  it('sends to the address the RPC returned, with an escaped club name and the token link', async () => {
    const { deps, sendEmail, prepareSend } = makeDeps();
    const result = await sendClubAdminInviteHandler({ body: { inviteId: INVITE_ID } }, deps);

    expect(prepareSend).toHaveBeenCalledWith(INVITE_ID);
    expect(result).toEqual({ ok: true, sentTo: 'new.person@example.test' });
    const init = sendEmail.mock.calls[0][0];
    const payload = JSON.parse(init.body);
    expect(payload.to).toEqual(['new.person@example.test']);
    expect(payload.html).toContain(`href="https://app.test/club-invite/${TOKEN}"`);
    expect(payload.html).toContain('Test &lt;Club&gt;');
    expect(payload.html).not.toContain('Test <Club>');
  });

  it('sends nothing and returns 403 when the caller does not administer the club', async () => {
    const { deps, sendEmail } = makeDeps({
      prepareSend: async () => ({ data: null, error: { code: '42501', message: 'no' } }),
    });
    await expect(
      sendClubAdminInviteHandler({ body: { inviteId: INVITE_ID } }, deps)
    ).rejects.toMatchObject({ status: 403 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('returns 409 with the throttle message when the invite was just sent', async () => {
    const { deps, sendEmail } = makeDeps({
      prepareSend: async () => ({
        data: null,
        error: { code: 'P0001', message: 'That invite was just sent.' },
      }),
    });
    await expect(
      sendClubAdminInviteHandler({ body: { inviteId: INVITE_ID } }, deps)
    ).rejects.toMatchObject({ status: 409, message: 'That invite was just sent.' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('passes the RPC hint through as the body code', async () => {
    const { deps } = makeDeps({
      prepareSend: async () => ({
        data: null,
        error: { code: 'P0001', message: 'This invite has expired.', hint: 'expired' },
      }),
    });
    await expect(
      sendClubAdminInviteHandler({ body: { inviteId: INVITE_ID } }, deps)
    ).rejects.toMatchObject({ status: 409, code: 'expired' });
  });

  it('rejects a missing or malformed inviteId before touching the RPC', async () => {
    const { deps, prepareSend } = makeDeps();
    await expect(sendClubAdminInviteHandler({ body: {} }, deps)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      sendClubAdminInviteHandler({ body: { inviteId: 'nope' } }, deps)
    ).rejects.toMatchObject({ status: 400 });
    expect(prepareSend).not.toHaveBeenCalled();
  });

  it('returns 503 when the email provider key is not configured', async () => {
    const { deps, prepareSend } = makeDeps({ resendApiKey: undefined });
    await expect(
      sendClubAdminInviteHandler({ body: { inviteId: INVITE_ID } }, deps)
    ).rejects.toMatchObject({ status: 503 });
    expect(prepareSend).not.toHaveBeenCalled();
  });

  it('returns 502 when the provider refuses the message', async () => {
    const { deps } = makeDeps({ sendEmail: async () => new Response('x', { status: 500 }) });
    await expect(
      sendClubAdminInviteHandler({ body: { inviteId: INVITE_ID } }, deps)
    ).rejects.toMatchObject({ status: 502 });
  });
});
