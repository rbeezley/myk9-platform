import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  availabilityMigration,
  catalogMigration,
  expectedPolicyTables,
  identityMigration,
  intentionalPolicyOverlaps,
  migrationNames,
  operationsMigration,
  policyCommands,
  policyRoleClasses,
  showdayMigration,
} from './permissivePolicyConsolidationConfig';
import {
  allowed,
  applies,
  assignments,
  insert,
  manage,
  remove,
  select,
  splitManage,
  splitNames,
  update,
  type Policy,
} from './permissivePolicyModel';
import {
  expectedForwardPolicySignature,
  expectedRollbackPolicySignature,
} from './permissivePolicySqlDigests';
import { policyDefinitionSignature } from './permissivePolicySqlContract';

interface TableCase {
  table: string;
  migration: string;
  before: Policy[];
  after: Policy[];
  drops: string[];
  creates: string[];
}

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations');
const rollbackPath = resolve(
  __dirname,
  '../../../../../openspec/changes/archive/2026-07-28-consolidate-permissive-rls-policies/rollback.sql'
);

/**
 * Later migrations that intentionally change policies on the reviewed tables.
 *
 * The tripwire below exists so nobody edits these policies without the
 * consolidation model being re-reviewed. Recording the migration here IS that
 * review — it is not a bypass, and the tripwire keeps firing for every file not
 * listed. Each entry states which reviewed tables it touches and what it changes,
 * so the next reader can tell at a glance whether the consolidation still holds.
 */
const reviewedLaterPolicyDdl: Readonly<Record<string, string>> = {
  '20260731180000_exclude_anonymous_sessions_from_account_reads.sql':
    'MYK9-117 / SA-2026-07-29-02. Adds public.is_real_account() to unconditional SELECT ' +
    'policies so an anonymous (ringside passcode) session cannot read volunteer PII, the ' +
    'RBAC catalog or audit data. From this inventory it touches offline_scoring, volunteers, ' +
    'volunteer_roles, volunteer_class_assignments and volunteer_general_assignments. SELECT ' +
    'policies only — no INSERT/UPDATE/DELETE policy, grant, RLS-mode or helper changes, so ' +
    'the consolidation counts this test pins are unaffected.',
  '20260801160000_remove_steward_office_writes.sql':
    'MYK9-147. Adds public.is_show_office_manager() and replaces the INSERT/UPDATE/DELETE ' +
    'policies on judge_assignments and enrollments so stewards — who is_show_official() ' +
    'deliberately includes for ringside reads — can no longer mutate enrollments or judge ' +
    'contracts. From this inventory it touches judge_assignments and enrollments, and only ' +
    'their write policies: no SELECT policy is created, altered or dropped, so the SELECT ' +
    'consolidation counts this test pins are unaffected.',
};

const tableCases: TableCase[] = [
  {
    table: 'dogs',
    migration: availabilityMigration,
    before: [
      insert('dogs_insert', 'authenticated', ['owner', 'coOwner', 'siteAdmin']),
      insert('dogs_insert_secretary', 'public', ['secretaryInsert']),
    ],
    after: [
      insert('dogs_insert', 'authenticated', ['owner', 'coOwner', 'siteAdmin']),
      insert('dogs_insert_secretary', 'public', ['secretaryInsert']),
    ],
    drops: [],
    creates: [],
  },
  {
    table: 'enrollments',
    migration: identityMigration,
    before: [
      insert('enrollments_insert_show_official', 'public', ['official']),
      insert('registrations_insert_admin', 'public', ['admin']),
      insert('registrations_insert_own', 'public', ['own']),
      select('enrollments_select_show_official', 'public', ['official']),
      select('enrollments_select_show_secretary', 'public', ['secretary']),
      select('registrations_select_admin', 'public', ['admin']),
      select('registrations_select_own', 'public', ['own']),
      update('enrollments_update_show_official', 'public', ['official']),
      update('registrations_update_admin', 'public', ['admin']),
      update('registrations_update_own', 'public', ['own']),
    ],
    after: [
      insert('enrollments_insert', 'public', ['official', 'admin', 'own']),
      select('enrollments_select', 'public', ['official', 'secretary', 'admin', 'own']),
      update('enrollments_update', 'public', ['official', 'admin', 'own']),
    ],
    drops: [
      'enrollments_insert_show_official',
      'registrations_insert_admin',
      'registrations_insert_own',
      'enrollments_select_show_official',
      'enrollments_select_show_secretary',
      'registrations_select_admin',
      'registrations_select_own',
      'enrollments_update_show_official',
      'registrations_update_admin',
      'registrations_update_own',
    ],
    creates: ['enrollments_insert', 'enrollments_select', 'enrollments_update'],
  },
  {
    table: 'exhibitor_profiles',
    migration: identityMigration,
    before: [
      select('exhibitor_profiles_select', 'public', ['admin', 'own']),
      select('users_view_own_profile', 'public', ['own']),
    ],
    after: [select('exhibitor_profiles_select', 'public', ['admin', 'own'])],
    drops: ['exhibitor_profiles_select', 'users_view_own_profile'],
    creates: ['exhibitor_profiles_select'],
  },
  {
    table: 'judge_assignments',
    migration: showdayMigration,
    before: [
      manage('judge_assignments_write', 'authenticated', ['manager']),
      select('judge_assignments_select', 'public', ['TRUE']),
    ],
    after: [
      ...splitManage('judge_assignments', 'authenticated', ['manager']),
      select('judge_assignments_select', 'public', ['TRUE']),
    ],
    drops: ['judge_assignments_write'],
    creates: splitNames('judge_assignments'),
  },
  {
    table: 'judge_availability',
    migration: availabilityMigration,
    before: [
      manage('Admins can manage all availability', 'public', ['admin']),
      manage('Users can manage own availability', 'public', ['own']),
      select('Secretaries can view all availability', 'public', ['secretary']),
      select('Users can view own availability', 'public', ['own']),
    ],
    after: [
      insert('judge_availability_insert', 'public', ['admin', 'own']),
      select('judge_availability_select', 'public', ['admin', 'own', 'secretary']),
      update('judge_availability_update', 'public', ['admin', 'own']),
      remove('judge_availability_delete', 'public', ['admin', 'own']),
    ],
    drops: [
      'Admins can manage all availability',
      'Users can manage own availability',
      'Secretaries can view all availability',
      'Users can view own availability',
    ],
    creates: [
      'judge_availability_insert',
      'judge_availability_select',
      'judge_availability_update',
      'judge_availability_delete',
    ],
  },
  {
    table: 'notification_queue',
    migration: operationsMigration,
    before: [
      manage('notification_queue_manage', 'authenticated', ['admin']),
      select('notification_queue_select', 'authenticated', ['own', 'admin']),
    ],
    after: [
      ...splitManage('notification_queue', 'authenticated', ['admin']),
      select('notification_queue_select', 'authenticated', ['own', 'admin']),
    ],
    drops: ['notification_queue_manage'],
    creates: splitNames('notification_queue'),
  },
  {
    table: 'offline_scoring',
    migration: showdayMigration,
    before: [
      manage('offline_scoring_manage', 'authenticated', ['manager']),
      select('offline_scoring_select', 'authenticated', ['TRUE']),
    ],
    after: [
      ...splitManage('offline_scoring', 'authenticated', ['manager']),
      select('offline_scoring_select', 'authenticated', ['TRUE']),
    ],
    drops: ['offline_scoring_manage'],
    creates: splitNames('offline_scoring'),
  },
  {
    table: 'people',
    migration: identityMigration,
    before: [
      insert('people_insert', 'authenticated', ['self', 'siteAdmin']),
      insert('people_insert_secretary', 'authenticated', ['secretaryNew']),
      update('people_update_own', 'authenticated', ['own']),
      update('people_update_privileged', 'authenticated', ['privileged', 'siteAdmin']),
    ],
    after: [
      insert('people_insert', 'authenticated', ['self', 'siteAdmin', 'secretaryNew']),
      update('people_update', 'authenticated', ['own', 'privileged', 'siteAdmin']),
    ],
    drops: [
      'people_insert',
      'people_insert_secretary',
      'people_update_own',
      'people_update_privileged',
    ],
    creates: ['people_insert', 'people_update'],
  },
  {
    table: 'push_notification_queue',
    migration: operationsMigration,
    before: [
      manage('push_notification_queue_manage', 'authenticated', ['admin']),
      select('push_notification_queue_select', 'authenticated', ['own', 'admin']),
    ],
    after: [
      ...splitManage('push_notification_queue', 'authenticated', ['admin']),
      select('push_notification_queue_select', 'authenticated', ['own', 'admin']),
    ],
    drops: ['push_notification_queue_manage'],
    creates: splitNames('push_notification_queue'),
  },
  {
    table: 'push_subscriptions',
    migration: availabilityMigration,
    before: [
      manage('Users manage own subscriptions', 'public', ['own']),
      manage('push_subscriptions_user_access', 'authenticated', ['own', 'admin']),
    ],
    after: [
      manage('Users manage own subscriptions', 'public', ['own']),
      manage('push_subscriptions_user_access', 'authenticated', ['own', 'admin']),
    ],
    drops: [],
    creates: [],
  },
  {
    table: 'role_requests',
    migration: identityMigration,
    before: [
      select('Site admins can view role requests', 'authenticated', ['admin']),
      select('Users can view their own role requests', 'authenticated', ['own']),
    ],
    after: [select('role_requests_select', 'authenticated', ['admin', 'own'])],
    drops: ['Site admins can view role requests', 'Users can view their own role requests'],
    creates: ['role_requests_select'],
  },
  ...[
    ['sport_class_rules', 'sport_class_rules_modify', 'sport_class_rules_select'],
    ['sport_templates', 'sport_templates_modify', 'sport_templates_select'],
    ['sport_titles', 'sport_titles_modify', 'sport_titles_select'],
  ].map(([table, manageName, selectName]): TableCase => ({
    table,
    migration: catalogMigration,
    before: [
      manage(manageName, 'authenticated', ['admin']),
      select(selectName, 'public', ['TRUE']),
    ],
    after: [
      ...splitManage(`${table}_manage`, 'authenticated', ['admin']),
      select(selectName, 'public', ['TRUE']),
    ],
    drops: [manageName],
    creates: splitNames(`${table}_manage`),
  })),
  ...[
    ['stripe_customers', 'own'],
    ['stripe_orders', 'ownCustomer'],
    ['stripe_subscriptions', 'ownCustomer'],
  ].map(([table, ownAtom]): TableCase => ({
    table,
    migration: operationsMigration,
    before: [
      manage(`${table}_manage`, 'authenticated', ['admin']),
      select(`${table}_select`, 'authenticated', [ownAtom, 'admin']),
    ],
    after: [
      ...splitManage(`${table}_manage`, 'authenticated', ['admin']),
      select(`${table}_select`, 'authenticated', [ownAtom, 'admin']),
    ],
    drops: [`${table}_manage`],
    creates: splitNames(`${table}_manage`),
  })),
  {
    table: 'sync_conflicts',
    migration: operationsMigration,
    before: [
      manage('sync_conflicts_manage', 'authenticated', ['admin']),
      select('sync_conflicts_select', 'authenticated', ['nonAnonymous']),
    ],
    after: [
      ...splitManage('sync_conflicts', 'authenticated', ['admin']),
      select('sync_conflicts_select', 'authenticated', ['nonAnonymous', 'admin']),
    ],
    drops: ['sync_conflicts_manage', 'sync_conflicts_select'],
    creates: [...splitNames('sync_conflicts'), 'sync_conflicts_select'],
  },
  {
    table: 'vaccinations',
    migration: identityMigration,
    before: [
      select('vaccinations_select', 'authenticated', ['owner', 'admin']),
      select('vaccinations_secretary_select', 'authenticated', ['secretary']),
    ],
    after: [select('vaccinations_select', 'authenticated', ['owner', 'admin', 'secretary'])],
    drops: ['vaccinations_select', 'vaccinations_secretary_select'],
    creates: ['vaccinations_select'],
  },
  ...[
    [
      'volunteer_class_assignments',
      'Show managers can manage class assignments',
      'Authenticated users can view class assignments',
    ],
    [
      'volunteer_general_assignments',
      'Show managers can manage general assignments',
      'Authenticated users can view general assignments',
    ],
    [
      'volunteers',
      'Show managers can manage volunteers',
      'Authenticated users can view volunteers',
    ],
  ].map(([table, manageName, selectName]): TableCase => ({
    table,
    migration: catalogMigration,
    before: [
      manage(manageName, 'authenticated', ['manager']),
      select(selectName, 'authenticated', ['TRUE']),
    ],
    after: [
      ...splitManage(`${table}_manage`, 'authenticated', ['manager']),
      select(selectName, 'authenticated', ['TRUE']),
    ],
    drops: [manageName],
    creates: splitNames(`${table}_manage`),
  })),
  {
    table: 'volunteer_roles',
    migration: catalogMigration,
    before: [
      manage('volunteer_roles_manage', 'authenticated', ['manager']),
      select('volunteer_roles_select', 'authenticated', ['TRUE']),
    ],
    after: [
      ...splitManage('volunteer_roles_manage', 'authenticated', ['manager']),
      select('volunteer_roles_select', 'authenticated', ['TRUE']),
    ],
    drops: ['volunteer_roles_manage'],
    creates: splitNames('volunteer_roles_manage'),
  },
];

function sourceFor(name: string): string {
  const path = join(migrationsDir, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

describe('MYK9-112 permissive-policy consolidation contract', () => {
  it('covers the exact 23-table applied inventory', () => {
    expect(tableCases.map(entry => entry.table).sort()).toEqual(expectedPolicyTables);
  });

  it.each(tableCases)('$table preserves every role/command predicate outcome', tableCase => {
    const atoms = [
      ...new Set(
        [...tableCase.before, ...tableCase.after].flatMap(policyValue => [
          ...policyValue.using,
          ...policyValue.check,
        ])
      ),
    ];

    for (const assignment of assignments(atoms)) {
      for (const role of policyRoleClasses) {
        for (const command of policyCommands) {
          const paths: ('using' | 'check')[] =
            command === 'UPDATE'
              ? ['using', 'check']
              : command === 'INSERT'
                ? ['check']
                : ['using'];
          for (const path of paths) {
            expect(
              allowed(tableCase.after, role, command, path, assignment),
              `${tableCase.table} ${role} ${command} ${path} ${JSON.stringify(assignment)}`
            ).toBe(allowed(tableCase.before, role, command, path, assignment));
          }
        }
      }
    }
  });

  it('creates every reviewed migration before policy assertions run', () => {
    for (const migration of migrationNames) {
      expect(existsSync(join(migrationsDir, migration)), migration).toBe(true);
    }
  });

  it.each(tableCases.filter(entry => entry.drops.length > 0))(
    '$table drops reviewed policies and creates the target command/role topology',
    tableCase => {
      const source = sourceFor(tableCase.migration);
      const normalizedSource = source.toLowerCase().replace(/\s+/g, ' ');
      for (const name of tableCase.drops) {
        expect(normalizedSource).toContain(
          `drop policy if exists "${name.toLowerCase()}" on public.${tableCase.table}`
        );
      }

      for (const name of tableCase.creates) {
        const target = tableCase.after.find(policyValue => policyValue.name === name);
        expect(target, `${tableCase.table}.${name} target policy`).toBeDefined();
        expect(source.toLowerCase()).toMatch(
          new RegExp(
            `create\\s+policy\\s+"${name.toLowerCase()}"\\s+on\\s+public\\.${tableCase.table}` +
              `\\s+for\\s+${target!.command.toLowerCase()}\\s+to\\s+${target!.role}`
          )
        );
      }
    }
  );

  it('leaves grants, RLS mode, and authorization helpers unchanged', () => {
    const source = migrationNames.map(sourceFor).join('\n');
    expect(source).not.toMatch(/\b(?:grant|revoke)\b/i);
    expect(source).not.toMatch(/\b(?:enable|disable|force|no force)\s+row\s+level\s+security\b/i);
    expect(source).not.toMatch(/\bcreate\s+or\s+replace\s+function\b/i);
  });

  it('binds every created policy to its reviewed role, command, USING, and WITH CHECK SQL', () => {
    const source = migrationNames.map(sourceFor).join('\n');
    expect(policyDefinitionSignature(source)).toEqual(expectedForwardPolicySignature);
  });

  it('preserves duplicate definitions and accepts qualified or unqualified policy tables', () => {
    const source = `
      CREATE POLICY "duplicate" ON example FOR SELECT TO public USING (true);
      CREATE POLICY "duplicate" ON public.example FOR SELECT TO public USING (true);
    `;
    expect(policyDefinitionSignature(source).count).toBe(2);
  });

  it('fails closed when any CREATE POLICY statement cannot be parsed', () => {
    expect(() => policyDefinitionSignature('CREATE POLICY incomplete')).toThrow(
      'Parsed 0 of 1 CREATE POLICY statements'
    );
  });

  it('keeps an exact 70-policy forward-restoration artifact', () => {
    const rollback = readFileSync(rollbackPath, 'utf8');
    expect(policyDefinitionSignature(rollback)).toEqual(expectedRollbackPolicySignature);
  });

  it('does not rewrite the two intentionally layered policy sets', () => {
    const source = sourceFor(availabilityMigration);
    expect(source).not.toMatch(
      /(?:create|alter|drop)\s+policy[\s\S]{0,120}?on\s+public\.(?:dogs|push_subscriptions)\b/i
    );
  });

  it('retains only the five reviewed role-mismatched overlap groups', () => {
    const actual = new Set<string>();
    for (const tableCase of tableCases) {
      for (const role of policyRoleClasses) {
        for (const command of policyCommands) {
          const count = tableCase.after.filter(policyValue =>
            applies(policyValue, role, command)
          ).length;
          if (count > 1) actual.add(`${tableCase.table}|${role}|${command}`);
        }
      }
    }
    expect(actual).toEqual(intentionalPolicyOverlaps);
  });

  it('keeps the reviewed-exception list free of stale entries', () => {
    // An exception list nobody validates rots into a silent hole: rename or drop
    // the migration and the tripwire stays disarmed for a file that no longer
    // exists. Every entry must name a real migration that really does contain
    // policy DDL on a reviewed table — otherwise it should not be excepted.
    const existing = new Set(readdirSync(migrationsDir).filter(file => file.endsWith('.sql')));
    const affected = tableCases.map(entry => entry.table).join('|');
    const policyDdl = new RegExp(
      `(?:create|alter|drop)\\s+policy[\\s\\S]{0,160}?on\\s+(?:public\\.)?(?:${affected})\\b`,
      'i'
    );

    for (const [file, reason] of Object.entries(reviewedLaterPolicyDdl)) {
      expect(existing.has(file), `${file}: excepted but no such migration`).toBe(true);
      expect(reason.length, `${file}: exception needs a reason`).toBeGreaterThan(40);
      expect(
        readFileSync(join(migrationsDir, file), 'utf8'),
        `${file}: excepted but contains no policy DDL on a reviewed table — drop the exception`
      ).toMatch(policyDdl);
    }
  });

  it('rejects later policy DDL on the reviewed tables until the model is updated', () => {
    const lastMigration = availabilityMigration;
    const affected = tableCases.map(entry => entry.table).join('|');
    const laterPolicyDdl = new RegExp(
      `(?:create|alter|drop)\\s+policy[\\s\\S]{0,160}?on\\s+(?:public\\.)?(?:${affected})\\b`,
      'i'
    );
    const laterFiles = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') && file > lastMigration)
      .filter(file => !(file in reviewedLaterPolicyDdl))
      .sort();

    for (const file of laterFiles) {
      expect(readFileSync(join(migrationsDir, file), 'utf8'), file).not.toMatch(laterPolicyDdl);
    }
  });
});
