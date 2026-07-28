import { createHash } from 'node:crypto';

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

function stripNonStatements(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/(\$[A-Za-z0-9_]*\$)[\s\S]*?\1/g, '$1$1')
    .replace(/'(?:[^']|'')*'/g, "''");
}

function normalizeSql(sql: string): string {
  return stripNonStatements(sql).replace(/\s+/g, ' ').trim();
}

interface FunctionIdentity {
  name: string;
  signature: string;
}

interface FunctionGrant {
  identity: FunctionIdentity;
  roles: string;
}

const TYPE_STARTS = new Set([
  'bigint',
  'bigserial',
  'bit',
  'boolean',
  'box',
  'bytea',
  'character',
  'cidr',
  'circle',
  'date',
  'double',
  'inet',
  'integer',
  'interval',
  'json',
  'jsonb',
  'line',
  'lseg',
  'macaddr',
  'money',
  'numeric',
  'path',
  'point',
  'polygon',
  'real',
  'record',
  'serial',
  'smallint',
  'smallserial',
  'text',
  'time',
  'timestamp',
  'trigger',
  'tsquery',
  'tsvector',
  'uuid',
  'varbit',
  'varchar',
  'xml',
]);

function closingParen(sql: string, openingIndex: number): number {
  let depth = 0;
  for (let index = openingIndex; index < sql.length; index += 1) {
    if (sql[index] === '(') depth += 1;
    if (sql[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitArguments(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '(') depth += 1;
    if (args[index] === ')') depth -= 1;
    if (args[index] === ',' && depth === 0) {
      parts.push(args.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(args.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

function normalizeArgument(argument: string): string | null {
  const withoutDefault = argument.split(/\s+(?:DEFAULT)\s+|=/i, 1)[0].trim();
  const tokens = withoutDefault.replace(/"/g, '').split(/\s+/);
  const mode = tokens[0]?.toLowerCase();

  if (mode === 'out') return null;
  if (mode === 'in' || mode === 'inout' || mode === 'variadic') tokens.shift();

  const first = tokens[0]?.toLowerCase() ?? '';
  const firstIsType =
    TYPE_STARTS.has(first) ||
    first.startsWith('any') ||
    first.includes('.') ||
    first.endsWith('[]');
  if (tokens.length > 1 && !firstIsType) tokens.shift();

  return tokens.join(' ').toLowerCase();
}

function normalizeSignature(args: string): string {
  return splitArguments(args)
    .map(normalizeArgument)
    .filter((argument): argument is string => Boolean(argument))
    .join(', ');
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

function functionGrants(sql: string): FunctionGrant[] {
  const grants: FunctionGrant[] = [];
  const pattern =
    /\bGRANT\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+FUNCTION\s+(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/gi;

  for (const match of sql.matchAll(pattern)) {
    const openingIndex = (match.index ?? 0) + match[0].length - 1;
    const closingIndex = closingParen(sql, openingIndex);
    if (closingIndex === -1) continue;
    const tail = sql.slice(closingIndex + 1).split(';', 1)[0];
    const roles = tail.match(/\bTO\s+(.+)$/i)?.[1] ?? '';
    grants.push({
      identity: {
        name: match[1].toLowerCase(),
        signature: normalizeSignature(sql.slice(openingIndex + 1, closingIndex)),
      },
      roles,
    });
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
  const pattern =
    /\bREVOKE\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+FUNCTION\s+(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/gi;

  for (const match of sql.matchAll(pattern)) {
    if (match[1].toLowerCase() !== identity.name) continue;
    const openingIndex = (match.index ?? 0) + match[0].length - 1;
    const closingIndex = closingParen(sql, openingIndex);
    if (closingIndex === -1) continue;
    if (normalizeSignature(sql.slice(openingIndex + 1, closingIndex)) !== identity.signature) {
      continue;
    }
    const roles = sql.slice(closingIndex + 1).split(';', 1)[0];
    if (/\bFROM\s+[^;]*\banon\b/i.test(roles)) return true;
  }

  return false;
}

function hasAuthenticatedFunctionDecision(sql: string, identity: FunctionIdentity): boolean {
  const pattern =
    /\b(?:GRANT|REVOKE)\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+FUNCTION\s+(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/gi;

  for (const match of sql.matchAll(pattern)) {
    if (match[1].toLowerCase() !== identity.name) continue;
    const openingIndex = (match.index ?? 0) + match[0].length - 1;
    const closingIndex = closingParen(sql, openingIndex);
    if (closingIndex === -1) continue;
    if (normalizeSignature(sql.slice(openingIndex + 1, closingIndex)) !== identity.signature) {
      continue;
    }
    const roles = sql.slice(closingIndex + 1).split(';', 1)[0];
    if (/\b(?:TO|FROM)\s+[^;]*\bauthenticated\b/i.test(roles)) return true;
  }

  return false;
}

function hasTableRoleDecision(
  sql: string,
  tableName: string,
  role: 'anon' | 'authenticated'
): boolean {
  const escapedName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    String.raw`\b(?:GRANT|REVOKE)\s+[^;]+\s+ON\s+(?:TABLE\s+)?(?:"?public"?\.)?"?${escapedName}"?\s+(?:TO|FROM)\s+[^;]*\b${role}\b`,
    'i'
  ).test(sql);
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

    if (/\bGRANT\s+[^;]+\s+ON\s+FUNCTIONS\b/i.test(statement)) {
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
      /\bGRANT\s+[^;]+\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+(?:"?public"?)\b/i.test(statement)
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

  for (const grant of functionGrants(sql)) {
    const displaySignature = identityKey(grant.identity);
    if (createdFunctions.has(displaySignature) || !hasApiRole(grant.roles)) continue;
    if (/\bPUBLIC\b/i.test(grant.roles)) {
      violations.push(
        `${filename}: public.${displaySignature} standalone PUBLIC function grant is forbidden`
      );
      continue;
    }
    if (/\banon\b/i.test(grant.roles) && !(displaySignature in ANON_EXECUTE_KEEP_LIST)) {
      violations.push(
        `${filename}: public.${displaySignature} standalone anon grant is not keep-listed`
      );
    }
    if (
      /\bauthenticated\b/i.test(grant.roles) &&
      !(displaySignature in ANON_EXECUTE_KEEP_LIST) &&
      !hasAnonFunctionDecision(sql, grant.identity)
    ) {
      violations.push(
        `${filename}: public.${displaySignature} standalone authenticated grant has no anon EXECUTE decision`
      );
    }
  }

  const tableGrantPattern =
    /\bGRANT\s+[^;]+\s+ON\s+(?:TABLE\s+)?(?:"?public"?\.)"?([A-Za-z_][A-Za-z0-9_]*)"?\s+TO\s+([^;]+)/gi;
  for (const match of sql.matchAll(tableGrantPattern)) {
    const tableName = match[1].toLowerCase();
    const roles = match[2];
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
