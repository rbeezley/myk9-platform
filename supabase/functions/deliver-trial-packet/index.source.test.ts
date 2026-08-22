import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What is left in this handler after the delivery step moved to
 * `_shared/trialPacket` is exactly the part that CANNOT be shared: proving the
 * caller may act on this show. The order of those gates is the contract, and
 * position in the source is the only place it is visible — the behaviour of
 * the step they guard is covered in `deliverStoredPacket.test.ts`.
 */
const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

describe('deliver-trial-packet handler contract', () => {
  it('joins operational email through the user_roles person foreign key', () => {
    // Lives in the shared select constant now; the handler must use it rather
    // than re-spelling a narrower one that drops the email embed.
    expect(source).toContain('PACKET_ROLE_SELECT');
  });

  it('refuses caller-chosen recipients and bad metadata before touching the database', () => {
    const reject = source.indexOf('rejectCallerRecipients(body)');
    const validate = source.indexOf('validatePayload(body)');
    const loadShow = source.indexOf('loadPacketShow(');
    expect(reject).toBeGreaterThan(0);
    expect(validate).toBeGreaterThan(reject);
    expect(loadShow).toBeGreaterThan(validate);
  });

  it('authorizes the caller before delivering', () => {
    // The whole reason this function still exists separately. Delivery mails a
    // private link to show officials; reaching it without the role check would
    // let any signed-in user trigger it for any show.
    const authorize = source.indexOf('callerRoleAuthorizesPacket');
    const forbid = source.indexOf("throw new HttpError(403");
    const deliver = source.indexOf('deliverStoredPacket(');
    expect(authorize).toBeGreaterThan(0);
    expect(forbid).toBeGreaterThan(authorize);
    expect(deliver).toBeGreaterThan(forbid);
  });

  it('attributes the packet to the authenticated caller, never to the payload', () => {
    expect(source).toContain('generatedBy: user.id');
    expect(source).not.toMatch(/generatedBy:\s*body\./);
  });
});
