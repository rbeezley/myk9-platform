import { describe, expect, it } from 'vitest';
import {
  buildTrialPacketEmailHtml,
  callerRoleAuthorizesPacket,
  isValidTrialPacketPayload,
  payloadContainsRecipientFields,
  resolvePacketRecipients,
  resolveSignedLinkLifetimeSeconds,
  requirePacketRecipients,
  storagePathBelongsToSnapshot,
} from './delivery.ts';

describe('trial packet delivery rules', () => {
  it('rejects caller-controlled recipients and invalid packet metadata', () => {
    expect(payloadContainsRecipientFields({ showId: 'safe', recipients: ['outside@example.com'] })).toBe(true);
    expect(payloadContainsRecipientFields({ showId: 'safe' })).toBe(false);

    const payload = {
      showId: '11111111-1111-4111-8111-111111111111',
      snapshotId: '22222222-2222-4222-8222-222222222222',
      storagePath: '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf',
      generatedAt: '2026-08-20T22:00:00.000Z',
      sha256: 'a'.repeat(64),
      pageCount: 12,
      byteSize: 1024,
    };
    expect(isValidTrialPacketPayload(payload)).toBe(true);
    expect(isValidTrialPacketPayload({ ...payload, showId: 'not-a-uuid' })).toBe(false);
    expect(isValidTrialPacketPayload({ ...payload, generatedAt: 'not-a-date' })).toBe(false);
    expect(isValidTrialPacketPayload({ ...payload, byteSize: 20 * 1024 * 1024 + 1 })).toBe(false);
  });

  it('authorizes current show or club officials but not unrelated roles', () => {
    const show = { id: 'show-1', clubId: 'club-1' };
    expect(callerRoleAuthorizesPacket({ roleName: 'secretary', showId: 'show-1', clubId: null }, show)).toBe(true);
    expect(callerRoleAuthorizesPacket({ roleName: 'club_admin', showId: null, clubId: 'club-1' }, show)).toBe(true);
    expect(callerRoleAuthorizesPacket({ roleName: 'site_admin', showId: null, clubId: null }, show)).toBe(true);
    expect(callerRoleAuthorizesPacket({ roleName: 'secretary', showId: null, clubId: 'club-2' }, show)).toBe(false);
    expect(callerRoleAuthorizesPacket({ roleName: 'exhibitor', showId: 'show-1', clubId: 'club-1' }, show)).toBe(false);
  });

  it('binds the private object to the exact show and snapshot', () => {
    expect(storagePathBelongsToSnapshot('show-1/snapshot-1.pdf', 'show-1', 'snapshot-1')).toBe(true);
    expect(storagePathBelongsToSnapshot('show-2/snapshot-1.pdf', 'show-1', 'snapshot-1')).toBe(false);
    expect(storagePathBelongsToSnapshot('show-1/../snapshot-1.pdf', 'show-1', 'snapshot-1')).toBe(false);
  });

  it('derives and deduplicates operational recipients without accepting arbitrary addresses', () => {
    expect(
      resolvePacketRecipients([
        { roleName: 'secretary', showId: 'show-1', clubId: null, email: 'Secretary@example.com', activeClubMember: false },
        { roleName: 'trial_secretary', showId: 'show-1', clubId: null, email: 'secretary@example.com', activeClubMember: false },
        { roleName: 'club_admin', showId: null, clubId: 'club-1', email: 'admin@example.com', activeClubMember: true },
        { roleName: 'club_admin', showId: null, clubId: 'club-1', email: 'former@example.com', activeClubMember: false },
        { roleName: 'judge', showId: 'show-1', clubId: null, email: 'judge@example.com', activeClubMember: false },
      ], { id: 'show-1', clubId: 'club-1' })
    ).toEqual(['admin@example.com', 'Secretary@example.com']);
    expect(() => requirePacketRecipients([])).toThrow(
      'No current secretary or club administrator has an email address.'
    );
  });

  it('bounds signed links around the show window', () => {
    const now = new Date('2026-08-20T22:00:00.000Z');
    expect(resolveSignedLinkLifetimeSeconds('2026-10-04', now)).toBe(60 * 24 * 60 * 60);
    expect(resolveSignedLinkLifetimeSeconds('2026-07-01', now)).toBe(7 * 24 * 60 * 60);
  });

  it('escapes show text and makes the physical endpoint the primary instruction', () => {
    const html = buildTrialPacketEmailHtml({
      showName: '<Prairie & Fall>',
      generatedAt: '2026-08-20T22:00:00.000Z',
      signedUrl: 'https://storage.example/packet?token=abc',
      expiresAt: '2026-10-19T22:00:00.000Z',
    });

    expect(html).toContain('PRINT IT AND PUT IT IN THE TRIAL BOX');
    expect(html).toContain('opens without a myK9 session');
    expect(html).toContain('&lt;Prairie &amp; Fall&gt;');
    expect(html).not.toContain('<Prairie & Fall>');
  });
});
