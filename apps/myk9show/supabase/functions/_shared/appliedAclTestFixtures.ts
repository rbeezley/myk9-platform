import { AUTHENTICATED_TABLE_GRANTS, SERVICE_ROLE_TABLE_GRANTS } from './appliedAclChecks';

export const appliedAclFacts = (over: Record<string, unknown> = {}) => ({
  tables: Object.entries(AUTHENTICATED_TABLE_GRANTS).map(([name, privs]) => ({ name, privs })),
  service_role_tables: Object.entries(SERVICE_ROLE_TABLE_GRANTS).map(([name, privs]) => ({
    name,
    privs,
  })),
  // Annotated so a test can push a drift row in; a bare `[]` infers `never[]`.
  forbidden_tables: [] as Array<{ name: string; role: string; privs: string }>,
  sequences: [
    { name: 'registration_confirmation_seq', role: 'anon', privs: '' },
    { name: 'registration_confirmation_seq', role: 'authenticated', privs: 'SELECT,USAGE' },
    {
      name: 'registration_confirmation_seq',
      role: 'service_role',
      privs: 'SELECT,UPDATE,USAGE',
    },
    { name: 'frontend_logs_id_seq', role: 'anon', privs: '' },
    { name: 'frontend_logs_id_seq', role: 'authenticated', privs: '' },
    { name: 'frontend_logs_id_seq', role: 'service_role', privs: 'SELECT,UPDATE,USAGE' },
    { name: 'ringside_conflict_seq', role: 'anon', privs: '' },
    { name: 'ringside_conflict_seq', role: 'authenticated', privs: '' },
    { name: 'ringside_conflict_seq', role: 'service_role', privs: 'SELECT,UPDATE,USAGE' },
    { name: 'ringside_containment_audit_id_seq', role: 'anon', privs: '' },
    { name: 'ringside_containment_audit_id_seq', role: 'authenticated', privs: '' },
    { name: 'ringside_containment_audit_id_seq', role: 'service_role', privs: '' },
  ],
  defaults: [],
  ...over,
});
