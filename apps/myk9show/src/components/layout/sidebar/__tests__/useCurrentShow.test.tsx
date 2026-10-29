import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { showFactory } from '@/test/utils/factories';
import type { Show } from '@/types/show-types';
import { ScopeType } from '@/types/auth-types';
import { useCurrentShow } from '../useCurrentShow';
import { useCurrentShowPinStore } from '../currentShowPinStore';

const data = { shows: [] as Show[] };
const auth = { user: null as unknown, userWithRoles: null as unknown, isAdmin: false };

vi.mock('@/store/showStore', () => ({
  useShowStore: (select: (state: { shows: Show[] }) => unknown) => select({ shows: data.shows }),
}));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: (select: (state: { trials: unknown[] }) => unknown) => select({ trials: [] }),
}));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth }));

const secretaryOf = (clubId: string) => ({
  id: 'user-1',
  roles: ['secretary'],
  scopes: [{ scopeType: ScopeType.CLUB, scopeId: clubId, roleId: 'secretary' }],
});
const show = (overrides: Partial<Show>) =>
  showFactory.build({ status: 'published', entryWindowTimeZone: 'America/Chicago', ...overrides });

const mine = show({
  id: 'mine',
  name: 'Mine',
  clubId: 'club-mine',
  startDate: '2026-10-14',
  endDate: '2026-10-16',
});
const mineSoon = show({
  id: 'mine-soon',
  name: 'Mine Soon',
  clubId: 'club-mine',
  startDate: '2026-10-20',
  endDate: '2026-10-21',
});
const other = show({
  id: 'other',
  name: 'Other',
  clubId: 'club-x',
  startDate: '2026-10-15',
  endDate: '2026-10-15',
});

function renderCurrent(route = '/shows') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  );
  return renderHook(() => useCurrentShow(), { wrapper });
}

describe('useCurrentShow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T16:00:00Z'));
    data.shows = [other, mineSoon, mine];
    auth.user = { id: 'user-1' };
    auth.userWithRoles = secretaryOf('club-mine');
    auth.isAdmin = false;
    localStorage.clear();
    useCurrentShowPinStore.setState({ pinnedId: null });
  });

  it("is the first show of the Shows list's Managing section, never someone else's show", () => {
    const { result } = renderCurrent();
    expect(result.current.currentShow?.id).toBe('mine');
    expect(result.current.managingShows.map(s => s.id)).toEqual(['mine', 'mine-soon']);
  });

  it('is none for a site admin, who manages every show', () => {
    auth.isAdmin = true;
    expect(renderCurrent().result.current.currentShow).toBeNull();
  });

  it.each([
    ['signed out', null],
    ['a ringside passcode session', { id: 'anon-1', is_anonymous: true }],
  ])('reads no shows for %s, even when the store holds some', (_label, user) => {
    auth.user = user;
    const { result } = renderCurrent();
    expect(result.current.currentShow).toBeNull();
    expect(result.current.managingShows).toEqual([]);
  });

  it('is none for a viewer who manages no show', () => {
    auth.userWithRoles = secretaryOf('club-nobody');
    expect(renderCurrent().result.current.currentShow).toBeNull();
  });

  // MYK9-1490: the pin on a Home show card replaces the rail's Switch menu.
  it('follows a pin at once and remembers it on this device', () => {
    const { result } = renderCurrent();
    act(() => useCurrentShowPinStore.getState().pin('mine-soon'));
    expect(result.current.currentShow?.id).toBe('mine-soon');
    expect(result.current.pinnedShowId).toBe('mine-soon');
    expect(localStorage.getItem('myk9:current-show-choice')).toBe('mine-soon');
  });

  it('keeps the rail and the Home card in step: a pin from one shows in the other', () => {
    const rail = renderCurrent('/shows').result;
    const card = renderCurrent('/secretary/dashboard').result;

    act(() => useCurrentShowPinStore.getState().pin('mine-soon'));
    expect(rail.current.currentShow?.id).toBe('mine-soon');
    expect(card.current.pinnedShowId).toBe('mine-soon');

    act(() => useCurrentShowPinStore.getState().pin('mine'));
    expect(rail.current.currentShow?.id).toBe('mine');
    expect(card.current.pinnedShowId).toBe('mine');
  });

  it('unpinning returns to the automatic pick and forgets the pin', () => {
    const { result } = renderCurrent();
    act(() => useCurrentShowPinStore.getState().pin('mine-soon'));
    act(() => useCurrentShowPinStore.getState().unpin());
    expect(result.current.currentShow?.id).toBe('mine');
    expect(result.current.pinnedShowId).toBeNull();
    expect(localStorage.getItem('myk9:current-show-choice')).toBeNull();
  });

  it("drops an ended show's pin", () => {
    const ended = show({
      id: 'ended',
      name: 'Ended',
      clubId: 'club-mine',
      startDate: '2026-10-01',
      endDate: '2026-10-02',
    });
    data.shows = [ended, mineSoon, mine];
    act(() => useCurrentShowPinStore.getState().pin('ended'));
    const { result } = renderCurrent();
    expect(result.current.pinnedShowId).toBeNull();
    expect(result.current.currentShow?.id).toBe('mine');
  });

  it('follows a pin made in another tab (the storage event)', () => {
    const { result } = renderCurrent();
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'myk9:current-show-choice', newValue: 'mine-soon' })
      );
    });
    expect(result.current.currentShow?.id).toBe('mine-soon');
  });

  it('remembers a managed show opened, and not one the viewer does not manage', () => {
    renderCurrent('/shows/mine/results');
    expect(localStorage.getItem('myk9:current-show-last-opened')).toBe('mine');
    localStorage.clear();
    renderCurrent('/shows/mine');
    expect(localStorage.getItem('myk9:current-show-last-opened')).toBe('mine');
    localStorage.clear();
    renderCurrent('/shows/other');
    expect(localStorage.getItem('myk9:current-show-last-opened')).toBeNull();
  });

  it('falls back to the last managed show opened once every show is over', () => {
    data.shows = [
      show({
        id: 'done',
        name: 'Done',
        clubId: 'club-mine',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
      }),
    ];
    localStorage.setItem('myk9:current-show-last-opened', 'done');
    expect(renderCurrent().result.current.currentShow?.id).toBe('done');
  });
});
