/**
 * MYK9-998 (Codex round 2 on #2735): what reaches the class UPDATE layer from a real Edit class
 * save. The snapshot the editor opened with is stale by the time Save is pressed, so an unrelated
 * edit must send neither `allow_waitlist` nor `max_entries`; otherwise another secretary's change
 * to the wait list is silently reverted. Real panel, real save hook, real mapper; only the
 * database call at the bottom is replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { SetupClassDialogs } from '../SetupClassDialogs';

const dbUpdateClass = vi.hoisted(() => vi.fn());
// MYK9-1019: the show's "Allow wait lists", which a class with no setting of its own follows.
const showState = vi.hoisted(() => ({
  shows: [] as Array<{ id: string; allowsWaitlist?: boolean }>,
}));

vi.mock('@/services/database/classes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/classes')>()),
  updateClass: dbUpdateClass,
}));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));
vi.mock('@/services/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication')>()),
  replicatedClassesTable: { sync: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/store/showStore', () => ({ useShowStore: () => showState }));
vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ people: [] }) }));

const snapshot = {
  id: 'c1',
  trialId: 't1',
  element: 'Containers',
  level: 'Novice',
  section: 'A',
  judgeId: 'j1',
  judge: 'J',
  status: 'Scheduled',
  classOrder: '1',
  maxEntries: 12,
  allowsWaitlist: false,
};

function renderDialogs(classSnapshot: Record<string, unknown> = snapshot) {
  return render(
    <SetupClassDialogs
      showId="s1"
      pending={{
        action: 'edit',
        trialId: 't1',
        requestId: 1,
        classSnapshot: classSnapshot as never,
      }}
      onClose={vi.fn()}
    />
  );
}

async function completeStatus(user: ReturnType<typeof renderDialogs>['user']) {
  await user.click(await screen.findByRole('combobox', { name: /status/i }));
  await user.click(await screen.findByRole('option', { name: 'Completed' }));
}

describe('Edit class payload at the update layer', () => {
  beforeEach(() => {
    dbUpdateClass.mockReset();
    dbUpdateClass.mockResolvedValue({ data: { id: 'c1', trial_id: 't1' }, error: null });
    showState.shows = [];
  });

  describe('a class that follows the show (MYK9-1019)', () => {
    it('shows the inherited state, and flipping it saves this class as an exception', async () => {
      showState.shows = [{ id: 's1', allowsWaitlist: true }];
      const { user } = renderDialogs({ ...snapshot, allowsWaitlist: null });
      const toggle = await screen.findByRole('switch', { name: 'Allow wait list' });
      expect(toggle).toBeChecked();
      expect(toggle).toHaveAccessibleDescription(/Follows show: On/);
      expect(screen.queryByRole('button', { name: 'Use the show setting' })).toBeNull();

      await user.click(toggle);
      expect(toggle).toHaveAccessibleDescription(
        /Set for this class only\. The show is set to On\./
      );
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => expect(dbUpdateClass).toHaveBeenCalled());
      expect(dbUpdateClass.mock.calls[0]![1]).toMatchObject({ allow_waitlist: false });
    });

    it('"Use the show setting" clears the exception: the save sends allow_waitlist null', async () => {
      showState.shows = [{ id: 's1', allowsWaitlist: true }];
      const { user } = renderDialogs({ ...snapshot, allowsWaitlist: false });
      const toggle = await screen.findByRole('switch', { name: 'Allow wait list' });
      expect(toggle).not.toBeChecked();
      expect(toggle).toHaveAccessibleDescription(/Set for this class only/);

      // INTENT § Accessibility First: the link keeps Button's 44px height (h-11), not a
      // text-height override (Codex round 2 on #2778). jsdom has no layout: token check only.
      const useShow = screen.getByRole('button', { name: 'Use the show setting' });
      expect(useShow.className.split(/\s+/)).toContain('h-11');
      expect(useShow.className.split(/\s+/)).not.toContain('h-auto');
      const switchLabel = document.querySelector('label[for="allowsWaitlist"]');
      expect(switchLabel?.className.split(/\s+/)).toContain('min-h-11');
      await user.click(useShow);
      expect(toggle).toBeChecked();
      expect(toggle).toHaveAccessibleDescription(/Follows show: On/);
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => expect(dbUpdateClass).toHaveBeenCalled());
      const payload = dbUpdateClass.mock.calls[0]![1] as Record<string, unknown>;
      expect(payload).toHaveProperty('allow_waitlist', null);
      expect(payload).not.toHaveProperty('max_entries');
    });
  });

  it('an unrelated edit sends no allow_waitlist and no max_entries', async () => {
    const { user } = renderDialogs();
    await completeStatus(user);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(dbUpdateClass).toHaveBeenCalled());
    const [id, payload] = dbUpdateClass.mock.calls[0]!;
    expect(id).toBe('c1');
    expect(payload).toHaveProperty('status');
    expect(payload).not.toHaveProperty('allow_waitlist');
    expect(payload).not.toHaveProperty('max_entries');
  });

  it('turning the wait list on sends allow_waitlist and nothing else about capacity', async () => {
    const { user } = renderDialogs();
    await user.click(await screen.findByRole('switch', { name: 'Allow wait list' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(dbUpdateClass).toHaveBeenCalled());
    const payload = dbUpdateClass.mock.calls[0]![1];
    expect(payload).toMatchObject({ allow_waitlist: true });
    expect(payload).not.toHaveProperty('max_entries');
  });
});
