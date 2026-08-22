import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

describe('deliver-trial-packet handler contract', () => {
  it('joins operational email through the user_roles person foreign key', () => {
    expect(source).toContain('people:people!user_id(email)');
  });

  it('mints a private signed URL and reuses a sent attempt before sending or writing again', () => {
    const sentLookup = source.indexOf(".eq('delivery_status', 'sent')");
    const sentReturn = source.indexOf('if (sentAttempt)');
    const emailSend = source.indexOf('await sendTrialPacketEmail');
    const sentAudit = source.indexOf("delivery_status: 'sent'", emailSend);

    // Intent: the link is minted from the VALIDATED path and the clamped
    // lifetime. Options may follow (the download filename does), so do not pin
    // the closing paren — that pins formatting, not the contract.
    expect(source).toContain('.createSignedUrl(body.storagePath, lifetimeSeconds');
    expect(sentLookup).toBeGreaterThan(0);
    expect(sentReturn).toBeGreaterThan(sentLookup);
    expect(emailSend).toBeGreaterThan(sentReturn);
    expect(sentAudit).toBeGreaterThan(emailSend);
  });

  it('rejects caller recipients before role-derived recipient resolution', () => {
    expect(source.indexOf('rejectCallerRecipients(body)')).toBeLessThan(
      source.indexOf('resolvePacketRecipients('),
    );
  });
});
