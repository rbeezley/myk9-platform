import { AUTHENTICATED_TABLE_GRANTS } from './appliedAclChecks';

export const appliedAclFacts = (over: Record<string, unknown> = {}) => ({
  tables: Object.entries(AUTHENTICATED_TABLE_GRANTS).map(([name, privs]) => ({ name, privs })),
  forbidden_tables: [],
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
