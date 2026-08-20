/**
 * MYK9-129 — drift detection for applied authenticated/table and sequence ACLs.
 *
 * The SQL contract in `supabase/tests/pre_rule_table_grants_test.sql` remains the
 * source of truth. This copy is the runner's independent expected-value map so a
 * live database snapshot can be judged without reading migration text.
 */

import type { SnapshotCheck } from './systemHealthChecks.ts';

export const AUTHENTICATED_TABLE_GRANTS: Readonly<Record<string, string>> = {
  achievements: 'SELECT,INSERT,UPDATE,DELETE',
  activity_log: 'SELECT,INSERT',
  allergies: 'SELECT,INSERT,UPDATE,DELETE',
  analytics_events: 'SELECT,INSERT',
  announcement_reads: 'SELECT',
  announcements: 'SELECT',
  armbands: 'SELECT,INSERT,UPDATE,DELETE',
  // SELECT only, deliberately: the webcal URL is the credential, so every write
  // goes through the SECURITY DEFINER RPCs (20260816130000). Widening this to
  // INSERT/UPDATE would reopen the token-choosing and existence-oracle holes
  // that migration's header enumerates.
  calendar_feed_tokens: 'SELECT',
  chatbot_feedback: 'INSERT',
  chatbot_query_log: '',
  class_visibility_overrides: 'SELECT,INSERT,UPDATE',
  classes: 'INSERT,UPDATE,DELETE',
  club_access_requests: 'SELECT,UPDATE',
  club_members: 'SELECT,INSERT,UPDATE,DELETE',
  club_officers: 'SELECT,INSERT,UPDATE,DELETE',
  club_premium_templates: 'SELECT,INSERT,UPDATE,DELETE',
  club_stripe_accounts: 'SELECT',
  clubs: 'SELECT,INSERT,UPDATE,DELETE',
  dog_favorites: 'SELECT,INSERT,UPDATE,DELETE',
  dog_registrations: 'SELECT,INSERT,UPDATE,DELETE',
  dogs: 'SELECT,INSERT,UPDATE,DELETE',
  email_log: 'SELECT',
  enrollments: 'SELECT,INSERT,UPDATE',
  entries: 'INSERT,UPDATE,DELETE',
  entry_cart_items: 'SELECT,INSERT,UPDATE,DELETE',
  entry_carts: 'SELECT,INSERT,UPDATE,DELETE',
  entry_payment_links: 'SELECT',
  entry_status_history: 'SELECT',
  entry_submissions: 'SELECT',
  exhibitor_profiles: 'SELECT,INSERT,UPDATE,DELETE',
  fcm_tokens: 'SELECT,INSERT,UPDATE,DELETE',
  frontend_logs: '',
  genetic_screenings: 'SELECT,INSERT,UPDATE,DELETE',
  health_records: 'SELECT,INSERT,UPDATE,DELETE',
  judge_assignments: 'INSERT,UPDATE,DELETE',
  judge_availability: 'SELECT,INSERT,UPDATE,DELETE',
  judge_certifications: 'SELECT,INSERT,UPDATE,DELETE',
  judge_qualifications: 'SELECT,INSERT,UPDATE,DELETE',
  login_attempts: '',
  manual_results: 'SELECT,INSERT,UPDATE,DELETE',
  medications: 'SELECT,INSERT,UPDATE,DELETE',
  nationals_advancement: 'SELECT,INSERT,UPDATE,DELETE',
  nationals_rankings: 'SELECT,INSERT,UPDATE,DELETE',
  nationals_scores: 'SELECT,INSERT,UPDATE,DELETE',
  notification_preferences: 'SELECT,INSERT,UPDATE,DELETE',
  notification_queue: 'SELECT,INSERT,UPDATE,DELETE',
  notifications: 'SELECT,INSERT,UPDATE',
  ofa_screenings: 'SELECT,INSERT,UPDATE,DELETE',
  offline_scoring: 'SELECT,INSERT,UPDATE,DELETE',
  onboarding_requests: 'SELECT,INSERT,UPDATE',
  operator_alerts: 'SELECT',
  organization_agreements: 'SELECT,INSERT,UPDATE,DELETE',
  paperwork_prints: 'SELECT,INSERT',
  pedigree_ancestors: 'SELECT,INSERT,UPDATE,DELETE',
  people: 'SELECT,INSERT,UPDATE,DELETE',
  performance_metrics: 'SELECT,INSERT',
  permission_audit_log: 'SELECT,INSERT',
  permissions: 'SELECT,INSERT,UPDATE,DELETE',
  platform_settings: 'SELECT,UPDATE',
  platform_waitlist: 'SELECT,INSERT',
  premium_generation_attempts: '',
  premium_generations: 'SELECT,INSERT',
  promo_codes: 'SELECT,INSERT,UPDATE,DELETE',
  push_notification_queue: 'SELECT,INSERT,UPDATE,DELETE',
  push_subscriptions: 'SELECT,INSERT,UPDATE,DELETE',
  result_submissions: 'SELECT,INSERT',
  ringside_containment: '',
  ringside_containment_audit: '',
  ringside_sessions: '',
  role_permissions: 'SELECT,INSERT,UPDATE,DELETE',
  role_requests: 'SELECT,UPDATE',
  roles: 'SELECT,INSERT,UPDATE,DELETE',
  rule_organizations: 'SELECT',
  rule_sports: 'SELECT',
  rulebooks: 'SELECT',
  rules: 'SELECT',
  rules_feedback: 'INSERT',
  rules_query_log: 'INSERT',
  secretary_tasks: 'SELECT,INSERT,UPDATE,DELETE',
  show_announcement_reads: 'SELECT,INSERT,UPDATE,DELETE',
  show_announcements: 'SELECT,INSERT,UPDATE,DELETE',
  // MYK9-203: service_role only; the ledger is never touched by a client role.
  show_eve_nudge_log: '',
  show_incidents: 'SELECT,INSERT',
  show_lifecycle_email_attempts: 'SELECT',
  show_lifecycle_email_jobs: 'SELECT,UPDATE',
  show_lifecycle_email_steps: 'SELECT,UPDATE',
  show_message_threads: 'SELECT,INSERT,UPDATE',
  show_messages: 'SELECT,INSERT,UPDATE',
  show_money_locks: '',
  show_passcodes: '',
  show_payouts: 'SELECT',
  show_templates: 'SELECT,INSERT,UPDATE,DELETE',
  show_visibility_settings: 'SELECT,INSERT,UPDATE',
  shows: 'SELECT,INSERT,UPDATE,DELETE',
  sport_class_rules: 'SELECT,INSERT,UPDATE,DELETE',
  sport_templates: 'SELECT,INSERT,UPDATE,DELETE',
  sport_titles: 'SELECT,INSERT,UPDATE,DELETE',
  stripe_customers: 'SELECT,INSERT,UPDATE,DELETE',
  stripe_order_refunds: '',
  stripe_orders: 'SELECT',
  stripe_subscriptions: 'SELECT,INSERT,UPDATE,DELETE',
  subscription_entitlement_grants: 'SELECT',
  support_ticket_messages: 'SELECT,INSERT,UPDATE',
  support_tickets: 'SELECT,INSERT,UPDATE',
  sync_conflicts: 'SELECT,INSERT,UPDATE,DELETE',
  system_health_snapshots: 'SELECT',
  training_goals: 'SELECT,INSERT,UPDATE,DELETE',
  training_journal_entries: 'SELECT,INSERT,UPDATE,DELETE',
  training_milestones: 'SELECT,INSERT,UPDATE,DELETE',
  trial_checklist_state: 'SELECT,INSERT,UPDATE,DELETE',
  trial_judge_supplies: 'SELECT,INSERT,UPDATE,DELETE',
  trial_visibility_overrides: 'SELECT,INSERT,UPDATE',
  trials: 'SELECT,INSERT,UPDATE,DELETE',
  user_guide: 'SELECT',
  user_milestones: 'SELECT,INSERT,UPDATE,DELETE',
  user_preferences: 'SELECT,INSERT,UPDATE,DELETE',
  user_roles: 'SELECT,INSERT,UPDATE,DELETE',
  vaccinations: 'SELECT,INSERT,UPDATE,DELETE',
  vet_visits: 'SELECT,INSERT,UPDATE,DELETE',
  volunteer_class_assignments: 'SELECT,INSERT,UPDATE,DELETE',
  volunteer_general_assignments: 'SELECT,INSERT,UPDATE,DELETE',
  volunteer_roles: 'SELECT,INSERT,UPDATE,DELETE',
  volunteers: 'SELECT,INSERT,UPDATE,DELETE',
  waitlist_entries: 'SELECT,INSERT,UPDATE,DELETE',
  waitlist_notification_events: '',
};

const SEQUENCE_GRANTS: Readonly<Record<string, string>> = {
  'registration_confirmation_seq/anon': '',
  'registration_confirmation_seq/authenticated': 'SELECT,USAGE',
  'registration_confirmation_seq/service_role': 'SELECT,UPDATE,USAGE',
  'frontend_logs_id_seq/anon': '',
  'frontend_logs_id_seq/authenticated': '',
  'frontend_logs_id_seq/service_role': 'SELECT,UPDATE,USAGE',
  'ringside_conflict_seq/anon': '',
  'ringside_conflict_seq/authenticated': '',
  'ringside_conflict_seq/service_role': 'SELECT,UPDATE,USAGE',
  'ringside_containment_audit_id_seq/anon': '',
  'ringside_containment_audit_id_seq/authenticated': '',
  'ringside_containment_audit_id_seq/service_role': '',
};

interface GrantRow {
  name: string;
  privs: string;
}

interface RoleGrantRow extends GrantRow {
  role: string;
}

interface DefaultGrantRow {
  grantor: string;
  role: string;
  objtype: string;
  privs: string;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function parseGrant(raw: unknown): GrantRow {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { name: asString(row.name, '(unknown)'), privs: asString(row.privs) };
}

function parseRoleGrant(raw: unknown): RoleGrantRow {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { ...parseGrant(raw), role: asString(row.role, '(unknown)') };
}

function parseDefaultGrant(raw: unknown): DefaultGrantRow {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    grantor: asString(row.grantor, '(unknown)'),
    role: asString(row.role, '(unknown)'),
    objtype: asString(row.objtype),
    privs: asString(row.privs),
  };
}

/** Judge the applied ACL fact block returned by `public.system_health_probe()`. */
export function appliedAclCheck(rawFacts: unknown, probedAt: string): SnapshotCheck {
  const base = {
    key: 'applied_acl_grants',
    label: 'Applied ACL grants',
    checked_at: probedAt,
  } as const;
  if (!rawFacts || typeof rawFacts !== 'object') {
    return { ...base, status: 'warn', detail: 'probe returned no applied_acl_grants facts' };
  }

  const facts = rawFacts as Record<string, unknown>;
  const tableRows = Array.isArray(facts.tables) ? facts.tables.map(parseGrant) : [];
  const forbiddenRows = Array.isArray(facts.forbidden_tables)
    ? facts.forbidden_tables.map(parseRoleGrant)
    : [];
  const sequenceRows = Array.isArray(facts.sequences) ? facts.sequences.map(parseRoleGrant) : [];
  const defaultRows = Array.isArray(facts.defaults) ? facts.defaults.map(parseDefaultGrant) : [];
  const problems: string[] = [];

  const seenTables = new Set<string>();
  for (const row of tableRows) {
    const expected = AUTHENTICATED_TABLE_GRANTS[row.name];
    if (expected === undefined) {
      problems.push(`${row.name} (${row.privs}) is not in the authenticated table contract`);
    } else if (row.privs !== expected) {
      problems.push(`${row.name} has '${row.privs}', expected '${expected}'`);
    }
    if (seenTables.has(row.name)) problems.push(`duplicate authenticated table grant ${row.name}`);
    seenTables.add(row.name);
  }
  for (const [name, privs] of Object.entries(AUTHENTICATED_TABLE_GRANTS)) {
    if (!seenTables.has(name))
      problems.push(`missing authenticated table grant ${name} (${privs})`);
  }

  for (const row of forbiddenRows) {
    if (row.role === '(unknown)' || row.name === '(unknown)' || row.privs === '') {
      problems.push('malformed forbidden table privilege fact');
    } else {
      problems.push(`${row.role} holds ${row.privs} on ${row.name}`);
    }
  }

  const seenSequences = new Set<string>();
  for (const row of sequenceRows) {
    const key = `${row.name}/${row.role}`;
    const expected = SEQUENCE_GRANTS[key];
    if (expected === undefined) {
      problems.push(`${key} (${row.privs}) is not in the sequence grant contract`);
    } else if (row.privs !== expected) {
      problems.push(`${key} has '${row.privs}', expected '${expected}'`);
    }
    if (seenSequences.has(key)) problems.push(`duplicate sequence grant ${key}`);
    seenSequences.add(key);
  }
  for (const [key, privs] of Object.entries(SEQUENCE_GRANTS)) {
    if (!seenSequences.has(key)) problems.push(`missing sequence grant ${key} (${privs})`);
  }

  for (const row of defaultRows) {
    if (row.objtype !== 'S' || row.grantor !== 'supabase_admin') {
      problems.push(`sequence defaults for ${row.role} restored by ${row.grantor}`);
    }
  }

  if (problems.length > 0) {
    return { ...base, status: 'fail', detail: problems.join('; ') };
  }

  return {
    ...base,
    status: 'ok',
    detail:
      `${tableRows.length} authenticated table grants, ${sequenceRows.length / 3} public sequences; ` +
      'no forbidden table privileges or sequence default drift',
  };
}
