import { createHash } from 'node:crypto';
import {
  closingParen,
  normalizeSignature,
  normalizeSql,
  splitArguments,
} from './migrationGrantDecisionSql';

export interface MigrationSource {
  filename: string;
  sql: string;
}

export const GRANT_DECISION_ENFORCEMENT_MIGRATION =
  '20260728120000_advisor_grant_regrowth_guard.sql';

const LEGACY_MIGRATION_COUNT = 419;
const LEGACY_MIGRATION_FILENAME_SHA256 =
  '1c33ed17ca2c89fbe89fd48330e59f829518928e93a227efe23ff9340ce9a1e7';

const ANON_EXECUTE_KEEP_LIST: Readonly<Record<string, string>> = {
  'get_my_person_id()':
    'Anon-readable RLS policies resolve the current person through this helper.',
  'has_role(text, uuid)': 'Anon-readable RLS policies use this role predicate.',
  'is_club_admin(uuid)': 'Anon-readable RLS policies use this club authorization predicate.',
  'is_platform_admin()': 'Anon-readable RLS policies use this platform authorization predicate.',
  'is_show_official(uuid)': 'Anon-readable RLS policies use this show authorization predicate.',
  'is_show_secretary()': 'Anon-readable RLS policies use this secretary predicate overload.',
  'is_show_secretary(uuid)': 'Anon-readable RLS policies use this show-scoped secretary predicate.',
  'is_site_admin()': 'Anon-readable RLS policies use this site authorization predicate.',
  'is_trial_secretary(uuid)': 'Anon-readable RLS policies use this trial authorization predicate.',
  'resolve_class_result_visibility(uuid)':
    'The anon-facing public results view calls this release-gate helper.',
  // Both signatures stay listed: the corpus is replayed in full, and the
  // one-argument form is still granted by 20260803130000-150000 before
  // 20260803160000 drops it for the class-id-taking form.
  'tv_class_entry_counts(uuid)':
    'Superseded by the (uuid, uuid[]) form in 20260803160000; kept because the replayed corpus still contains the original grants (MYK9-65).',
  'tv_class_entry_counts(uuid, uuid[])':
    'The public /tv board counts entries through this definer RPC; an unauthenticated wall display is its primary caller. Exposes no rows anon cannot already read under entries_anon_select_for_tv, and the function re-derives that same show predicate (MYK9-65).',
  'tv_board_entries(uuid, uuid[])':
    'The public /tv running order reads through this definer RPC, for the same reason and under the same show predicate as tv_class_entry_counts (MYK9-65).',
};

const TABLE_GRANT_DECISION_KEEP_LIST: Readonly<Record<string, string>> = {
  login_attempts: 'RLS with no policies intentionally denies API roles; service paths use RPCs.',
  premium_generation_attempts:
    'RLS with no policies intentionally denies API roles; service paths use RPCs.',
  show_money_locks: 'RLS with no policies intentionally denies API roles; money RPCs own access.',
  show_passcodes: 'RLS with no policies intentionally denies API roles; passcode RPCs own access.',
  stripe_order_refunds:
    'RLS with no policies intentionally denies API roles; reconciliation RPCs own access.',
  waitlist_notification_events:
    'RLS with no policies intentionally denies API roles; waitlist worker RPCs own access.',
};

interface FunctionIdentity {
  name: string;
  signature: string;
}

interface RoutineTarget {
  name: string;
  signature: string | null;
}

interface RoutineMutation {
  operation: 'GRANT' | 'REVOKE';
  target: RoutineTarget;
  roles: string;
}

interface TableGrant {
  tableName: string;
  roles: string;
}

function functionCreates(sql: string): FunctionIdentity[] {
  const identities: FunctionIdentity[] = [];
  const pattern =
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/gi;

  for (const match of sql.matchAll(pattern)) {
    const openingIndex = (match.index ?? 0) + match[0].length - 1;
    const closingIndex = closingParen(sql, openingIndex);
    if (closingIndex === -1) continue;
    identities.push({
      name: match[1].toLowerCase(),
      signature: normalizeSignature(sql.slice(openingIndex + 1, closingIndex)),
    });
  }

  return identities;
}

function routineTargets(targetList: string): RoutineTarget[] {
  const parsedTargets: RoutineTarget[] = [];

  for (const target of splitArguments(targetList)) {
    const match = target.match(/^(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*(?:\(|$)/i);
    if (!match) continue;
    const openingIndex = target.indexOf('(', match[0].length - 1);
    if (openingIndex === -1) {
      parsedTargets.push({ name: match[1].toLowerCase(), signature: null });
      continue;
    }
    const closingIndex = closingParen(target, openingIndex);
    if (closingIndex === -1) continue;
    parsedTargets.push({
      name: match[1].toLowerCase(),
      signature: normalizeSignature(target.slice(openingIndex + 1, closingIndex)),
    });
  }

  return parsedTargets;
}

function routineMutations(sql: string): RoutineMutation[] {
  const mutations: RoutineMutation[] = [];

  for (const statement of sql.split(';')) {
    const match = statement.match(
      /\b(GRANT|REVOKE)\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+(?:FUNCTION|PROCEDURE|ROUTINE)\s+(.+?)\s+(?:TO|FROM)\s+(.+)$/i
    );
    if (!match) continue;
    const [, operation, targets, roles] = match;

    for (const target of routineTargets(targets)) {
      mutations.push({
        operation: operation.toUpperCase() as RoutineMutation['operation'],
        target,
        roles,
      });
    }
  }

  return mutations;
}

function publicTableTargets(targetList: string): string[] {
  return splitArguments(targetList).flatMap(target => {
    const match = target.match(/^(?:(?:"?public"?)\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?$/i);
    return match ? [match[1].toLowerCase()] : [];
  });
}

function tableGrants(sql: string): TableGrant[] {
  const grants: TableGrant[] = [];

  for (const statement of sql.split(';')) {
    if (
      /\bALTER\s+DEFAULT\s+PRIVILEGES\b/i.test(statement) ||
      /\bON\s+ALL\s+TABLES\b/i.test(statement)
    ) {
      continue;
    }
    const match = statement.match(/\bGRANT\s+[^;]+\s+ON\s+(?:TABLE\s+)?(.+?)\s+TO\s+(.+)$/i);
    if (!match) continue;
    const [, targets, roles] = match;
    for (const tableName of publicTableTargets(targets)) {
      grants.push({ tableName, roles });
    }
  }

  return grants;
}

function tableCreates(sql: string): string[] {
  return [
    ...sql.matchAll(
      /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\b/gi
    ),
  ].map(match => match[1].toLowerCase());
}

function hasAnonFunctionDecision(sql: string, identity: FunctionIdentity): boolean {
  return routineMutations(sql).some(
    mutation =>
      mutation.operation === 'REVOKE' &&
      mutation.target.name === identity.name &&
      mutation.target.signature === identity.signature &&
      /\banon\b/i.test(mutation.roles)
  );
}

function hasAuthenticatedFunctionDecision(sql: string, identity: FunctionIdentity): boolean {
  return routineMutations(sql).some(
    mutation =>
      mutation.target.name === identity.name &&
      mutation.target.signature === identity.signature &&
      /\bauthenticated\b/i.test(mutation.roles)
  );
}

function hasTableRoleDecision(
  sql: string,
  tableName: string,
  role: 'anon' | 'authenticated'
): boolean {
  for (const statement of sql.split(';')) {
    if (
      /\bALTER\s+DEFAULT\s+PRIVILEGES\b/i.test(statement) ||
      /\bON\s+ALL\s+TABLES\b/i.test(statement)
    ) {
      continue;
    }
    const match = statement.match(
      /\b(?:GRANT|REVOKE)\s+[^;]+\s+ON\s+(?:TABLE\s+)?(.+?)\s+(?:TO|FROM)\s+(.+)$/i
    );
    if (!match) continue;
    const [, targets, roles] = match;
    if (
      publicTableTargets(targets).includes(tableName) &&
      new RegExp(String.raw`\b${role}\b`, 'i').test(roles)
    ) {
      return true;
    }
  }

  return false;
}

function enablesRls(sql: string, tableName: string): boolean {
  const escapedName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    String.raw`\bALTER\s+TABLE\s+(?:"?public"?\.)?"?${escapedName}"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\b`,
    'i'
  ).test(sql);
}

function createsPolicy(sql: string, tableName: string): boolean {
  const escapedName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    String.raw`\bCREATE\s+POLICY\s+[^;]+\s+ON\s+(?:"?public"?\.)?"?${escapedName}"?\b`,
    'i'
  ).test(sql);
}

function identityKey(identity: FunctionIdentity): string {
  return `${identity.name}(${identity.signature})`;
}

function hasApiRole(roles: string): boolean {
  return /\b(?:PUBLIC|anon|authenticated)\b/i.test(roles);
}

function findUnsafeDefaultPrivilegeGrants(filename: string, sql: string): string[] {
  const violations: string[] = [];

  for (const statement of sql.split(';')) {
    if (!/\bALTER\s+DEFAULT\s+PRIVILEGES\b/i.test(statement)) continue;
    const schemaClause = statement.match(/\bIN\s+SCHEMA\s+(.+?)\s+GRANT\b/i)?.[1];
    if (schemaClause && !/\bpublic\b/i.test(schemaClause)) continue;
    const roles = statement.match(/\bTO\s+(.+)$/i)?.[1] ?? '';
    if (!hasApiRole(roles)) continue;

    if (/\bGRANT\s+[^;]+\s+ON\s+(?:FUNCTIONS|ROUTINES)\b/i.test(statement)) {
      violations.push(`${filename}: public function default privileges grant API execution`);
    }
    if (/\bGRANT\s+[^;]+\s+ON\s+TABLES\b/i.test(statement)) {
      violations.push(`${filename}: public table default privileges grant API access`);
    }
  }

  return violations;
}

function findUnsafeBulkGrants(filename: string, sql: string): string[] {
  const violations: string[] = [];

  for (const statement of sql.split(';')) {
    const roles = statement.match(/\bTO\s+(.+)$/i)?.[1] ?? '';
    if (!hasApiRole(roles)) continue;
    if (
      /\bGRANT\s+[^;]+\s+ON\s+ALL\s+(?:FUNCTIONS|ROUTINES)\s+IN\s+SCHEMA\s+(?:"?public"?)\b/i.test(
        statement
      )
    ) {
      violations.push(`${filename}: bulk public function grant exposes an API role`);
    }
    if (/\bGRANT\s+[^;]+\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+(?:"?public"?)\b/i.test(statement)) {
      violations.push(`${filename}: bulk public table grant exposes an API role`);
    }
  }

  return violations;
}

function findStandaloneGrantViolations(
  filename: string,
  sql: string,
  createdFunctions: Set<string>,
  createdTables: Set<string>
): string[] {
  const violations: string[] = [];

  for (const mutation of routineMutations(sql)) {
    if (mutation.operation !== 'GRANT' || !hasApiRole(mutation.roles)) continue;
    if (mutation.target.signature === null) {
      violations.push(
        `${filename}: public.${mutation.target.name} signature-omitted API function grant is forbidden`
      );
      continue;
    }
    const identity: FunctionIdentity = {
      name: mutation.target.name,
      signature: mutation.target.signature,
    };
    const displaySignature = identityKey(identity);
    if (createdFunctions.has(displaySignature)) continue;
    if (/\bPUBLIC\b/i.test(mutation.roles)) {
      violations.push(
        `${filename}: public.${displaySignature} standalone PUBLIC function grant is forbidden`
      );
      continue;
    }
    if (/\banon\b/i.test(mutation.roles) && !(displaySignature in ANON_EXECUTE_KEEP_LIST)) {
      violations.push(
        `${filename}: public.${displaySignature} standalone anon grant is not keep-listed`
      );
    }
    if (
      /\bauthenticated\b/i.test(mutation.roles) &&
      !(displaySignature in ANON_EXECUTE_KEEP_LIST) &&
      !hasAnonFunctionDecision(sql, identity)
    ) {
      violations.push(
        `${filename}: public.${displaySignature} standalone authenticated grant has no anon EXECUTE decision`
      );
    }
  }

  for (const grant of tableGrants(sql)) {
    const { tableName, roles } = grant;
    if (createdTables.has(tableName) || !hasApiRole(roles)) continue;
    if (/\bPUBLIC\b/i.test(roles)) {
      violations.push(
        `${filename}: public.${tableName} standalone PUBLIC table grant is forbidden`
      );
      continue;
    }
    if (!hasTableRoleDecision(sql, tableName, 'anon')) {
      violations.push(
        `${filename}: public.${tableName} standalone table grant has no anon decision`
      );
    }
    if (!hasTableRoleDecision(sql, tableName, 'authenticated')) {
      violations.push(
        `${filename}: public.${tableName} standalone table grant has no authenticated decision`
      );
    }
  }

  return violations;
}

function findLegacyBaselineViolation(migrations: MigrationSource[]): string[] {
  const filenames = migrations
    .map(migration => migration.filename)
    .filter(filename => filename < GRANT_DECISION_ENFORCEMENT_MIGRATION)
    .sort();
  const digest = createHash('sha256')
    .update(`${filenames.join('\n')}\n`)
    .digest('hex');

  if (filenames.length === LEGACY_MIGRATION_COUNT && digest === LEGACY_MIGRATION_FILENAME_SHA256) {
    return [];
  }

  return [
    `legacy migration filename baseline changed (expected ${LEGACY_MIGRATION_COUNT} files, sha256 ${LEGACY_MIGRATION_FILENAME_SHA256}; received ${filenames.length}, sha256 ${digest})`,
  ];
}

interface GrantDecisionOptions {
  validateLegacyBaseline?: boolean;
}

export function findUndecidedPublicObjects(
  migrations: MigrationSource[],
  options: GrantDecisionOptions = {}
): string[] {
  const violations: string[] = [];

  if (options.validateLegacyBaseline) {
    violations.push(...findLegacyBaselineViolation(migrations));
  }

  for (const migration of migrations) {
    if (migration.filename < GRANT_DECISION_ENFORCEMENT_MIGRATION) continue;

    const sql = normalizeSql(migration.sql);
    const createdFunctionIdentities = functionCreates(sql);
    const createdFunctions = new Set(createdFunctionIdentities.map(identityKey));
    const createdTableNames = tableCreates(sql);
    const createdTables = new Set(createdTableNames);

    violations.push(...findUnsafeDefaultPrivilegeGrants(migration.filename, sql));
    violations.push(...findUnsafeBulkGrants(migration.filename, sql));
    violations.push(
      ...findStandaloneGrantViolations(migration.filename, sql, createdFunctions, createdTables)
    );

    for (const identity of createdFunctionIdentities) {
      const displaySignature = identityKey(identity);
      const keepListed = displaySignature in ANON_EXECUTE_KEEP_LIST;
      if (!keepListed && !hasAnonFunctionDecision(sql, identity)) {
        violations.push(
          `${migration.filename}: public.${displaySignature} has no anon EXECUTE decision`
        );
      }
      if (!hasAuthenticatedFunctionDecision(sql, identity)) {
        violations.push(
          `${migration.filename}: public.${displaySignature} has no authenticated EXECUTE decision`
        );
      }
    }

    for (const tableName of createdTableNames) {
      const keepListed = tableName in TABLE_GRANT_DECISION_KEEP_LIST;
      if (!keepListed && !hasTableRoleDecision(sql, tableName, 'anon')) {
        violations.push(`${migration.filename}: public.${tableName} has no anon table decision`);
      }
      if (!keepListed && !hasTableRoleDecision(sql, tableName, 'authenticated')) {
        violations.push(
          `${migration.filename}: public.${tableName} has no authenticated table decision`
        );
      }
      if (!keepListed && enablesRls(sql, tableName) && !createsPolicy(sql, tableName)) {
        violations.push(
          `${migration.filename}: public.${tableName} enables RLS with no policy or deny-all disposition`
        );
      }
    }
  }

  return violations;
}
