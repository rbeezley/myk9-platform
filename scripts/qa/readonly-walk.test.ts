import { describe, expect, it } from 'vitest';
import {
  decideRequest,
  formatWalkLog,
  isBackendPath,
  isReadRpcName,
  type GuardOptions,
} from './readonly-walk';

const API = 'https://sojmvhhwsjxmfistvzbe.supabase.co';
const APP = 'http://localhost:5173';
const signedIn: GuardOptions = { appOrigin: APP };
const signedOut: GuardOptions = { appOrigin: APP, signedOut: true };

const verdict = (method: string, path: string, options: GuardOptions = signedIn) =>
  decideRequest(method, path.startsWith('http') ? path : `${API}${path}`, options).allow;

describe('decideRequest: what a read-only walk may send', () => {
  it.each([
    ['GET', '/rest/v1/entries?select=*'],
    ['HEAD', '/rest/v1/entries?select=id'],
    ['OPTIONS', '/rest/v1/entries'],
    // on the e2e list this file extends
    ['POST', '/rest/v1/rpc/get_user_roles'],
    ['POST', '/rest/v1/rpc/can_accept_online_entry_payment'],
    // on the walk list
    ['POST', '/rest/v1/rpc/get_show_entry_counts'],
    ['POST', '/rest/v1/rpc/tv_class_entry_counts'],
    ['GET', '/rest/v1/rpc/get_show_judges?p_show_id=x'],
    ['POST', '/auth/v1/token?grant_type=password'],
    ['POST', '/auth/v1/token?grant_type=refresh_token'],
    ['GET', '/auth/v1/user'],
    ['GET', '/storage/v1/object/public/logos/a.png'],
    ['POST', '/storage/v1/object/list/logos'],
    ['POST', '/storage/v1/object/sign/premiums/a.pdf'],
    ['OPTIONS', '/functions/v1/stripe-checkout'],
    ['GET', 'https://fonts.gstatic.com/s/inter.woff2'],
    ['POST', `${APP}/__vite_ping`],
  ])('allows %s %s', (method, path) => {
    expect(verdict(method, path)).toBe(true);
  });
});

describe('decideRequest: what it must refuse', () => {
  it.each([
    // table writes
    ['POST', '/rest/v1/entries'],
    ['PATCH', '/rest/v1/entries?id=eq.1'],
    ['PUT', '/rest/v1/entries'],
    ['DELETE', '/rest/v1/entries?id=eq.1'],
    ['POST', '/rest/v1/analytics_events'],
    // the RPC that moved a seeded entry on 2026-11-12
    ['POST', '/rest/v1/rpc/ringside_update_entry'],
    // a name that reads like a read is not evidence of one
    ['POST', '/rest/v1/rpc/get_or_create_cart'],
    ['POST', '/rest/v1/rpc/get_anything_not_listed'],
    ['POST', '/rest/v1/rpc/list_my_dogs'],
    ['POST', '/rest/v1/rpc/is_club_admin'],
    ['POST', '/rest/v1/rpc/check_in_entry'],
    // known writers
    ['POST', '/rest/v1/rpc/self_checkin_entry'],
    ['POST', '/rest/v1/rpc/move_up_entry'],
    ['POST', '/rest/v1/rpc/upsert_ringside_session'],
    // auth calls that write or send email
    ['POST', '/auth/v1/signup'],
    ['POST', '/auth/v1/recover'],
    ['POST', '/auth/v1/otp'],
    ['POST', '/auth/v1/resend'],
    ['POST', '/auth/v1/invite'],
    ['POST', '/auth/v1/logout'],
    ['PUT', '/auth/v1/user'],
    ['GET', '/auth/v1/verify?token=x&type=signup'],
    // edge functions, on every method
    ['POST', '/functions/v1/stripe-checkout'],
    ['GET', '/functions/v1/send-results'],
    ['POST', '/functions/v1/stripe-connect-onboard'],
    // storage and graphql writes
    ['POST', '/storage/v1/object/logos/a.png'],
    ['DELETE', '/storage/v1/object/logos/a.png'],
    ['POST', '/graphql/v1'],
    // writes to anyone else
    ['POST', 'https://o123.ingest.sentry.io/api/1/envelope/'],
    ['POST', 'https://api.stripe.com/v1/payment_methods'],
  ])('refuses %s %s', (method, path) => {
    expect(verdict(method, path)).toBe(false);
  });

  it('refuses a url it cannot parse', () => {
    expect(decideRequest('GET', 'not a url', signedIn).allow).toBe(false);
  });

  it('refuses sign-in on a signed-out walk and allows it otherwise', () => {
    expect(verdict('POST', '/auth/v1/token?grant_type=password', signedOut)).toBe(false);
    expect(verdict('POST', '/auth/v1/token?grant_type=password', signedIn)).toBe(true);
  });

  it('treats a local Supabase the same as the hosted one', () => {
    expect(verdict('POST', 'http://127.0.0.1:54321/rest/v1/entries')).toBe(false);
    expect(verdict('GET', 'http://127.0.0.1:54321/rest/v1/entries')).toBe(true);
  });

  it('names the read RPC it allowed, and nothing otherwise', () => {
    const read = decideRequest('POST', `${API}/rest/v1/rpc/get_user_roles`, signedIn);
    expect(read).toMatchObject({ allow: true, rpc: 'get_user_roles' });
    expect(decideRequest('GET', `${API}/rest/v1/entries`, signedIn).rpc).toBeUndefined();
  });
});

describe('isReadRpcName', () => {
  it('accepts an unlisted name only when the walk passes it', () => {
    expect(isReadRpcName('entry_results_changed_since')).toBe(false);
    expect(isReadRpcName('entry_results_changed_since', ['entry_results_changed_since'])).toBe(
      true
    );
  });
});

describe('isBackendPath', () => {
  it('matches a prefix and not a look-alike', () => {
    expect(isBackendPath('/rest/v1/entries')).toBe(true);
    expect(isBackendPath('/rest/v1')).toBe(true);
    expect(isBackendPath('/rest/v10/entries')).toBe(false);
    expect(isBackendPath('/shows/abc/register')).toBe(false);
  });
});

describe('formatWalkLog', () => {
  it('counts every refusal and lists each distinct one once', () => {
    const text = formatWalkLog({
      refused: ['POST /rest/v1/entries (write)', 'POST /rest/v1/entries (write)'],
      readRpcs: new Set(['get_user_roles', 'can_accept_online_entry_payment']),
      answeredLocally: ['POST entry_carts (show_id)'],
    });
    expect(text).toContain('refused 2 request(s), 1 distinct:');
    expect(text.match(/POST \/rest\/v1\/entries/g)).toHaveLength(1);
    expect(text).toContain('read RPCs allowed: can_accept_online_entry_payment, get_user_roles');
    expect(text).toContain('answered locally, never sent: 1');
  });

  it('says so when no read RPC was used', () => {
    const text = formatWalkLog({ refused: [], readRpcs: new Set(), answeredLocally: [] });
    expect(text).toContain('refused 0 request(s), 0 distinct:');
    expect(text).toContain('read RPCs allowed: none');
  });
});
