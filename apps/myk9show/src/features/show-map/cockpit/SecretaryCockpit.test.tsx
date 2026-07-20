import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from './SecretaryCockpit';
import type { SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  now: new Date('2026-07-20T14:00:00.000Z'),
  trials: [{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }],
  classes: [
    {
      id: 'class-1',
      trialId: 'trial-1',
      name: 'Container Novice',
      lifecycle: 'not-started',
      entryCount: 10,
      scoredCount: 0,
      actions: [],
      paperwork: [],
      attention: Array.from({ length: 5 }, (_, index) => ({
        id: `issue-${index + 1}`,
        kind: 'blocker' as const,
        label: `Issue ${index + 1}`,
        reason: `Resolve issue ${index + 1}`,
        destination: { kind: 'href' as const, href: `/issues/${index + 1}` },
      })),
    },
  ],
};

describe('SecretaryCockpit attention remainder', () => {
  it('expands every ranked issue instead of leaving the remainder unreachable', async () => {
    const { user } = render(
      <SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />,
      { initialRoute: '/shows/show-1/show-desk' }
    );

    expect(screen.getAllByRole('link', { name: 'Open' })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'View 2 more issues' }));
    expect(screen.getAllByRole('link', { name: 'Open' })).toHaveLength(5);
  });
});
