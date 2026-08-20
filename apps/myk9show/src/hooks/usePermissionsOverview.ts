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
 * Cap on the audit-log read backing the "Recent access changes" rail. That
 * rail wants ALL recent access changes (role grants, permission edits, role
 * CRUD), so this read stays unfiltered.
 */
const AUDIT_FETCH_LIMIT = 200;

/**
 * Cap on the role-targeted audit-log read backing the roles table's "Last
 * changed" column. This query is filtered to `target_type: 'role'`, so it is
 * not competing with user-role grant events for slots in the window — a
 * role's last edit can only age out once 200 OTHER role events land above
 * it, not 200 audit events of any kind.
 */
const ROLE_AUDIT_FETCH_LIMIT = 200;

export interface PermissionsOverviewState {
  roles: Role[];
  permissions: Permission[] | null;
  /** Unfiltered recent audit entries, for the "Recent access changes" rail. */
  auditEntries: AuditLogEntry[];
  /**
   * True when the UNFILTERED audit-log read failed and `auditEntries` is a
   * swallowed-failure []. Only the "Recent access changes" rail depends on
   * this — it must not affect the roles table's "Last changed" column.
   */
  auditFailed: boolean;
  /**
   * True when the ROLE-TARGETED audit-log read failed and `lastChanged` is
   * built from a swallowed-failure []. Only the roles table's "Last changed"
   * column depends on this — it must not affect the "Recent access changes"
   * rail.
   */
  roleAuditFailed: boolean;
  lastChanged: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

export function usePermissionsOverview(): PermissionsOverviewState {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [roleAuditEntries, setRoleAuditEntries] = useState<AuditLogEntry[]>([]);
  const [auditFailed, setAuditFailed] = useState(false);
  const [roleAuditFailed, setRoleAuditFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setAuditFailed(false);
    setRoleAuditFailed(false);
    // The audit reads are secondary: swallow their failure so a flaky log
    // read cannot blank the roles console beside it. Record that it failed
    // so downstream UI can say so instead of presenting the empty [] as fact.
    // Each read's failure flag is tracked independently so a failure in one
    // query never gets reported against the other query's consumer.
    const auditPromise = rbacService.getAuditLogs({ limit: AUDIT_FETCH_LIMIT }).catch(() => {
      setAuditFailed(true);
      return [] as AuditLogEntry[];
    });
    const roleAuditPromise = rbacService
      .getAuditLogs({ limit: ROLE_AUDIT_FETCH_LIMIT, targetType: 'role' })
      .catch(() => {
        setRoleAuditFailed(true);
        return [] as AuditLogEntry[];
      });
    try {
      const [allRoles, allPermissions, entries, roleEntries] = await Promise.all([
        rbacService.getAllRoles(),
        rbacService.getAllPermissions(),
        auditPromise,
        roleAuditPromise,
      ]);
      setRoles(allRoles);
      setPermissions(allPermissions);
      setAuditEntries(entries);
      setRoleAuditEntries(roleEntries);
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

  const lastChanged = useMemo(() => buildLastChangedMap(roleAuditEntries), [roleAuditEntries]);

  return {
    roles,
    permissions,
    auditEntries,
    auditFailed,
    roleAuditFailed,
    lastChanged,
    isLoading,
    error,
    reload: () => void load(),
  };
}
