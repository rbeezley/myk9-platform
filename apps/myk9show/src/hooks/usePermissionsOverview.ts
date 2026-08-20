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

/** Enough history to date every role without pulling the whole log. */
const AUDIT_FETCH_LIMIT = 200;

export interface PermissionsOverviewState {
  roles: Role[];
  permissions: Permission[] | null;
  auditEntries: AuditLogEntry[];
  lastChanged: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

export function usePermissionsOverview(): PermissionsOverviewState {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    // The audit rail is secondary: swallow its failure so a flaky log read
    // cannot blank the roles console beside it.
    const auditPromise = rbacService
      .getAuditLogs({ limit: AUDIT_FETCH_LIMIT })
      .catch(() => [] as AuditLogEntry[]);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const lastChanged = useMemo(() => buildLastChangedMap(auditEntries), [auditEntries]);

  return {
    roles,
    permissions,
    auditEntries,
    lastChanged,
    isLoading,
    error,
    reload: () => void load(),
  };
}
