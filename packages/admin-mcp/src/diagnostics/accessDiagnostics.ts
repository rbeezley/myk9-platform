/**
 * `list_show_access` — who can run a show.
 *
 * Access is the union of two grant sets (mirroring the app's
 * is_show_secretary / is_club_admin RLS predicates):
 *   - show-scoped grants: user_roles.show_id = <show>
 *   - club-scoped grants: user_roles.show_id IS NULL AND club_id = show.club_id
 *
 * Inactive and expired grants are labeled, never silently dropped. The embed
 * uses an explicit FK hint (people!user_id) because user_roles has two FKs to
 * people (user_id and granted_by) and the embed would otherwise be ambiguous.
 */
import type { AdminToolDefinition } from '../mcp/server';
import {
  listShowAccessInput,
  type ListShowAccessInput,
} from '../tools/schemas';
import type { ToolContext } from '../tools/index';
import { buildShowLink } from './links';
import { redactEmail } from './redaction';
import type { DiagnosticEvidence, DiagnosticResult } from './types';
import { createDiagnosticResult } from './types';

const GRANT_SELECT =
  'id, is_active, expires_at, show_id, club_id, ' +
  'role:roles!role_id(name), ' +
  'person:people!user_id(first_name, last_name, email)';

interface AccessRow {
  id: string;
  is_active: boolean;
  expires_at: string | null;
  show_id: string | null;
  club_id: string | null;
  role: { name: string } | null;
  person: { first_name: string; last_name: string; email: string | null } | null;
}

/** Roles that mean "this person can run the show". */
const SECRETARY_LIKE_ROLES = new Set([
  'secretary',
  'trial_secretary',
  'club_admin',
]);

type GrantStatus = 'active' | 'inactive' | 'expired';

function grantStatus(row: AccessRow, nowMs: number): GrantStatus {
  if (!row.is_active) {
    return 'inactive';
  }
  if (row.expires_at && Date.parse(row.expires_at) <= nowMs) {
    return 'expired';
  }
  return 'active';
}

export async function listShowAccess(
  input: ListShowAccessInput,
  ctx: ToolContext,
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
      .returns<AccessRow[]>();
    if (clubScoped.error) {
      return createDiagnosticResult(config.envLabel, 'source_unavailable', {
        limitations: ['Could not read club-scoped role grants.'],
      });
    }
    clubScopedRows = clubScoped.data ?? [];
  }

  // Show-scoped and club-scoped sets are disjoint by construction; dedupe by
  // grant id defensively.
  const byId = new Map<string, AccessRow>();
  for (const row of [...(showScoped.data ?? []), ...clubScopedRows]) {
    byId.set(row.id, row);
  }
  const grants = [...byId.values()];

  const evidence: DiagnosticEvidence[] = grants.map((row) => {
    const roleName = row.role?.name ?? 'unknown role';
    const scope = row.show_id ? 'show' : 'club';
    const status = grantStatus(row, nowMs);
    const name = row.person
      ? `${row.person.first_name} ${row.person.last_name}`.trim()
      : 'unknown person';
    const email = redactEmail(row.person?.email) ?? 'no email';
    return {
      label: `${roleName} (${scope}-scoped)`,
      value: `${name} · ${email} · ${status}`,
      source: 'user_roles',
    };
  });

  const activeGrants = grants.filter(
    (row) => grantStatus(row, nowMs) === 'active',
  );
  const hasScopedSecretary = activeGrants.some(
    (row) => row.role !== null && SECRETARY_LIKE_ROLES.has(row.role.name),
  );

  const limitations: string[] = [];
  if (!hasScopedSecretary) {
    limitations.push(
      'No active secretary, trial secretary, or club admin is scoped to this show.',
    );
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
      'club-scoped roles, each labeled active/inactive/expired. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        showId: { type: 'string', description: 'Show UUID' },
      },
      required: ['showId'],
      additionalProperties: false,
    },
    parseInput: (raw) => listShowAccessInput.parse(raw),
    handle: (input) => listShowAccess(input as ListShowAccessInput, ctx),
  };
}
