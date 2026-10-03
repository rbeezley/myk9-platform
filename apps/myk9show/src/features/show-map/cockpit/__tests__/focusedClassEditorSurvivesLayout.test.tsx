import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from '../SecretaryCockpit';
import type { SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

const viewport = vi.hoisted(() => ({ split: false }));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => viewport.split,
}));
vi.mock('@/components/shows/tabs/setupClassSnapshot', () => ({
  resolveSetupClass: vi.fn(async (id: string) => ({ id, judgeId: null })),
}));
vi.mock('@/components/shows/tabs/SetupClassDialogs', () => ({
  SetupClassDialogs: ({ pending }: { pending: { action: string } }) => (
    <div data-testid="class-editor">{pending.action}</div>
  ),
}));

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  trials: [{ id: 'trial-1', date: '2026-07-20', number: 'Trial 1', order: 0 }],
  classes: [
    {
      id: 'class-1',
      trialId: 'trial-1',
      name: 'Container Novice',
      classOrder: 0,
      lifecycle: 'not-started',
      entryCount: 4,
      scoredCount: 0,
      actions: [],
      attention: [],
      paperwork: [],
      entryRows: [],
    },
  ],
};

// Codex review of #2691: the focused panel moves between the inline and split
// layouts at 1280px, which remounts it. An editor owned by the panel closed and
// lost its edits on a tablet rotation; the cockpit owns it now.
describe('the class editor survives the 1280px layout switch', () => {
  it('stays open when the viewport crosses the breakpoint', async () => {
    const { user, rerender } = render(
      <SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />,
      { initialRoute: '/shows/show-1' }
    );

    await user.click(screen.getByRole('button', { name: 'Edit class Container Novice' }));
    expect(await screen.findByTestId('class-editor')).toHaveTextContent('edit');

    viewport.split = true;
    rerender(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />);

    expect(screen.getByTestId('class-editor')).toHaveTextContent('edit');
    viewport.split = false;
  });
});
