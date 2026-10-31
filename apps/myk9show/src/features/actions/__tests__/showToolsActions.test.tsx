import type { ReactNode } from 'react';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderActions } from '@/components/layout/HeaderActions';
import { groupActions } from '@/features/actions/actionGroups';
import {
  ACTION_GROUP_ORDER,
  resolveActions,
  type ActionViewer,
} from '@/features/actions/actionRegistry';
import type { ShowToolItem } from '@/features/actions/showToolActions';
import { SHOW_DESK_TOOL_GROUPS } from '@/features/actions/showToolActions';
import { useCurrentActions } from '@/features/actions/useCurrentActions';
import {
  usePageEditTargetStore,
  useShowDeskToolsRegistration,
} from '@/features/actions/pageEditTarget';
import type { ShowManageScopeStatus } from '@/hooks/useShowManageScope';

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';

const scope = vi.hoisted(() => ({
  status: 'resolved' as ShowManageScopeStatus,
  canManage: true,
  canOperate: true,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => true, hasPermission: () => true, rbacLoading: false }),
}));
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({
    status: scope.status,
    canManage: scope.canManage,
    canOperate: scope.canOperate,
    hasOperationalStaffRole: true,
    clubId: 'club-1',
  }),
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })),
  },
}));

const TOOLS: ShowToolItem[] = [
  { id: 'people-at-show', group: 'show-day', title: 'People at show' },
  { id: 'access-codes', group: 'show-day', title: 'Access codes' },
  {
    id: 'volunteers',
    group: 'show-logistics',
    title: 'Volunteers',
    href: `/secretary/volunteers?showId=${SHOW_ID}`,
  },
  {
    id: 'incident-log',
    group: 'show-logistics',
    title: 'Incident log',
    attentionLabel: '2 urgent',
  },
];
const IDLE = { count: 0, tone: 'routine', incomplete: false } as const;

const viewer: ActionViewer = {
  canManageShow: true,
  canOperateShow: true,
  canCreateShows: false,
  canCreateDogs: false,
  canCreatePeople: false,
  canCreateClubs: false,
  showTools: TOOLS,
};
const route = { kind: 'show', showId: SHOW_ID, shellMounted: true } as const;

function wrapperAt(entry: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

const wrapper = wrapperAt(`/shows/${SHOW_ID}?trial=t1`);

beforeEach(() => {
  usePageEditTargetStore.setState({
    target: null,
    owner: null,
    showTools: null,
    showToolsOwner: null,
    exports: [],
  });
  scope.status = 'resolved';
  scope.canManage = true;
  scope.canOperate = true;
});

describe('show tool groups', () => {
  it('places Entry lists, Show day and Show logistics between the show and list sections', () => {
    expect(ACTION_GROUP_ORDER).toEqual([
      'page',
      'show',
      'entry-lists',
      'show-day',
      'show-logistics',
      'list',
      'create',
    ]);
    // Every tool group is a real menu section, in the registry's order.
    expect(SHOW_DESK_TOOL_GROUPS.map(group => group.id)).toEqual(['show-day', 'show-logistics']);
    expect(SHOW_DESK_TOOL_GROUPS.map(group => group.label)).toEqual(['Show day', 'Show logistics']);
  });
});

describe('resolveActions with registered show tools', () => {
  it('offers each tool as a ?tool= link in its section, with its attention label as the badge', () => {
    const tools = resolveActions(route, viewer).filter(a => a.group.startsWith('show-'));
    expect(tools.map(a => [a.id, a.group, a.href, a.badge])).toEqual([
      ['show-tool-people-at-show', 'show-day', '?tool=people-at-show', undefined],
      ['show-tool-access-codes', 'show-day', '?tool=access-codes', undefined],
      [
        'show-tool-volunteers',
        'show-logistics',
        `/secretary/volunteers?showId=${SHOW_ID}`,
        undefined,
      ],
      ['show-tool-incident-log', 'show-logistics', '?tool=incident-log', '2 urgent'],
    ]);
  });

  it('greys a tool the viewer cannot use, with its reason', () => {
    const actions = resolveActions(route, {
      ...viewer,
      showTools: [{ ...TOOLS[2]!, disabledReason: 'Trial secretary access only' }],
    });
    expect(actions.find(a => a.id === 'show-tool-volunteers')?.disabledReason).toBe(
      'Trial secretary access only'
    );
  });

  it('offers nothing to a viewer who cannot manage the show, or off a show route', () => {
    const ids = (actions: { group: string }[]) =>
      actions.filter(a => a.group.startsWith('show-')).length;
    expect(ids(resolveActions(route, { ...viewer, canManageShow: false }))).toBe(0);
    expect(ids(resolveActions({ kind: 'global' }, viewer))).toBe(0);
  });

  it('groups the rows under their own headings', () => {
    const groups = groupActions(resolveActions(route, viewer), {
      page: 'p',
      show: 's',
      'entry-lists': 'Entry lists',
      'show-day': 'Show day',
      'show-logistics': 'Show logistics',
      list: 'l',
      create: 'c',
    });
    expect(groups.map(group => group.heading)).toEqual(['s', 'Show day', 'Show logistics']);
  });
});

describe('useShowDeskToolsRegistration', () => {
  it('registers the tools and the page-computed attention while mounted', () => {
    const attention = { count: 3, tone: 'urgent', incomplete: true } as const;
    const { unmount } = renderHook(() =>
      useShowDeskToolsRegistration(TOOLS, attention, true, SHOW_ID)
    );
    const registered = usePageEditTargetStore.getState().showTools;
    expect(registered?.attention).toEqual(attention);
    expect(registered?.tools.map(tool => tool.id)).toEqual(TOOLS.map(tool => tool.id));
    expect(registered?.tools[3]).toEqual({
      id: 'incident-log',
      group: 'show-logistics',
      title: 'Incident log',
      attentionLabel: '2 urgent',
    });
    unmount();
    expect(usePageEditTargetStore.getState().showTools).toBeNull();
  });

  it('registers nothing until the viewer is resolved and manages the show', () => {
    const { rerender } = renderHook(
      ({ enabled }) => useShowDeskToolsRegistration(TOOLS, IDLE, enabled, SHOW_ID),
      { initialProps: { enabled: false } }
    );
    expect(usePageEditTargetStore.getState().showTools).toBeNull();
    rerender({ enabled: true });
    expect(usePageEditTargetStore.getState().showTools).not.toBeNull();
  });

  it('does not let a stale cleanup wipe a newer registration', () => {
    const first = renderHook(() => useShowDeskToolsRegistration(TOOLS, IDLE, true, SHOW_ID));
    const second = renderHook(() =>
      useShowDeskToolsRegistration(TOOLS.slice(0, 1), { ...IDLE, count: 1 }, true, SHOW_ID)
    );
    first.unmount();
    expect(usePageEditTargetStore.getState().showTools?.tools).toHaveLength(1);
    second.unmount();
    expect(usePageEditTargetStore.getState().showTools).toBeNull();
  });

  it('keeps the registration across re-renders that change only tool content', () => {
    const { rerender } = renderHook(
      ({ tools }) => useShowDeskToolsRegistration(tools, IDLE, true, SHOW_ID),
      { initialProps: { tools: TOOLS.map(tool => ({ ...tool })) } }
    );
    const before = usePageEditTargetStore.getState().showTools;
    rerender({ tools: TOOLS.map(tool => ({ ...tool })) });
    expect(usePageEditTargetStore.getState().showTools).toBe(before);
  });
});

describe('useCurrentActions with registered show tools', () => {
  it('merges the ?tool= links into the current params and headed sections', () => {
    act(() => {
      usePageEditTargetStore
        .getState()
        .registerShowTools(Symbol('t'), { showId: SHOW_ID, tools: TOOLS, attention: IDLE });
    });
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    const row = result.current.actions.find(a => a.id === 'show-tool-access-codes');
    expect(row?.href).toBe('?trial=t1&tool=access-codes');
    expect(result.current.groups.map(g => g.heading)).toEqual(
      expect.arrayContaining(['Show day', 'Show logistics'])
    );
    expect(result.current.showToolsAttention).toEqual(IDLE);
  });

  it('hides rows and attention for a viewer who does not manage the show', () => {
    scope.canManage = false;
    act(() => {
      usePageEditTargetStore
        .getState()
        .registerShowTools(Symbol('t'), { showId: SHOW_ID, tools: TOOLS, attention: IDLE });
    });
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(result.current.actions.some(a => a.id.startsWith('show-tool-'))).toBe(false);
    expect(result.current.showToolsAttention).toBeNull();
  });

  it('ignores a registration for another show', () => {
    act(() => {
      usePageEditTargetStore.getState().registerShowTools(Symbol('t'), {
        showId: 'some-other-show',
        tools: TOOLS,
        attention: { count: 4, tone: 'urgent', incomplete: false },
      });
    });
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(result.current.actions.some(a => a.id.startsWith('show-tool-'))).toBe(false);
    expect(result.current.showToolsAttention).toBeNull();
  });

  it('drops the rows when the show page unmounts', () => {
    const page = renderHook(() => useShowDeskToolsRegistration(TOOLS, IDLE, true, SHOW_ID));
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(result.current.actions.some(a => a.id === 'show-tool-volunteers')).toBe(true);
    page.unmount();
    expect(result.current.actions.some(a => a.id.startsWith('show-tool-'))).toBe(false);
  });
});

describe('HeaderActions trigger badge', () => {
  function register(attention: { count: number; tone: 'urgent' | 'routine'; incomplete: boolean }) {
    act(() => {
      usePageEditTargetStore
        .getState()
        .registerShowTools(Symbol('t'), { showId: SHOW_ID, tools: TOOLS, attention });
    });
    render(<HeaderActions />, { wrapper });
  }

  it('shows an urgent count with screen-reader text', () => {
    register({ count: 2, tone: 'urgent', incomplete: false });
    const badge = screen.getByTestId('header-actions-badge');
    expect(badge).toHaveAttribute('data-tone', 'urgent');
    expect(badge).toHaveTextContent('2 items need attention');
  });

  it('shows a routine count as a floor when a source is unreadable', () => {
    register({ count: 1, tone: 'routine', incomplete: true });
    const badge = screen.getByTestId('header-actions-badge');
    expect(badge).toHaveAttribute('data-tone', 'routine');
    expect(badge).toHaveTextContent('1 item needs attention, and some could not be checked');
  });

  it('says it cannot check, rather than reading as idle', () => {
    register({ count: 0, tone: 'routine', incomplete: true });
    const badge = screen.getByTestId('header-actions-badge');
    expect(badge).toHaveAttribute('data-tone', 'unknown');
    expect(badge).toHaveTextContent('?');
    expect(badge).toHaveTextContent(/cannot check/i);
  });

  it('shows no badge when nothing is waiting', () => {
    register(IDLE);
    expect(screen.queryByTestId('header-actions-badge')).not.toBeInTheDocument();
  });

  it('lists the tool rows as links with their attention badge', async () => {
    register(IDLE);
    await userEvent.click(screen.getByTestId('header-actions-trigger'));
    const row = await screen.findByTestId('header-action-show-tool-incident-log');
    expect(row).toHaveAttribute('href', `/shows/${SHOW_ID}?trial=t1&tool=incident-log`);
    expect(row).toHaveTextContent('2 urgent');
    expect(screen.getByTestId('header-action-show-tool-volunteers')).toHaveAttribute(
      'href',
      `/secretary/volunteers?showId=${SHOW_ID}`
    );
  });

  it('lists the Entry lists group under its own heading, each row badged when it has a count (MYK9-1594)', async () => {
    const lists: ShowToolItem[] = [
      {
        id: 'entry-list-pulls',
        group: 'entry-lists',
        title: 'Pulls',
        href: `/shows/${SHOW_ID}/entries?tab=exceptions&exception=pulls`,
        attentionLabel: '1',
      },
      {
        id: 'entry-list-waitlist',
        group: 'entry-lists',
        title: 'Waitlist',
        href: `/shows/${SHOW_ID}/entries?tab=exceptions&exception=waitlist`,
      },
    ];
    act(() => {
      usePageEditTargetStore.getState().registerShowTools(Symbol('t'), {
        showId: SHOW_ID,
        tools: lists,
        attention: { count: 1, tone: 'routine', incomplete: false },
      });
    });
    render(<HeaderActions />, { wrapper });

    expect(screen.getByTestId('header-actions-badge')).toHaveTextContent('1 item needs attention');
    await userEvent.click(screen.getByTestId('header-actions-trigger'));
    const group = await screen.findByTestId('header-action-group-entry-lists');
    expect(group).toHaveTextContent('Entry lists');
    const pulls = within(group).getByTestId('header-action-show-tool-entry-list-pulls');
    expect(pulls).toHaveAttribute(
      'href',
      `/shows/${SHOW_ID}/entries?tab=exceptions&exception=pulls`
    );
    expect(pulls).toHaveTextContent('1');
    // Waitlist has no count today, so no badge.
    expect(
      within(group).getByTestId('header-action-show-tool-entry-list-waitlist')
    ).not.toHaveTextContent(/\d/);
  });

  it('draws every row, including a greyed two-line one, as a 44px touch target', async () => {
    act(() => {
      usePageEditTargetStore.getState().registerShowTools(Symbol('t'), {
        showId: SHOW_ID,
        tools: [
          ...TOOLS,
          {
            id: 'late-entry',
            group: 'show-day',
            title: 'Add late entry',
            disabledReason: 'No classes with space',
          },
        ],
        attention: IDLE,
      });
    });
    render(<HeaderActions />, { wrapper });
    await userEvent.click(screen.getByTestId('header-actions-trigger'));

    const link = await screen.findByTestId('header-action-show-tool-people-at-show');
    const greyed = screen.getByTestId('header-action-show-tool-late-entry');
    expect(link).toHaveClass('min-h-11');
    expect(greyed).toHaveClass('min-h-11');
  });

  it('names the trigger Actions with the badge text inside it', () => {
    register({ count: 2, tone: 'urgent', incomplete: false });
    const trigger = screen.getByRole('button', { name: /^Actions/ });
    expect(trigger).toBe(screen.getByTestId('header-actions-trigger'));
    expect(trigger).toContainElement(screen.getByTestId('header-actions-badge'));
    expect(trigger).toHaveAccessibleName(/Actions.*2 items need attention/);
  });

  it('shows no badge off a show route, even with a registration in the store', () => {
    act(() => {
      usePageEditTargetStore.getState().registerShowTools(Symbol('t'), {
        showId: SHOW_ID,
        tools: TOOLS,
        attention: { count: 2, tone: 'urgent', incomplete: false },
      });
    });
    render(<HeaderActions />, { wrapper: wrapperAt('/dogs') });
    // Positive control: the menu itself is there.
    expect(screen.getByTestId('header-actions-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('header-actions-badge')).not.toBeInTheDocument();
  });

  it('shows no badge while the viewer scope is unresolved', () => {
    scope.status = 'resolving';
    act(() => {
      usePageEditTargetStore.getState().registerShowTools(Symbol('t'), {
        showId: SHOW_ID,
        tools: TOOLS,
        attention: { count: 2, tone: 'urgent', incomplete: false },
      });
    });
    render(<HeaderActions />, { wrapper });
    expect(screen.queryByTestId('header-actions-badge')).not.toBeInTheDocument();
  });

  it('greys a tool the viewer cannot use, with its reason', async () => {
    act(() => {
      usePageEditTargetStore.getState().registerShowTools(Symbol('t'), {
        showId: SHOW_ID,
        tools: [{ ...TOOLS[2]!, disabledReason: 'Trial secretary access only' }],
        attention: IDLE,
      });
    });
    render(<HeaderActions />, { wrapper });
    await userEvent.click(screen.getByTestId('header-actions-trigger'));
    const row = await screen.findByTestId('header-action-show-tool-volunteers');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveTextContent('Trial secretary access only');
    expect(row).not.toHaveAttribute('href');
  });
});
