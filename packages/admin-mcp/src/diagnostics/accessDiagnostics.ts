/**
 * `list_show_access` — who can run a show.
 *
 * Access mirrors the current is_show_secretary / is_show_official /
 * is_club_admin policy predicates across three grant sets:
 *   - show-scoped grants: user_roles.show_id = <show>
 *   - club-scoped grants: user_roles.show_id IS NULL AND club_id = show.club_id
 *   - global site-admin grants
 *
 * Club-scoped secretaries additionally require an active club membership.
 * Inactive, expired, unlinked, and membership-inactive grants are labeled,
 * never silently treated as access. The embed
 * uses an explicit FK hint (people!user_id) because user_roles has two FKs to
 * people (user_id and granted_by) and the embed would otherwise be ambiguous.
 */
import type { AdminToolDefinition } from '../mcp/server';
import { listShowAccessInput, type ListShowAccessInput } from '../tools/schemas';
import type { ToolContext } from '../tools/index';
import { buildShowLink } from './links';
import { redactEmail } from './redaction';
import type { DiagnosticEvidence, DiagnosticResult } from './types';
import { createDiagnosticResult } from './types';

const GRANT_SELECT =
  'id, auth_user_id, user_id, is_active, expires_at, show_id, club_id, ' +
  'role:roles!role_id!inner(name), ' +
  'person:people!user_id(first_name, last_name, email)';

interface AccessRow {
  id: string;
  auth_user_id: string | null;
  user_id: string;
  is_active: boolean;
  expires_at: string | null;
  show_id: string | null;
  club_id: string | null;
  role: { name: string } | null;
  person: { first_name: string; last_name: string; email: string | null } | null;
}

/** Roles that mean "this person can run the show". */
const SECRETARY_LIKE_ROLES = new Set(['secretary', 'club_admin', 'site_admin']);
const SHOW_SCOPED_ROLES = new Set(['secretary', 'chairman', 'steward']);
const CLUB_SCOPED_ROLES = new Set(['secretary', 'chairman', 'steward', 'club_admin']);

type GrantStatus = 'active' | 'inactive' | 'expired' | 'unlinked' | 'membership_inactive';

function grantStatus(
  row: AccessRow,
  nowMs: number,
  activeClubMembers: ReadonlySet<string>
): GrantStatus {
  if (!row.is_active) {
    return 'inactive';
  }
  if (row.expires_at && Date.parse(row.expires_at) <= nowMs) {
    return 'expired';
  }
  if (!row.auth_user_id) {
    return 'unlinked';
  }
  if (
    row.role?.name === 'secretary' &&
    row.show_id === null &&
    row.club_id !== null &&
    !activeClubMembers.has(row.user_id)
  ) {
    return 'membership_inactive';
  }
  return 'active';
}

function grantsShowAccess(row: AccessRow, showId: string, clubId: string | null) {
  const roleName = row.role?.name;
  if (!roleName) return false;
  if (roleName === 'site_admin') return true;
  if (row.show_id === showId) return SHOW_SCOPED_ROLES.has(roleName);
  return (
    row.show_id === null &&
    clubId !== null &&
    row.club_id === clubId &&
    CLUB_SCOPED_ROLES.has(roleName)
  );
}

export async function listShowAccess(
  input: ListShowAccessInput,
  ctx: ToolContext
): Promise<DiagnosticResult> {
  const { config, supabase } = ctx;
  const { showId } = input;
  const nowMs = Date.now();

  const show = await supabase
    .from('shows')
    .select('id, name, club_id')
    .eq('id', showId)
    .maybeSingle();
  if (show.error) {
    return createDiagnosticResult(config.envLabel, 'source_unavailable', {
      limitations: ['Could not read the show record.'],
    });
  }
  if (!show.data) {
    return createDiagnosticResult(config.envLabel, 'not_found', {
      summary: { showId },
      limitations: [`No show found for id ${showId}.`],
    });
  }

  const clubId = show.data.club_id;

  const showScoped = await supabase
    .from('user_roles')
    .select(GRANT_SELECT)
    .eq('show_id', showId)
    .in('role.name', [...SHOW_SCOPED_ROLES])
    .order('id', { ascending: true })
    .limit(config.maxLimit)
    .returns<AccessRow[]>();
  if (showScoped.error) {
    return createDiagnosticResult(config.envLabel, 'source_unavailable', {
      limitations: ['Could not read show-scoped role grants.'],
    });
  }

  let clubScopedRows: AccessRow[] = [];
  if (clubId) {
    const clubScoped = await supabase
      .from('user_roles')
      .select(GRANT_SELECT)
      .is('show_id', null)
      .eq('club_id', clubId)
      .in('role.name', [...CLUB_SCOPED_ROLES])
      .order('id', { ascending: true })
      .limit(config.maxLimit)
      .returns<AccessRow[]>();
    if (clubScoped.error) {
      return createDiagnosticResult(config.envLabel, 'source_unavailable', {
        limitations: ['Could not read club-scoped role grants.'],
      });
    }
    clubScopedRows = clubScoped.data ?? [];
  }

  const globalAdmins = await supabase
    .from('user_roles')
    .select(GRANT_SELECT)
    .eq('role.name', 'site_admin')
    .order('id', { ascending: true })
    .limit(config.maxLimit)
    .returns<AccessRow[]>();
  if (globalAdmins.error) {
    return createDiagnosticResult(config.envLabel, 'source_unavailable', {
      limitations: ['Could not read site-admin role grants.'],
    });
  }

  let hasMismatchedShowGrant = false;
  if (clubId) {
    const mismatchedShowGrant = await supabase
      .from('user_roles')
      .select('id')
      .eq('club_id', clubId)
      .not('show_id', 'is', null)
      .neq('show_id', showId)
      .limit(1);
    if (mismatchedShowGrant.error) {
      return createDiagnosticResult(config.envLabel, 'source_unavailable', {
        limitations: ['Could not check for role grants scoped to other shows.'],
      });
    }
    hasMismatchedShowGrant = (mismatchedShowGrant.data ?? []).length > 0;
  }

  // Show-scoped and club-scoped sets are disjoint by construction; dedupe by
  // grant id defensively.
  const byId = new Map<string, AccessRow>();
  for (const row of [...(showScoped.data ?? []), ...clubScopedRows, ...(globalAdmins.data ?? [])]) {
    byId.set(row.id, row);
  }
  const policyGrants = [...byId.values()]
    .filter(row => grantsShowAccess(row, showId, clubId))
    .sort((left, right) => left.id.localeCompare(right.id));
  const grants = policyGrants.slice(0, config.maxLimit);

  const clubSecretaryIds = grants
    .filter(row => row.role?.name === 'secretary' && row.show_id === null && row.club_id === clubId)
    .map(row => row.user_id);
  const activeClubMembers = new Set<string>();
  if (clubId && clubSecretaryIds.length > 0) {
    const memberships = await supabase
      .from('club_members')
      .select('person_id')
      .eq('club_id', clubId)
      .eq('membership_status', 'active')
      .in('person_id', clubSecretaryIds)
      .limit(config.maxLimit);
    if (memberships.error) {
      return createDiagnosticResult(config.envLabel, 'source_unavailable', {
        limitations: ['Could not verify active club memberships.'],
      });
    }
    for (const membership of memberships.data ?? []) {
      activeClubMembers.add(membership.person_id);
    }
  }

  const evidence: DiagnosticEvidence[] = grants.map(row => {
    const roleName = row.role?.name ?? 'unknown role';
    const scope = row.role?.name === 'site_admin' ? 'global' : row.show_id ? 'show' : 'club';
    const status = grantStatus(row, nowMs, activeClubMembers);
    const name = row.person
      ? `${row.person.first_name} ${row.person.last_name}`.trim()
      : 'unknown person';
    const email = redactEmail(row.person?.email) ?? 'no email';
    return {
      label: `${roleName} (${scope === 'global' ? scope : `${scope}-scoped`})`,
      value: [
        name,
        email,
        row.show_id ? `showId=${row.show_id}` : null,
        row.club_id ? `clubId=${row.club_id}` : null,
        row.expires_at ? `expiresAt=${row.expires_at}` : null,
        status,
      ]
        .filter(Boolean)
        .join(' · '),
      source: 'user_roles',
    };
  });

  const activeGrants = grants.filter(
    row => grantStatus(row, nowMs, activeClubMembers) === 'active'
  );
  const hasScopedSecretary = activeGrants.some(
    row => row.role !== null && SECRETARY_LIKE_ROLES.has(row.role.name)
  );

  const limitations: string[] = [];
  const sourceHitLimit = [
    showScoped.data?.length ?? 0,
    clubScopedRows.length,
    globalAdmins.data?.length ?? 0,
  ].some(count => count >= config.maxLimit);
  if (policyGrants.length > config.maxLimit || sourceHitLimit) {
    limitations.push(`Results were limited to ${config.maxLimit} role grants.`);
  }
  if (hasMismatchedShowGrant) {
    limitations.push(
      'At least one role grant for this club is scoped to a different show and was not counted.'
    );
  }
  if (!hasScopedSecretary) {
    limitations.push('No active secretary, club admin, or site admin can manage this show.');
  }
  if (!clubId) {
    limitations.push('Show has no club; only show-scoped grants were considered.');
  }

  return createDiagnosticResult(config.envLabel, 'found', {
    summary: {
      showId,
      showName: show.data.name,
      clubId,
      totalGrants: grants.length,
      activeGrants: activeGrants.length,
      hasScopedSecretary,
    },
    evidence,
    links: [buildShowLink(config, showId)],
    limitations,
  });
}

export function listShowAccessTool(ctx: ToolContext): AdminToolDefinition {
  return {
    name: 'list_show_access',
    description:
      'List who has secretary/admin-style access to a show, including ' +
      'show, club, and global scopes with effective access status. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        showId: { type: 'string', description: 'Show UUID' },
      },
      required: ['showId'],
      additionalProperties: false,
    },
    parseInput: raw => listShowAccessInput.parse(raw),
    handle: input => listShowAccess(input as ListShowAccessInput, ctx),
  };
}
