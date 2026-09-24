/**
 * MYK9-648: show A -> show B must never render A's premium publish state.
 *
 * The app-wide `placeholderData: prev => prev` (lib/queryClient.ts) used to hand
 * show B the publish read of show A until B's own read landed, so the header
 * Actions item could say "Premium is published and up to date" for a
 * never-published show and the Premium List card's Download PDF pointed at A's
 * file. `usePublishInfo.test.ts` only pins the query OPTIONS; this renders the
 * two surfaces the secretary actually sees, on a QueryClient built from the
 * PRODUCTION defaults, and drives a real route change with B's read held open.
 *
 * The header menu lives in AppHeader, outside every route element, so its
 * observer always survives a show change. The card is rendered unkeyed under a
 * `/shows/:id` route: in the app, `PageTransition` keys the page on the
 * pathname and remounts it, EXCEPT under prefers-reduced-motion, where it
 * renders children bare and the same card instance sees the new show id. This
 * test pins that worst case. Audit: docs/qa/per-show-query-placeholder-audit-2026-09-24.md.
 */
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { act, render, screen, waitFor, within } from '@/test/utils/testUtils';
import { createChainableQuery, mockSupabase } from '@/test/mocks/supabase';
import { queryClient as appQueryClient } from '@/lib/queryClient';
import { HeaderActions } from '@/components/layout/HeaderActions';
import { PremiumDownloadCard } from '../PremiumDownloadCard';
import {
  PREMIUM_LOADING_REASON,
  PREMIUM_UNAVAILABLE_REASON,
  PREMIUM_UP_TO_DATE_REASON,
} from '../premiumPublishAction';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'user-1', email: 'secretary@myk9t.com' },
    hasRole: () => true,
    hasPermission: () => true,
    userWithRoles: null,
  }),
}));

// Resolved manager on EVERY show, so the only thing that can differ between A
// and B is the publish read itself.
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({
    status: 'resolved',
    canManage: true,
    canOperate: true,
    hasOperationalStaffRole: true,
    clubId: 'club-1',
  }),
}));

vi.mock('@/features/premium/useGeneratePremium', () => ({
  useGeneratePremium: () => ({ generate: vi.fn(), isLoading: false, error: null, reset: vi.fn() }),
}));

vi.mock('@/features/experience/publishExperience', () => ({
  publishExperience: vi.fn(async () => undefined),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const SHOW_A = 'show-a';
const SHOW_B = 'show-b';
const SHOW_A_PDF = 'https://storage.test/premiums/show-a/premium.pdf';

/** Show A: published, current, landing published. */
const SHOW_A_ROW = {
  published_premium_url: SHOW_A_PDF,
  published_premium_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  experience_is_published: true,
};

/** Show B: never published. */
const SHOW_B_ROW = {
  published_premium_url: null,
  published_premium_at: null,
  updated_at: '2026-09-02T10:00:00Z',
  experience_is_published: null,
};

type ReadResult = { data: Record<string, unknown> | null; error: unknown };

/**
 * Route `supabase.from('shows').select(...).eq('id', X).maybeSingle()` —
 * `fetchPublishInfo`'s exact chain — to per-show results. Show A answers at
 * once; show B's read is DEFERRED until the test settles it. Built per test so
 * no promise or resolver lives at module scope.
 */
function installPublishReads() {
  let settleB!: (result: ReadResult) => void;
  const showBRead = new Promise<ReadResult>(resolve => {
    settleB = resolve;
  });
  const reads: string[] = [];

  mockSupabase.from.mockImplementation((table: string) => {
    if (table !== 'shows') return createChainableQuery();
    return {
      select: () => ({
        eq: (_column: string, showId: string) => ({
          maybeSingle: () => {
            reads.push(showId);
            if (showId === SHOW_A) return Promise.resolve({ data: SHOW_A_ROW, error: null });
            if (showId === SHOW_B) return showBRead;
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    };
  });

  return { settleB, reads };
}

/**
 * The PRODUCTION query defaults (including the global previous-data
 * placeholder this test exists to catch). Only `retry` is turned off, so the
 * failure case settles without the production backoff; it has no bearing on
 * placeholder data.
 */
function productionDefaultsClient() {
  const defaults = appQueryClient.getDefaultOptions();
  return new QueryClient({
    defaultOptions: { ...defaults, queries: { ...defaults.queries, retry: false } },
  });
}

function ShowOverview() {
  const { id } = useParams();
  return <PremiumDownloadCard showId={id!} canManageShow showStaleBadge />;
}

function GoToShowB() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(`/shows/${SHOW_B}`)}>
      go to show B
    </button>
  );
}

function renderShowSurfaces() {
  return render(
    <>
      <HeaderActions />
      <Routes>
        <Route path="/shows/:id" element={<ShowOverview />} />
      </Routes>
      <GoToShowB />
    </>,
    { initialRoute: `/shows/${SHOW_A}`, queryClient: productionDefaultsClient() }
  );
}

type User = ReturnType<typeof renderShowSurfaces>['user'];

/** Open the Actions menu, read the premium item's rendered text, close it. */
async function readPremiumMenuItem(user: User): Promise<string> {
  await user.click(screen.getByTestId('header-actions-trigger'));
  const menu = await screen.findByRole('menu');
  const text =
    within(menu).getByTestId('header-action-show-generate-publish-premium').textContent ?? '';
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  return text;
}

function allHrefs(): string[] {
  return Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href') ?? '');
}

/** Mount on A, prove A's published state rendered, then navigate to B. */
async function mountOnAThenGoToB() {
  const reads = installPublishReads();
  const view = renderShowSurfaces();

  const downloadA = await screen.findByRole('link', { name: 'Download PDF' });
  expect(downloadA).toHaveAttribute('href', SHOW_A_PDF);
  expect(await readPremiumMenuItem(view.user)).toContain(PREMIUM_UP_TO_DATE_REASON);

  await view.user.click(screen.getByRole('button', { name: 'go to show B' }));
  await waitFor(() => expect(reads.reads).toContain(SHOW_B));
  return { ...view, ...reads };
}

/** Nothing on screen may carry show A's publish state or file. */
function expectNoShowAState() {
  // By text, not role: a published-state Download control of ANY element type
  // is A's state leaking, whether it is a link or a button.
  expect(screen.queryByText('Download PDF')).not.toBeInTheDocument();
  expect(allHrefs().filter(href => href.includes(SHOW_A))).toEqual([]);
  expect(document.body.textContent).not.toContain('Premium PDF published');
  expect(document.body.textContent).not.toContain(PREMIUM_UP_TO_DATE_REASON);
}

describe("MYK9-648: navigating show A -> show B never renders A's premium publish state", () => {
  // (a) is two tests so a regression reddens each surface on its own, rather
  // than the first failed assertion hiding whether the other one leaked too.
  it('(a) while B’s publish read is pending: the Premium List card says "checking", with no A href', async () => {
    await mountOnAThenGoToB();

    expectNoShowAState();
    expect(screen.getByText('Premium List').closest('div')?.textContent).toBe(
      `Premium List${PREMIUM_LOADING_REASON}`
    );
  });

  it('(a) while B’s publish read is pending: the header Actions item says "checking", not A’s state', async () => {
    const { user } = await mountOnAThenGoToB();

    const item = await readPremiumMenuItem(user);
    expect(item).not.toContain(PREMIUM_UP_TO_DATE_REASON);
    expect(item).toContain(PREMIUM_LOADING_REASON);
    // Checked after the menu round trip too, still before B resolves.
    expectNoShowAState();
  });

  it('(b) after B resolves unpublished: the unpublished state renders on both', async () => {
    const { user, settleB } = await mountOnAThenGoToB();

    await act(async () => settleB({ data: SHOW_B_ROW, error: null }));

    expect(await screen.findByText('Premium PDF is not published yet')).toBeInTheDocument();
    expectNoShowAState();
    const publishButton = screen.getByRole('button', { name: /generate & publish premium/i });
    expect(publishButton).toBeEnabled();

    const item = await readPremiumMenuItem(user);
    expect(item).toBe('Generate & publish premium');
  });

  it('(c) when B’s read fails: an unavailable state renders, never A’s', async () => {
    const { user, settleB } = await mountOnAThenGoToB();

    await act(async () =>
      settleB({ data: null, error: { message: 'boom', code: 'PGRST500', status: 500 } })
    );

    await waitFor(() =>
      expect(screen.getByText('Premium List').closest('div')?.textContent).toBe(
        `Premium List${PREMIUM_UNAVAILABLE_REASON}`
      )
    );
    expectNoShowAState();

    const item = await readPremiumMenuItem(user);
    expect(item).toContain(PREMIUM_UNAVAILABLE_REASON);
    expect(item).not.toContain(PREMIUM_UP_TO_DATE_REASON);
  });
});
