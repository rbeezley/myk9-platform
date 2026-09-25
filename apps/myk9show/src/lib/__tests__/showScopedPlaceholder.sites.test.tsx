/**
 * MYK9-709: switching show A -> show B must never render (or act on) A's rows.
 *
 * The app-wide placeholder in `lib/queryClient.ts` used to be
 * `previousData => previousData` for EVERY key, so any consumer that stayed
 * mounted across a show change showed A's data under B until B's own read
 * landed. Each test below mounts on A, proves A rendered (positive control),
 * switches to B with B's read HELD OPEN, and asserts nothing of A's is on
 * screen and nothing is offered that could write.
 *
 * Every client here is `createAppQueryClient()`: the production defaults, not
 * `createTestQueryClient()`, whose defaults have no placeholder at all and so
 * could never catch this. Audit: docs/qa/per-show-query-placeholder-audit-2026-09-24.md.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';
import { createAppQueryClient } from '@/lib/queryClient';
import { PageTransition } from '@/components/common/PageTransition';
import { ScheduledLifecycleEmailsPanel } from '@/features/lifecycle-emails/ScheduledLifecycleEmailsPanel';
import { fetchShowLifecycleEmailSummary } from '@/features/lifecycle-emails/api';
import type { LifecycleEmailScheduledSummary } from '@/features/lifecycle-emails/readModel';
import { EmailDeliveryHistory } from '@/features/email-delivery-history/EmailDeliveryHistory';
import type { EmailDeliveryHistoryPage } from '@/features/email-delivery-history/api';
import { useVolunteers } from '@/hooks/queries/volunteerQueries';
import { usePublishedExperienceContent } from '@/features/experience/usePublishedExperienceContent';

const { mockFetchHistory, reducedMotion } = vi.hoisted(() => ({
  mockFetchHistory: vi.fn<(args: { showId: string }) => Promise<EmailDeliveryHistoryPage>>(),
  reducedMotion: { value: false },
}));

vi.mock('@/features/lifecycle-emails/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/lifecycle-emails/api')>();
  return { ...actual, fetchShowLifecycleEmailSummary: vi.fn() };
});

vi.mock('@/features/email-delivery-history/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/email-delivery-history/api')>();
  return { ...actual, fetchShowEmailDeliveryHistory: mockFetchHistory };
});

vi.mock('framer-motion', async importOriginal => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reducedMotion.value };
});

const mockFetchSummary = vi.mocked(fetchShowLifecycleEmailSummary);

const SHOW_A = '0a0a0a0a-0000-4000-8000-00000000000a';
const SHOW_B = '0b0b0b0b-0000-4000-8000-00000000000b';

/** A promise the test settles by hand: B's read, held open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

function summaryWithAcceptedEnabled(isEnabled: boolean): LifecycleEmailScheduledSummary {
  return {
    steps: [
      {
        stepType: 'accepted',
        isEnabled,
        readyCount: 3,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        dismissedCount: 0,
        warningCount: 0,
      },
    ],
    receipts: { sentCount: 0, failedCount: 0, latestSentAtByRegistrationId: {} },
  } as LifecycleEmailScheduledSummary;
}

beforeEach(() => {
  reducedMotion.value = false;
  mockFetchSummary.mockReset();
  mockFetchHistory.mockReset();
});

describe('show-filter pages keep no show A data under show B (MYK9-709)', () => {
  it('scheduled-email toggles: no A toggle renders, so no A-derived write is possible', async () => {
    const showBSummary = deferred<LifecycleEmailScheduledSummary>();
    mockFetchSummary.mockImplementation(async ({ showId }) =>
      showId === SHOW_A ? summaryWithAcceptedEnabled(true) : showBSummary.promise
    );

    const { rerender } = render(<ScheduledLifecycleEmailsPanel showId={SHOW_A} />, {
      queryClient: createAppQueryClient(),
    });
    expect(await screen.findByRole('switch', { name: /accepted entries enabled/i })).toBeChecked();

    rerender(<ScheduledLifecycleEmailsPanel showId={SHOW_B} />);
    await waitFor(() =>
      expect(mockFetchSummary).toHaveBeenCalledWith(expect.objectContaining({ showId: SHOW_B }))
    );

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('3 ready')).not.toBeInTheDocument();

    showBSummary.resolve(summaryWithAcceptedEnabled(false));
    expect(
      await screen.findByRole('switch', { name: /accepted entries enabled/i })
    ).not.toBeChecked();
  });

  it('email delivery history: A deliveries are not listed under B and "Show more" is not offered', async () => {
    const showBHistory = deferred<EmailDeliveryHistoryPage>();
    mockFetchHistory.mockImplementation(async ({ showId }) =>
      showId === SHOW_A
        ? {
            rows: [
              {
                id: 'attempt-a',
                show_id: SHOW_A,
                source_kind: 'entry_decision',
                lifecycle_step_type: null,
                related_id: 'entry-a',
                recipient_name: 'Show A Handler',
                recipient_email: 'a@example.com',
                attempted_at: '2026-08-17T12:00:00Z',
                status_updated_at: null,
                delivery_status: 'sent',
                failure_summary: null,
              },
            ],
            nextCursor: { createdAt: '2026-08-17T12:00:00Z', id: 'attempt-a' },
          }
        : showBHistory.promise
    );

    const { rerender } = render(<EmailDeliveryHistory showId={SHOW_A} />, {
      queryClient: createAppQueryClient(),
    });
    expect(await screen.findByText(/Show A Handler/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();

    rerender(<EmailDeliveryHistory showId={SHOW_B} />);
    await waitFor(() =>
      expect(mockFetchHistory).toHaveBeenCalledWith(expect.objectContaining({ showId: SHOW_B }))
    );

    expect(screen.queryByText(/Show A Handler/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    expect(screen.getByText('Loading email delivery history…')).toBeInTheDocument();
  });

  it("volunteer scheduling: B's roster is never A's rows (whose ids delete acts on)", async () => {
    const showBRoster = deferred<{ data: unknown[]; error: null }>();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table !== 'volunteers') return createChainableQuery();
      return {
        select: () => ({
          eq: (_column: string, showId: string) =>
            showId === SHOW_A
              ? Promise.resolve({
                  data: [{ id: 'volunteer-a', name: 'Show A Volunteer', show_id: SHOW_A }],
                  error: null,
                })
              : showBRoster.promise,
        }),
      };
    });

    const client = createAppQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(({ showId }) => useVolunteers(showId), {
      wrapper,
      initialProps: { showId: SHOW_A },
    });
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('volunteer-a'));

    rerender({ showId: SHOW_B });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isPlaceholderData).toBe(false);
    expect(result.current.isLoading).toBe(true);

    showBRoster.resolve({ data: [], error: null });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });
});

describe('/shows/:id under reduced motion (MYK9-709, the MYK9-648 case one level down)', () => {
  function PublishedContent() {
    const { id } = useParams();
    const { data, isLoading } = usePublishedExperienceContent(id);
    if (isLoading) return <p>Loading landing content</p>;
    return <p>{`premium: ${data?.outputs.premiumPath ?? 'none'}`}</p>;
  }

  function GoToShowB() {
    const navigate = useNavigate();
    return (
      <button type="button" onClick={() => navigate(`/shows/${SHOW_B}`)}>
        go to show B
      </button>
    );
  }

  it("the same page instance never shows A's published content under B", async () => {
    reducedMotion.value = true;
    const showBRead = deferred<{ data: Record<string, unknown> | null; error: null }>();
    const reads: string[] = [];
    mockSupabase.from.mockImplementation((table: string) => {
      if (table !== 'shows') return createChainableQuery();
      return {
        select: () => ({
          eq: (_column: string, showId: string) => ({
            maybeSingle: () => {
              reads.push(showId);
              return showId === SHOW_A
                ? Promise.resolve({
                    data: {
                      experience_is_published: true,
                      experience_published_content: { outputs: { premiumPath: 'show-a.pdf' } },
                    },
                    error: null,
                  })
                : showBRead.promise;
            },
          }),
        }),
      };
    });

    const { user } = render(
      <>
        <Routes>
          <Route
            path="/shows/:id"
            element={
              <PageTransition>
                <PublishedContent />
              </PageTransition>
            }
          />
        </Routes>
        <GoToShowB />
      </>,
      { initialRoute: `/shows/${SHOW_A}`, queryClient: createAppQueryClient() }
    );
    expect(await screen.findByText('premium: show-a.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'go to show B' }));
    await waitFor(() => expect(reads).toContain(SHOW_B));

    expect(screen.queryByText('premium: show-a.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Loading landing content')).toBeInTheDocument();

    showBRead.resolve({ data: { experience_is_published: false }, error: null });
    expect(await screen.findByText('premium: none')).toBeInTheDocument();
  });
});
