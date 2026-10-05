/**
 * MYK9-1012 (Codex P2 on #2755): the secretary's Waitlist tab reads
 * server's judge-day read (MYK9-1005), whose taken count includes spots carts
 * hold at Pay (migration 20261005031700). A one-dog judge day whose only spot
 * is held must read Full here, as the server already refuses offers for it,
 * and never say anything about a hold. The server row is fed through the real
 * `useJudgeDayCapacity` mapping so the figure on screen is the server's.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { JudgeCapacityOverview } from '../JudgeCapacityOverview';

const viewRow = vi.hoisted(() => ({ confirmed_count: 1 }));
const remaining = () => Math.max(0, 1 - viewRow.confirmed_count);

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
            waitlist_count: 0,
          },
        ]);
      }
      throw new Error(`unexpected read of ${table}`);
    },
    rpc: () =>
      Promise.resolve({
        data: [
          {
            class_id: 'class-c4',
            judge_id: 'judge-jo',
            show_date: '2026-11-01',
            day_capacity: 1,
            day_taken: viewRow.confirmed_count,
            day_mail_in_reserved: 0,
            day_remaining: remaining(),
          },
        ],
        error: null,
      }),
  },
}));

import { useJudgeDayCapacity } from '@/hooks/queries/useJudgeDayCapacity';

async function judgeDaysFromServer() {
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
  it('reads Full when the server counts the held spot as taken', async () => {
    viewRow.confirmed_count = 1;
    const judgeDays = await judgeDaysFromServer();
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
    const judgeDays = await judgeDaysFromServer();

    render(<JudgeCapacityOverview judgeDays={judgeDays} onViewWaitList={vi.fn()} />);

    expect(screen.queryByText('Full')).not.toBeInTheDocument();
    expect(screen.getByText('1 spot available')).toBeInTheDocument();
  });
});
