import type { SupportTicket } from '@/features/support/supportTickets';

export interface SupportInvestigationAction {
  id: string;
  label: string;
  description: string;
  href: string;
}

export interface SupportNextCheck {
  id: string;
  label: string;
  href: string;
}

export interface SupportInvestigationModel {
  actions: SupportInvestigationAction[];
  nextChecks: SupportNextCheck[];
  escalationText: string;
}

function encodeId(id: string): string {
  return encodeURIComponent(id);
}

function addUnique<T extends { id: string }>(items: T[], item: T): void {
  if (!items.some(existing => existing.id === item.id)) {
    items.push(item);
  }
}

function isSafeInternalRoute(route: string | null): route is string {
  if (!route) return false;
  return route.startsWith('/') && !route.startsWith('//') && !route.includes('javascript:');
}

function hasSyncIssue(ticket: SupportTicket): boolean {
  const replication = ticket.diagnostics.connectivity.replication;
  return (
    ticket.diagnostics.connectivity.online === false ||
    Boolean(
      replication.status && replication.status !== 'idle' && replication.status !== 'synced'
    ) ||
    (replication.queueSize ?? 0) > 0 ||
    (replication.conflictCount ?? 0) > 0 ||
    (replication.errorCount ?? 0) > 0
  );
}

function hasAccessClue(ticket: SupportTicket): boolean {
  const role = ticket.diagnostics.user.role?.toLowerCase() ?? '';
  const searchable = [
    ticket.subject,
    ticket.diagnostics.route ?? '',
    role,
    ...ticket.diagnostics.clientErrors.map(error => `${error.message} ${error.source ?? ''}`),
  ]
    .join(' ')
    .toLowerCase();

  return (
    Boolean(ticket.diagnostics.user.authUserId || ticket.diagnostics.user.databaseUserId) &&
    /access|permission|role|unauthorized|forbidden|rbac/.test(searchable)
  );
}

function hasRecoveryClue(ticket: SupportTicket): boolean {
  const searchable = [
    ticket.subject,
    ticket.diagnostics.route ?? '',
    ...ticket.diagnostics.clientErrors.map(error => `${error.message} ${error.source ?? ''}`),
  ]
    .join(' ')
    .toLowerCase();
  return /deleted|missing|not found|restore|recovery/.test(searchable);
}

export function buildSupportInvestigationModel(ticket: SupportTicket): SupportInvestigationModel {
  const actions: SupportInvestigationAction[] = [];
  const nextChecks: SupportNextCheck[] = [];
  const diagnostics = ticket.diagnostics;
  const showId = diagnostics.context.showId ?? ticket.showId;
  const trialId = diagnostics.context.trialId;
  const entryId = diagnostics.context.entryId;
  const userId = diagnostics.user.databaseUserId ?? diagnostics.user.authUserId;

  if (isSafeInternalRoute(diagnostics.route)) {
    addUnique(actions, {
      id: 'reported-route',
      label: 'Open reported page',
      description: diagnostics.route,
      href: diagnostics.route,
    });
    addUnique(nextChecks, {
      id: 'reported-route',
      label: 'Open reported route',
      href: diagnostics.route,
    });
    addUnique(nextChecks, { id: 'health', label: 'Check system health', href: '/admin/health' });
  }

  if (showId) {
    addUnique(actions, {
      id: 'show-workbench',
      label: 'Open show desk',
      description: showId,
      href: `/shows/${encodeId(showId)}/show-desk`,
    });
  }

  if (showId && trialId) {
    addUnique(actions, {
      id: 'trial-detail',
      label: 'Open trial',
      description: trialId,
      href: `/shows/${encodeId(showId)}/trials/${encodeId(trialId)}`,
    });
  }

  if (showId && entryId) {
    addUnique(actions, {
      id: 'entry-management',
      label: 'Open entries',
      description: entryId,
      href: `/shows/${encodeId(showId)}/entry-management`,
    });
  }

  if (hasSyncIssue(ticket)) {
    addUnique(actions, {
      id: 'sync-monitoring',
      label: 'Open sync monitoring',
      description: 'Review device queues, conflicts, and sync errors.',
      href: '/admin/sync',
    });
    addUnique(nextChecks, { id: 'sync', label: 'Review sync monitoring', href: '/admin/sync' });
    addUnique(nextChecks, { id: 'health', label: 'Check system health', href: '/admin/health' });
  }

  if (hasAccessClue(ticket) || userId) {
    addUnique(actions, {
      id: 'user-roles',
      label: 'Open user access',
      description: userId ?? 'Review user-role assignments.',
      href: userId
        ? `/admin/permissions/users?userId=${encodeId(userId)}`
        : '/admin/permissions/users',
    });
    addUnique(nextChecks, {
      id: 'permissions-users',
      label: 'Review user roles',
      href: '/admin/permissions/users',
    });
  }

  if (hasRecoveryClue(ticket)) {
    addUnique(actions, {
      id: 'deleted-items',
      label: 'Open deleted items',
      description: 'Check whether missing data can be restored.',
      href: '/admin/deleted-items',
    });
    if (showId) {
      addUnique(nextChecks, {
        id: 'show-workbench',
        label: 'Review the show',
        href: `/shows/${encodeId(showId)}/show-desk`,
      });
    }
    addUnique(nextChecks, {
      id: 'deleted-items',
      label: 'Check Deleted Items',
      href: '/admin/deleted-items',
    });
  }

  if (actions.length === 0) {
    addUnique(nextChecks, {
      id: 'copy-ticket',
      label: 'Copy ticket link',
      href: `/admin/support?ticketId=${encodeId(ticket.id)}`,
    });
  }

  return {
    actions,
    nextChecks,
    escalationText: buildSupportEscalationText(ticket),
  };
}

export function buildSupportEscalationText(ticket: SupportTicket): string {
  return JSON.stringify(
    {
      ticketId: ticket.id,
      ownerId: ticket.ownerId,
      status: ticket.status,
      showDayPriority: ticket.isShowDayPriority,
      showId: ticket.showId,
      diagnostics: ticket.diagnostics,
    },
    null,
    2
  );
}
