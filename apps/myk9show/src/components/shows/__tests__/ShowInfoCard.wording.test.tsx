import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import ShowInfoCard from '../ShowInfoCard';

vi.mock('@/hooks/useResolvePersonName', () => ({
  useResolvePersonName: () => (id: string) => `Person ${id}`,
}));

describe('ShowInfoCard', () => {
  it('labels the chairman line "Chair"', () => {
    render(
      <ShowInfoCard
        showData={{
          name: 'Heartland',
          status: 'draft',
          type: 'AKC',
          startDate: new Date('2026-05-02'),
          endDate: new Date('2026-05-03'),
          chairman: 'p1',
          secretary: 'p2',
          chiefSteward: 'p3',
          entryOpenDate: new Date('2026-04-01'),
          entryCloseDate: new Date('2026-04-20'),
          preEntryFee: '25',
        }}
      />
    );

    expect(screen.getByText('Chair')).toBeInTheDocument();
    expect(screen.queryByText('Chairman')).not.toBeInTheDocument();
  });
});
