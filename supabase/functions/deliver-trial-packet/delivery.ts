export interface PacketShowScope {
  id: string;
  clubId: string | null;
}

export interface PacketRoleScope {
  roleName: string | null;
  showId: string | null;
  clubId: string | null;
}

export interface PacketRecipientRole extends PacketRoleScope {
  email: string | null;
  activeClubMember: boolean;
}

export interface TrialPacketPayload {
  showId: string;
  snapshotId: string;
  storagePath: string;
  generatedAt: string;
  sha256: string;
  pageCount: number;
  byteSize: number;
}

const OPERATIONAL_ROLES = new Set(['secretary', 'trial_secretary', 'club_admin']);
const MIN_LINK_SECONDS = 7 * 24 * 60 * 60;
const MAX_LINK_SECONDS = 60 * 24 * 60 * 60;
const POST_SHOW_LINK_DAYS = 30;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function payloadContainsRecipientFields(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const keys = new Set(Object.keys(body));
  return ['to', 'cc', 'recipients', 'recipientEmails', 'replyTo'].some(key => keys.has(key));
}

export function isValidTrialPacketPayload(body: TrialPacketPayload): boolean {
  return (
    UUID_PATTERN.test(body.showId) &&
    UUID_PATTERN.test(body.snapshotId) &&
    storagePathBelongsToSnapshot(body.storagePath, body.showId, body.snapshotId) &&
    Number.isFinite(Date.parse(body.generatedAt)) &&
    /^[a-f0-9]{64}$/.test(body.sha256) &&
    Number.isInteger(body.pageCount) &&
    body.pageCount > 0 &&
    Number.isInteger(body.byteSize) &&
    body.byteSize > 0 &&
    body.byteSize <= 20 * 1024 * 1024
  );
}

export function callerRoleAuthorizesPacket(role: PacketRoleScope, show: PacketShowScope): boolean {
  if (role.roleName === 'site_admin' || role.roleName === 'platform_admin') return true;
  if (!role.roleName || !OPERATIONAL_ROLES.has(role.roleName)) return false;
  return role.showId === show.id || (show.clubId !== null && role.clubId === show.clubId);
}

export function storagePathBelongsToSnapshot(
  storagePath: string,
  showId: string,
  snapshotId: string,
): boolean {
  if (!showId || !snapshotId || showId.includes('/') || snapshotId.includes('/')) return false;
  return storagePath === `${showId}/${snapshotId}.pdf`;
}

export function resolvePacketRecipients(
  roles: PacketRecipientRole[],
  show: PacketShowScope,
): string[] {
  const byNormalizedEmail = new Map<string, string>();
  for (const role of roles) {
    if (!role.roleName || !OPERATIONAL_ROLES.has(role.roleName)) continue;
    const directShowRole = role.showId === show.id;
    const currentClubRole =
      role.showId === null &&
      show.clubId !== null &&
      role.clubId === show.clubId &&
      role.activeClubMember;
    if (!directShowRole && !currentClubRole) continue;

    const email = role.email?.trim();
    if (!email || !email.includes('@')) continue;
    const normalized = email.toLowerCase();
    if (!byNormalizedEmail.has(normalized)) byNormalizedEmail.set(normalized, email);
  }
  return [...byNormalizedEmail.entries()]
    .sort(([emailA], [emailB]) => emailA.localeCompare(emailB))
    .map(([, email]) => email);
}

export function requirePacketRecipients(recipients: string[]): string[] {
  if (recipients.length === 0) {
    throw new Error('No current secretary or club administrator has an email address.');
  }
  return recipients;
}

export function resolveSignedLinkLifetimeSeconds(showEndDate: string, now = new Date()): number {
  const endOfShow = Date.parse(`${showEndDate}T23:59:59.999Z`);
  const target = Number.isFinite(endOfShow)
    ? endOfShow + POST_SHOW_LINK_DAYS * 24 * 60 * 60 * 1000
    : now.getTime() + MIN_LINK_SECONDS * 1000;
  const seconds = Math.ceil((target - now.getTime()) / 1000);
  return Math.min(MAX_LINK_SECONDS, Math.max(MIN_LINK_SECONDS, seconds));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildTrialPacketEmailHtml(input: {
  showName: string;
  generatedAt: string;
  signedUrl: string;
  expiresAt: string;
}): string {
  const showName = escapeHtml(input.showName);
  const generatedAt = escapeHtml(input.generatedAt);
  const expiresAt = escapeHtml(input.expiresAt);
  const signedUrl = escapeHtml(input.signedUrl);
  return `<!doctype html>
<html lang="en">
  <body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5">
    <h1 style="font-size:22px">${showName} emergency trial packet</h1>
    <div style="border:2px solid #991b1b;background:#fef2f2;padding:16px;margin:18px 0">
      <strong style="font-size:18px;color:#7f1d1d">PRINT IT AND PUT IT IN THE TRIAL BOX.</strong>
      <p style="margin-bottom:0">A PDF in email is not the final emergency fallback. The printed packet is.</p>
    </div>
    <p>This is a <strong>snapshot, not live data</strong>, generated ${generatedAt}.</p>
    <p><a href="${signedUrl}" style="display:inline-block;background:#172033;color:#fff;padding:12px 18px;text-decoration:none">Open and print the emergency packet</a></p>
    <p>The private link opens without a myK9 session and expires ${expiresAt}. Do not forward it outside the show team.</p>
    <p>After printing, use the existing <strong>Mark printed</strong> action in myK9 so the show team knows the paper is physically ready.</p>
  </body>
</html>`;
}
