// supabase/functions/admin-invite-user/inviteUserHandler.ts
//
// PRA-2026-07-31-01 / MYK9-131.
//
// WHY THIS EXISTS. `/admin/users` → "Create User" defaulted "Send Invitation
// Email" to on, but submission only inserted an unclaimed `people` row.
// `sendInviteEmail` never reached a service, so the operator saw a success
// state while the recipient got nothing and had no auth identity at all.
//
// Everything downstream of the invite already existed — this is a wiring gap,
// not a missing feature:
//
//   1. this function creates the auth user (via generateLink type 'invite'),
//   2. `handle_new_user()` (20260625000000) fires AFTER INSERT on auth.users,
//      matches the admin-created `people` row on LOWER(email) where
//      auth_user_id IS NULL, and adopts it,
//   3. `propagate_people_auth_user_id_trigger` (migration 159) copies the new
//      auth uid into the `user_roles` rows the dialog already wrote.
//
// Migration 159's own header describes exactly this scenario ("a pre-assigned
// secretary or club admin ... people row created with auth_user_id = NULL").
// The roles assigned before the identity exists therefore resolve the moment
// the invite is accepted. Nothing here needs a migration.
//
// DELIVERY: generateLink + Resend, NOT auth.admin.inviteUserByEmail().
// inviteUserByEmail makes GoTrue send the mail, and GoTrue hard-caps sends at
// ~2/hour while the Custom SMTP slot is empty — the Resend *hook* does not lift
// that cap, because the throttle fires before the hook runs (see
// docs/operations/supabase-auth-email.md). Onboarding a club's staff would die
// on the third invite. generateLink returns the link without sending, so
// delivering it through Resend ourselves bypasses GoTrue's counter entirely.
// This is the same pattern send-waitlist-invite already uses in production.
//
// Deps are injected rather than read from Deno.env inside the handler so this
// module stays loadable under vitest (see admin-generate-reset-link for the
// same extract-for-testability split).

import type { HandlerCtx } from '../_shared/http/handler.ts';
import type { ResendEmailRequestInit } from '../_shared/resendEmail.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity, rolesInclude } from '../_shared/roleValidity.ts';
import { buildAuthActionUrl } from '../send-auth-email/actionUrl.ts';
import { buildAdminInviteHtml } from './inviteEmail.ts';

export interface InviteUserRequest {
  email?: string;
  firstName?: string;
  roleLabels?: string[];
  redirectPath?: string;
  /**
   * The `people` row this invitation is for, when resending to someone who
   * already exists. Makes the resend authoritative on the AUTH IDENTITY rather
   * than the contact email — see resolveIdentityEmail. Optional: the create
   * flow has no person to resolve yet.
   */
  personId?: string;
}

/** What actually happened, so the UI can tell the operator the truth. */
export type InviteOutcome = 'invited' | 'reinvited';

export interface InviteUserResult {
  ok: true;
  outcome: InviteOutcome;
  /**
   * The address the link was ACTUALLY sent to. It differs from the requested
   * email whenever the contact address drifted from the auth identity, and the
   * UI must show this rather than what it asked for — telling an operator the
   * link went somewhere it did not is the failure MYK9-131 was about.
   */
  deliveredTo: string;
}

export interface InviteUserDeps {
  resendApiKey: string | undefined;
  siteUrl: string;
  fromEmail: string;
  /** Injected so tests never touch the network. Satisfied by sendResendEmailWithRetry. */
  sendEmail: (init: ResendEmailRequestInit) => Promise<Response>;
}

/**
 * Only a site admin may mint an identity. Same gate as admin-generate-reset-link
 * and admin-delete-user — `ctx.supabase` is the SERVICE ROLE client, so RLS is
 * not doing this for us and the check must be explicit.
 */
async function assertSiteAdmin(
  supabase: HandlerCtx<InviteUserRequest>['supabase'],
  authUserId: string
): Promise<string> {
  const { data: callerPerson, error: callerError } = await supabase
    .from('people')
    .select('id')
    .eq('auth_user_id', authUserId)
    .is('deleted_at', null)
    .single();

  if (callerError || !callerPerson) {
    throw new HttpError(403, 'Caller not found');
  }

  const { data: rbacRoles, error: rbacError } = await applyActiveRoleValidity(
    supabase.from('user_roles').select('role:roles(name)').eq('user_id', callerPerson.id)
  );

  if (rbacError) {
    throw new HttpError(500, 'Failed to verify caller role');
  }

  const isSiteAdmin = rolesInclude(rbacRoles, 'site_admin');

  if (!isSiteAdmin) {
    throw new HttpError(403, 'Unauthorized: requires site_admin role');
  }

  return callerPerson.id;
}

/**
 * Where the invitation link should land, as a URL GoTrue will accept and
 * buildAuthActionUrl will carry forward intact.
 *
 * `safePath` must already have been vetted as same-origin ('' for none).
 * Exported for direct testing: the branch that matters is a path that IS the
 * callback but carries its own destination.
 */
export function resolveInviteRedirect(siteUrl: string, safePath: string): string {
  const callback = `${siteUrl}/auth/callback`;
  if (!safePath) return callback;

  let parsed: URL;
  try {
    parsed = new URL(safePath, siteUrl);
  } catch {
    return callback;
  }

  // Already a callback URL — keep it whole, including any returnTo it carries.
  if (parsed.pathname === '/auth/callback') {
    return parsed.toString();
  }

  return `${callback}?returnTo=${encodeURIComponent(safePath)}`;
}

/**
 * The email of the auth identity this person ALREADY has, if any.
 *
 * MYK9-134. Nothing syncs `people.email` to `auth.users.email` — verified
 * against the applied database: no trigger on either table does it, while
 * UserEditPanel edits the contact email freely. So the two drift the moment an
 * admin corrects someone's address.
 *
 * Inviting by the drifted contact email would ask GoTrue to mint a SECOND
 * identity. `handle_new_user` then cannot adopt the existing `people` row (its
 * link branch requires `auth_user_id IS NULL`), falls through to its INSERT
 * branch, and dies on the `people_email_unique` index — surfacing as an opaque
 * 500 on what the operator asked to be a resend.
 *
 * Resolving through `auth_user_id` makes a resend depend on identity, not on an
 * editable field.
 *
 * FAILS CLOSED. A lookup error must NOT read as "no identity": that would fall
 * back to inviting the editable contact email and re-enter the exact
 * duplicate-identity path above, on a transient database blip. `none` is
 * reserved for a person genuinely without an identity — the ordinary
 * first-invite case.
 */
type IdentityLookup = { status: 'none' } | { status: 'found'; email: string } | { status: 'error' };

async function resolveIdentityEmail(
  supabase: HandlerCtx<InviteUserRequest>['supabase'],
  personId: string
): Promise<IdentityLookup> {
  const { data: person, error } = await supabase
    .from('people')
    .select('auth_user_id')
    .eq('id', personId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { status: 'error' };
  if (!person) return { status: 'error' };
  if (!person.auth_user_id) return { status: 'none' };

  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(
    person.auth_user_id
  );
  // An identity that exists but has no email cannot receive a link either —
  // that is a broken state, not an invitation opportunity.
  if (authError || !authUser?.user?.email) return { status: 'error' };

  return { status: 'found', email: authUser.user.email };
}

/** GoTrue signals "this email already has an auth user" in several shapes. */
function isAlreadyRegistered(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'email_exists') return true;
  const message = (error.message ?? '').toLowerCase();
  return message.includes('already been registered') || message.includes('already registered');
}

export async function inviteUserHandler(
  { body, user, supabase }: HandlerCtx<InviteUserRequest>,
  deps: InviteUserDeps
): Promise<InviteUserResult> {
  if (!user) {
    throw new HttpError(401, 'Authentication failed');
  }

  await assertSiteAdmin(supabase, user.id);

  if (!deps.resendApiKey) {
    // Fail loudly rather than reporting a send that cannot happen — reporting
    // success without delivery is the exact bug this function exists to fix.
    throw new HttpError(500, 'RESEND_API_KEY not configured');
  }

  const requestedEmail = body.email?.trim().toLowerCase();
  if (!requestedEmail) {
    throw new HttpError(400, 'email is required');
  }

  // An existing identity wins over the request's contact email — see
  // resolveIdentityEmail for why they can disagree.
  const lookup: IdentityLookup = body.personId
    ? await resolveIdentityEmail(supabase, body.personId)
    : { status: 'none' };

  if (lookup.status === 'error') {
    // Abort rather than guess. Falling back to the contact email here is what
    // creates the duplicate identity this resolution exists to prevent.
    throw new HttpError(503, 'Could not verify this account. Please try again.');
  }

  const identityEmail = lookup.status === 'found' ? lookup.email : null;
  const email = identityEmail ?? requestedEmail;

  // Only allow same-origin destinations; a caller-supplied absolute URL would
  // make this an open redirect that leaks a single-use credential. `//host` is
  // rejected alongside `https://host` — it is protocol-relative, so it reads as
  // an absolute URL to a browser despite starting with a slash.
  const requestedPath = body.redirectPath ?? '';
  const isSameOriginPath = requestedPath.startsWith('/') && !requestedPath.startsWith('//');

  // The destination must travel as `returnTo` ON the callback URL, not as the
  // callback URL itself: buildAuthActionUrl only carries redirect params
  // forward when the supplied URL's pathname is exactly /auth/callback, so
  // passing `${siteUrl}/admin/users` would silently drop the destination and
  // land a re-invite on `/`.
  //
  // Compare the parsed pathname, not a prefix — `/auth/callback?returnTo=...`
  // starts with the callback path but carries a destination that a prefix test
  // would throw away.
  const redirectTo = resolveInviteRedirect(deps.siteUrl, isSameOriginPath ? requestedPath : '');

  // A resolved identity email is proof the person already has an account, so go
  // straight to a sign-in link rather than attempting an invite that is
  // guaranteed to come back "already registered".
  let outcome: InviteOutcome = identityEmail ? 'reinvited' : 'invited';
  let { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: identityEmail ? 'magiclink' : 'invite',
    email,
    options: { redirectTo },
  });

  if (isAlreadyRegistered(linkError)) {
    // The address already has an auth identity. Do not mint a second one —
    // idempotency is the point. Send a sign-in link instead so an invite that
    // expired before acceptance is still recoverable, and tell the caller the
    // outcome differed so the UI can say so rather than claiming a new invite.
    outcome = 'reinvited';
    ({ data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    }));
  }

  // Email OUR callback URL built from hashed_token — NOT properties.action_link.
  //
  // action_link points at GoTrue's own /verify endpoint, which verifies
  // server-side and 302s to redirect_to with the session in the URL *fragment*
  // (#access_token=...&type=invite). AuthCallbackPage only parses the
  // `?token_hash=&type=` query shape, so an action_link invite lands in its
  // OAuth branch and routes to `/` — signing the recipient in once and
  // stranding them, because an invited account has no password yet.
  //
  // buildAuthActionUrl produces the query shape the callback page already
  // understands, and is the same helper send-auth-email uses to render every
  // other auth email in this repo.
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('generateLink failed', linkError);
    throw new HttpError(500, linkError?.message ?? 'Failed to generate invitation link');
  }

  const actionLink = buildAuthActionUrl(deps.siteUrl, {
    tokenHash,
    // A re-invite is a magiclink, which verifies without demanding a password;
    // a first invite must land on password setup.
    actionType: outcome === 'reinvited' ? 'magiclink' : 'invite',
    redirectTo,
  });

  const html = buildAdminInviteHtml({
    firstName: body.firstName ?? '',
    actionUrl: actionLink,
    inviterName: '',
    roleLabels: body.roleLabels ?? [],
  });

  const response = await deps.sendEmail({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deps.resendApiKey}`,
      // Deterministic per (address, outcome) so a double-submitted create sends
      // once, while a later deliberate re-invite still gets through on its own
      // key. Without this, sendResendEmailWithRetry generates a random key and
      // every replay is a fresh send.
      'Idempotency-Key': `admin-invite-${outcome}-${email}`,
    },
    body: JSON.stringify({
      from: deps.fromEmail,
      to: email,
      subject: "You've been invited to myK9Show",
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('resend send failed', response.status, detail);
    // The auth identity now exists but no email went out. 502 so the UI can
    // tell the operator the account was created and the invite was NOT sent,
    // rather than silently implying delivery.
    throw new HttpError(502, 'Invitation email failed to send');
  }

  // Deliberately does NOT return the action link (unlike admin-generate-reset-link):
  // an invitation link is a single-use credential for an identity nobody has
  // claimed yet, and it has no reason to travel back through the browser.
  return { ok: true, outcome, deliveredTo: email };
}
