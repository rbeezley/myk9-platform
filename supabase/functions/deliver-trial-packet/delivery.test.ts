import { describe, expect, it } from 'vitest';
import {
  buildPacketDownloadFilename,
  isValidTrialDate,
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

  /**
   * MYK9-228. A weekend produces one packet per trial day, and every one of
   * them shares a `generatedAt`. Without the day in the mail, the recipient
   * gets several identical-looking emails carrying opaque UUID links and
   * cannot tell which is Saturday's without opening both.
   */
  it('names the trial day the packet covers', () => {
    const html = buildTrialPacketEmailHtml({
      showName: 'Prairie Fall',
      generatedAt: '2026-08-20T22:00:00.000Z',
      signedUrl: 'https://storage.example/packet?token=abc',
      expiresAt: '2026-10-19T22:00:00.000Z',
      trialDate: '2026-10-04',
    });

    expect(html).toContain('2026-10-04');
    expect(html).toContain('print them separately');
  });

  it('stays correct for a packet that covers the whole show', () => {
    // Older clients omit the field; the mail must not grow an empty dash or
    // claim a day it does not have.
    const html = buildTrialPacketEmailHtml({
      showName: 'Prairie Fall',
      generatedAt: '2026-08-20T22:00:00.000Z',
      signedUrl: 'https://storage.example/packet?token=abc',
      expiresAt: '2026-10-19T22:00:00.000Z',
    });

    expect(html).toContain('Prairie Fall emergency trial packet</h1>');
    expect(html).not.toContain('print them separately');
  });

  it('names the downloaded file by show and trial day', () => {
    expect(
      buildPacketDownloadFilename({
        showName: 'Heartland Scent Work Classic',
        trialDate: '2026-08-02',
        generatedAt: '2026-08-01T23:00:00.000Z',
      })
    ).toBe('heartland-scent-work-classic-2026-08-02-emergency-packet.pdf');
  });

  it('falls back to the generation date when the packet covers the whole show', () => {
    expect(
      buildPacketDownloadFilename({
        showName: 'Prairie Fall',
        generatedAt: '2026-08-01T23:00:00.000Z',
      })
    ).toBe('prairie-fall-2026-08-01-emergency-packet.pdf');
  });

  it('sanitises the name it puts in a Content-Disposition header', () => {
    const name = buildPacketDownloadFilename({
      showName: 'Prairie "Fall"\r\nX-Injected: 1',
      trialDate: '../../etc/passwd',
      generatedAt: '2026-08-01T23:00:00.000Z',
    });
    expect(name).toMatch(/^[a-z0-9-]+\.pdf$/);
    expect(name).not.toContain('..');
  });

  it('accepts an absent trial date but rejects a malformed one', () => {
    // The field reaches a Content-Disposition header. Unvalidated, a caller
    // sending `trialDate: 123` turns a bad request into a 500 inside the
    // filename slugger rather than a 400 (Codex review).
    expect(isValidTrialDate(undefined)).toBe(true);
    expect(isValidTrialDate('2026-08-02')).toBe(true);
    expect(isValidTrialDate(123)).toBe(false);
    expect(isValidTrialDate('2026-8-2')).toBe(false);
    expect(isValidTrialDate('2026-13-40')).toBe(false);
    expect(isValidTrialDate('../../etc/passwd')).toBe(false);
  });
});
