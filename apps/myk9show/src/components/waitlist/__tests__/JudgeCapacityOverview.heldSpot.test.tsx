/**
 * MYK9-1012 (Codex P2 on #2755): the secretary's Waitlist tab reads
 * `judge_day_summary`, whose confirmed_count now includes spots carts hold at
 * Pay (migration 20261005031700). A one-dog judge day whose only spot is held
 * must read Full here, as the server already refuses offers for it, and never
 * say anything about a hold. The view row is fed through the real
 * `useJudgeDayCapacity` mapping so the figure on screen is the view's.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { JudgeCapacityOverview } from '../JudgeCapacityOverview';

const viewRow = vi.hoisted(() => ({ confirmed_count: 1 }));

function answer(data: unknown) {
  const result = { data, error: null };
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) chain[method] = () => chain;
  chain.single = () => Promise.resolve(result);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'judge_day_summary') {
        return answer([
          {
            show_id: 'show-1',
            judge_id: 'judge-jo',
            judge_name: 'Jo Judge',
            show_date: '2026-11-01',
            class_ids: ['class-c4'],
            class_names: ['Buried Novice'],
            confirmed_count: viewRow.confirmed_count,
            waitlist_count: 0,
          },
        ]);
      }
      if (table === 'shows') {
        return answer({
          default_judge_day_capacity: 125,
          mail_in_strategy: null,
          mail_in_value: null,
          mail_in_deadline: null,
          mail_in_auto_release: null,
          mail_in_release_date: null,
        });
      }
      return answer([
        {
          person_id: 'judge-jo',
          class_id: 'class-c4',
          day_capacity_override: 1,
          trials: { date: '2026-11-01' },
        },
      ]);
    },
  },
}));

import { useJudgeDayCapacity } from '@/hooks/queries/useJudgeDayCapacity';

async function judgeDaysFromView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useJudgeDayCapacity('show-1'), { wrapper });
  await waitFor(() => expect(result.current.judgeDays).toHaveLength(1));
  return result.current.judgeDays;
}

const HOLD_WORDING = /\bhold|\bheld/i;

describe('JudgeCapacityOverview — a held last spot (MYK9-1012)', () => {
  it('reads Full when the view counts the held spot as taken', async () => {
    viewRow.confirmed_count = 1;
    const judgeDays = await judgeDaysFromView();
    expect(judgeDays[0]!.availableSpots).toBe(0);

    const { container } = render(
      <JudgeCapacityOverview judgeDays={judgeDays} onViewWaitList={vi.fn()} />
    );

    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('1 / 1 entry')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(HOLD_WORDING);
  });

  it('has its spot back when the hold has ended', async () => {
    viewRow.confirmed_count = 0;
    const judgeDays = await judgeDaysFromView();

    render(<JudgeCapacityOverview judgeDays={judgeDays} onViewWaitList={vi.fn()} />);

    expect(screen.queryByText('Full')).not.toBeInTheDocument();
    expect(screen.getByText('1 spot available')).toBeInTheDocument();
  });
});
