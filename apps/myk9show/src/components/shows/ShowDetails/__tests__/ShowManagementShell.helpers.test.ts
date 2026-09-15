import { describe, it, expect, vi } from 'vitest';
import {
  saveShowEdit,
  PUBLISH_REQUIRES_ONLINE_MESSAGE,
  type ShowSaveCollaborators,
  type ShowSaveData,
} from '../ShowManagementShell.helpers';
import type { Show } from '@/types/show-types';

function makeCollaborators(overrides: Partial<ShowSaveCollaborators> = {}): ShowSaveCollaborators {
  return {
    isOnline: vi.fn().mockReturnValue(true),
    updateShowDirect: vi.fn().mockResolvedValue({
      show: { id: 'show-1' } as Show,
      replicationPayload: { replicatedShow: {}, serverVersion: 2 },
    }),
    applyServerRow: vi.fn().mockResolvedValue(undefined),
    updateShowLocally: vi.fn().mockResolvedValue({ id: 'show-1' } as Show),
    persistJudges: vi.fn().mockResolvedValue(undefined),
    maybePublishExperience: vi.fn().mockResolvedValue(undefined),
    onShowSaved: vi.fn(),
    notifySuccess: vi.fn(),
    ...overrides,
  };
}

describe('saveShowEdit', () => {
  describe('a draft->published transition', () => {
    it('performs ONE direct write with the full payload (incl. clubId + status), then applies the server row -- never updateShowLocally', async () => {
      const collaborators = makeCollaborators();
      const showData: ShowSaveData = {
        name: 'Renamed Show',
        clubId: 'club-2',
        status: 'published',
      };

      await saveShowEdit('show-1', 'draft', showData, collaborators);

      expect(collaborators.updateShowDirect).toHaveBeenCalledTimes(1);
      expect(collaborators.updateShowDirect).toHaveBeenCalledWith('show-1', showData);
      expect(collaborators.applyServerRow).toHaveBeenCalledTimes(1);
      expect(collaborators.applyServerRow).toHaveBeenCalledWith('show-1', {
        replicatedShow: {},
        serverVersion: 2,
      });
      expect(collaborators.onShowSaved).toHaveBeenCalledWith('show-1', { id: 'show-1' });
      expect(collaborators.updateShowLocally).not.toHaveBeenCalled();
      expect(collaborators.notifySuccess).toHaveBeenCalledWith('Show changes saved');
    });

    it('runs judge assignments and publish-experience content BEFORE the direct write commits', async () => {
      const order: string[] = [];
      const collaborators = makeCollaborators({
        persistJudges: vi.fn().mockImplementation(async () => {
          order.push('persistJudges');
        }),
        maybePublishExperience: vi.fn().mockImplementation(async () => {
          order.push('maybePublishExperience');
        }),
        updateShowDirect: vi.fn().mockImplementation(async () => {
          order.push('updateShowDirect');
          return { show: { id: 'show-1' } as Show, replicationPayload: {} };
        }),
      });

      await saveShowEdit('show-1', 'draft', { status: 'published' }, collaborators);

      expect(order).toEqual(['persistJudges', 'maybePublishExperience', 'updateShowDirect']);
    });

    it('refuses up front when offline, before any write', async () => {
      const collaborators = makeCollaborators({ isOnline: vi.fn().mockReturnValue(false) });

      await expect(
        saveShowEdit('show-1', 'draft', { status: 'published' }, collaborators)
      ).rejects.toThrow(PUBLISH_REQUIRES_ONLINE_MESSAGE);

      expect(collaborators.persistJudges).not.toHaveBeenCalled();
      expect(collaborators.maybePublishExperience).not.toHaveBeenCalled();
      expect(collaborators.updateShowDirect).not.toHaveBeenCalled();
      expect(collaborators.updateShowLocally).not.toHaveBeenCalled();
      expect(collaborators.notifySuccess).not.toHaveBeenCalled();
    });

    it('propagates a DB gate refusal (MK003) untouched -- code intact, no server-row apply, no success toast', async () => {
      const dbError = { code: 'MK003', message: 'Assign a club to this show before publishing.' };
      const collaborators = makeCollaborators({
        updateShowDirect: vi.fn().mockRejectedValue(dbError),
      });

      await expect(
        saveShowEdit('show-1', 'draft', { status: 'published' }, collaborators)
      ).rejects.toBe(dbError);

      expect(collaborators.applyServerRow).not.toHaveBeenCalled();
      expect(collaborators.onShowSaved).not.toHaveBeenCalled();
      expect(collaborators.notifySuccess).not.toHaveBeenCalled();
    });
  });

  describe('every other save', () => {
    it('is a no-op transition check for a draft staying a draft -- queues through updateShowLocally only', async () => {
      const collaborators = makeCollaborators();

      await saveShowEdit('show-1', 'draft', { name: 'Renamed' }, collaborators);

      expect(collaborators.updateShowLocally).toHaveBeenCalledTimes(1);
      expect(collaborators.updateShowLocally).toHaveBeenCalledWith('show-1', { name: 'Renamed' });
      expect(collaborators.updateShowDirect).not.toHaveBeenCalled();
      expect(collaborators.applyServerRow).not.toHaveBeenCalled();
      expect(collaborators.notifySuccess).toHaveBeenCalledWith('Show changes saved');
    });

    it('is a no-op transition check for an already-published show saving an unrelated edit', async () => {
      const collaborators = makeCollaborators();

      await saveShowEdit(
        'show-1',
        'published',
        { status: 'published', name: 'Renamed' },
        collaborators
      );

      expect(collaborators.updateShowLocally).toHaveBeenCalledTimes(1);
      expect(collaborators.updateShowDirect).not.toHaveBeenCalled();
    });

    it('does not check online status for a non-publish save', async () => {
      const collaborators = makeCollaborators({ isOnline: vi.fn().mockReturnValue(false) });

      await saveShowEdit('show-1', 'draft', { name: 'Renamed' }, collaborators);

      expect(collaborators.updateShowLocally).toHaveBeenCalledTimes(1);
    });

    it('throws when the local store has no row for the id, without notifying success', async () => {
      const collaborators = makeCollaborators({
        updateShowLocally: vi.fn().mockResolvedValue(null),
      });

      await expect(
        saveShowEdit('show-1', 'draft', { name: 'Renamed' }, collaborators)
      ).rejects.toThrow('Show was not available in the local store.');

      expect(collaborators.persistJudges).not.toHaveBeenCalled();
      expect(collaborators.notifySuccess).not.toHaveBeenCalled();
    });
  });
});
