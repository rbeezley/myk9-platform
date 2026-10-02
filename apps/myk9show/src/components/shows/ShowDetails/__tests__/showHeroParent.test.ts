import { describe, it, expect } from 'vitest';
import { showHeroParent } from '../showHeroParent';

describe('showHeroParent (MYK9-930)', () => {
  const show = { clubId: 'club-1', clubName: 'Bergen KC' };

  it('links the host club for a viewer who can open it', () => {
    expect(showHeroParent(show, { canOpenClub: true })).toEqual({
      label: 'Bergen KC',
      href: '/clubs/club-1',
    });
  });

  it('is plain text, with no href, for a viewer who cannot open the club page', () => {
    expect(showHeroParent(show, { canOpenClub: false })).toEqual({ label: 'Bergen KC' });
  });

  it('has no parent when the show has no named host club', () => {
    expect(
      showHeroParent({ clubId: 'club-1', clubName: '' }, { canOpenClub: true })
    ).toBeUndefined();
  });

  it('is plain text when the show has a club name but no club id to link', () => {
    expect(showHeroParent({ clubName: 'Bergen KC' }, { canOpenClub: true })).toEqual({
      label: 'Bergen KC',
    });
  });
});
