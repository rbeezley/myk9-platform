import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { heroParentLink, heroViewerFromUser, type HeroParentTarget } from '../heroParentLink';
import { ClassCompactHeader } from '@/components/classes/ClassCompactHeader';
import { showHeroParent } from '@/components/shows/ShowDetails/showHeroParent';
import type { ClassData } from '@/components/classes/types/classTypes';
import type { Trial } from '@/components/trials/types/trial.types';

/**
 * MYK9-930: a hero parent is a link only when the viewer can open the target. The rule
 * mirrors the target route's real guard in routes/publicRoutes.tsx:
 *   /shows/:id    public
 *   /trials/:id   <ProtectedRoute accountOnly>  (a signed-in account, not a passcode session)
 *   /clubs/:id    public route, but its page reads the club through the account replica
 *                 for accounts and the public directory for guests, so we link accounts only
 */
type Viewer = 'signed-out guest' | 'ringside passcode' | 'exhibitor' | 'secretary';

const USERS: Record<Viewer, Parameters<typeof heroViewerFromUser>[0]> = {
  'signed-out guest': null,
  'ringside passcode': { is_anonymous: true },
  exhibitor: { is_anonymous: false },
  secretary: {},
};

const HREF: Record<HeroParentTarget, string> = {
  club: '/clubs/x-1',
  show: '/shows/x-1',
  trial: '/trials/x-1',
};

// target -> which viewers get an href
const LINKED: Record<HeroParentTarget, Record<Viewer, boolean>> = {
  show: {
    'signed-out guest': true,
    'ringside passcode': true,
    exhibitor: true,
    secretary: true,
  },
  trial: {
    'signed-out guest': false,
    'ringside passcode': false,
    exhibitor: true,
    secretary: true,
  },
  club: {
    'signed-out guest': false,
    'ringside passcode': false,
    exhibitor: true,
    secretary: true,
  },
};

describe('heroParentLink (MYK9-930)', () => {
  for (const target of Object.keys(LINKED) as HeroParentTarget[]) {
    for (const viewer of Object.keys(USERS) as Viewer[]) {
      const linked = LINKED[target][viewer];
      it(`${target} parent for a ${viewer}: ${linked ? 'link' : 'plain text'}`, () => {
        const parent = heroParentLink({
          target,
          id: 'x-1',
          label: 'Parent',
          viewer: heroViewerFromUser(USERS[viewer]),
        });
        expect(parent.label).toBe('Parent');
        expect(parent.href).toBe(linked ? HREF[target] : undefined);
      });
    }
  }
});

describe('every hero parent follows the helper (MYK9-930)', () => {
  const classData = {
    id: 'cls-1',
    trialId: 'trial-1',
    trial: 'T',
    trialDate: '2026-03-21',
    trialNumber: '1',
    classOrder: '1',
    status: 'Scheduled',
    judge: 'Jane',
    element: 'Container',
    level: 'Novice',
  } as ClassData;
  const trial = {
    id: 'trial-1',
    showId: 'show-1',
    trialNumber: 'Saturday Trial 1',
  } as unknown as Trial;

  it.each(['signed-out guest', 'ringside passcode'] as const)(
    'class -> trial parent is plain text for a %s (the trial route is accountOnly)',
    viewer => {
      render(
        <ClassCompactHeader
          parentShow={undefined}
          classData={classData}
          parentTrial={trial}
          viewer={heroViewerFromUser(USERS[viewer])}
        />
      );
      expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Saturday Trial 1' })).not.toBeInTheDocument();
    }
  );

  it.each(['exhibitor', 'secretary'] as const)(
    'class -> trial parent links to /trials/:id for a %s',
    viewer => {
      render(
        <ClassCompactHeader
          parentShow={undefined}
          classData={classData}
          parentTrial={trial}
          viewer={heroViewerFromUser(USERS[viewer])}
        />
      );
      expect(screen.getByRole('link', { name: 'Saturday Trial 1' })).toHaveAttribute(
        'href',
        '/trials/trial-1'
      );
    }
  );

  it('show -> club goes through the same helper', () => {
    const show = { clubId: 'c-1', clubName: 'Bergen KC' };
    expect(showHeroParent(show, { viewer: 'public' })).toEqual({ label: 'Bergen KC' });
    expect(showHeroParent(show, { viewer: 'account' })).toEqual({
      label: 'Bergen KC',
      href: '/clubs/c-1',
    });
  });
});
