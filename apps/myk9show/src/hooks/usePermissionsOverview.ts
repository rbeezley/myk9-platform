/**
 * Single data source for the Roles & Permissions overview console.
 *
 * Roles and permissions are load-bearing (a failure sets `error`); the audit
 * feed is secondary and degrades to an empty rail so one failed read cannot
 * blank the page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rbacService } from '@/services/rbac/RBACService';
import { buildLastChangedMap } from '@/components/admin/permissions/rolesOverview';
import type { AuditLogEntry, Permission, Role } from '@/types/rbac-types';

/**
 * Cap on the audit-log read backing the audit rail and the roles table's
 * "Last changed" column. This is a limit on ALL audit actions, not just role
 * edits — getAuditLogs has no `target_type` filter — so a role's last edit
 * can age out of this window once enough non-role audit rows (e.g. user-role
 * grants) accumulate above it, silently reverting that role's "Last changed"
 * to "no recorded change". Known limitation, not fixed here.
 */
const AUDIT_FETCH_LIMIT = 200;

export interface PermissionsOverviewState {
  roles: Role[];
  permissions: Permission[] | null;
  auditEntries: AuditLogEntry[];
  /** True when the audit-log read failed and `auditEntries` is a swallowed-failure []. */
  auditFailed: boolean;
  lastChanged: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

export function usePermissionsOverview(): PermissionsOverviewState {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [auditFailed, setAuditFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setAuditFailed(false);
    // The audit rail is secondary: swallow its failure so a flaky log read
    // cannot blank the roles console beside it. Record that it failed so
    // downstream UI can say so instead of presenting the empty [] as fact.
    const auditPromise = rbacService.getAuditLogs({ limit: AUDIT_FETCH_LIMIT }).catch(() => {
      setAuditFailed(true);
      return [] as AuditLogEntry[];
    });
    try {
      const [allRoles, allPermissions, entries] = await Promise.all([
        rbacService.getAllRoles(),
        rbacService.getAllPermissions(),
        auditPromise,
      ]);
      setRoles(allRoles);
      setPermissions(allPermissions);
      setAuditEntries(entries);
      setError(null);
    } catch {
      setError("We couldn't load the access summary.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // This starts an external service read; state updates occur after the
    // promise settles.
    void load();
  }, [load]);

  const lastChanged = useMemo(() => buildLastChangedMap(auditEntries), [auditEntries]);

  return {
    roles,
    permissions,
    auditEntries,
    auditFailed,
    lastChanged,
    isLoading,
    error,
    reload: () => void load(),
  };
}
