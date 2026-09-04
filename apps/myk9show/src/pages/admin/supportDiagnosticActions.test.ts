import { describe, expect, it } from 'vitest';
import { buildSupportInvestigationModel } from './supportDiagnosticActions';
import type { SupportTicket } from '@/features/support/supportTickets';

function ticket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: 'ticket-1',
    ownerId: 'owner-1',
    subject: 'Can not access the show',
    status: 'open',
    isShowDayPriority: false,
    showId: 'show-1',
    createdAt: '2026-07-06T12:00:00.000Z',
    updatedAt: '2026-07-06T12:00:00.000Z',
    diagnostics: {
      user: { authUserId: 'auth-1', databaseUserId: 'db-1', role: 'secretary' },
      route: '/shows/show-1/show-desk',
      context: { showId: 'show-1', trialId: 'trial-1', entryId: 'entry-1' },
      app: { version: '1.0.0', capturedAt: '2026-07-06T12:00:00.000Z' },
      connectivity: {
        online: true,
        replication: {
          status: 'synced',
          lastSyncAt: null,
          queueSize: 0,
          conflictCount: 0,
          errorCount: 0,
          watermark: null,
        },
      },
      clientErrors: [],
    },
    ...overrides,
  };
}

describe('buildSupportInvestigationModel', () => {
  it('maps recognized route and entity diagnostics to existing surfaces', () => {
    const model = buildSupportInvestigationModel(ticket());

    expect(model.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'reported-route', href: '/shows/show-1/show-desk' }),
        expect.objectContaining({ id: 'show-workbench', href: '/shows/show-1/show-desk' }),
        expect.objectContaining({ id: 'trial-detail', href: '/shows/show-1/trials/trial-1' }),
        expect.objectContaining({ id: 'entry-management', href: '/shows/show-1/entry-management' }),
        expect.objectContaining({
          id: 'user-roles',
          href: '/admin/users?userId=db-1',
        }),
      ])
    );
    expect(model.nextChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'permissions-users',
          href: '/admin/users?userId=db-1',
        }),
      ])
    );
  });

  it('routes sync issues to sync monitoring and health next checks', () => {
    const model = buildSupportInvestigationModel(
      ticket({
        diagnostics: {
          ...ticket().diagnostics,
          connectivity: {
            online: false,
            replication: {
              status: 'stalled',
              lastSyncAt: null,
              queueSize: 2,
              conflictCount: 1,
              errorCount: 1,
              watermark: null,
            },
          },
        },
      })
    );

    expect(model.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'system-health', href: '/admin/health' }),
      ])
    );
    expect(model.nextChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'health', href: '/admin/health' }),
        expect.objectContaining({ id: 'health', href: '/admin/health' }),
      ])
    );
  });

  it('routes deleted or missing data clues to deleted items', () => {
    const model = buildSupportInvestigationModel(
      ticket({
        subject: 'Entry is missing after delete',
        diagnostics: {
          ...ticket().diagnostics,
          clientErrors: [
            {
              message: 'entry not found',
              source: 'entry-load',
              timestamp: '2026-07-06T12:00:00.000Z',
            },
          ],
        },
      })
    );

    expect(model.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'deleted-items', href: '/admin/deleted-items' }),
      ])
    );
  });

  it('does not invent a link for unsafe reported routes', () => {
    const model = buildSupportInvestigationModel(
      ticket({
        diagnostics: {
          ...ticket().diagnostics,
          route: 'javascript:alert(1)',
          context: { showId: null, trialId: null, entryId: null },
          user: { authUserId: null, databaseUserId: null, role: null },
        },
        showId: null,
        subject: 'Question',
      })
    );

    expect(model.actions.some(action => action.id === 'reported-route')).toBe(false);
    expect(model.escalationText).toContain('"ticketId": "ticket-1"');
  });
});
