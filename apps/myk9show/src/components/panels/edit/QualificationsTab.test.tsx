import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { QualificationsTab } from './QualificationsTab';

vi.mock('@/hooks/queries/useJudgeDatabase', () => ({
  useJudgeQualifications: () => ({
    data: [],
    hasList: true,
    refetch: vi.fn(),
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetching: false,
    isPending: false,
    status: 'success',
    fetchStatus: 'idle',
  }),
}));

describe('QualificationsTab empty state', () => {
  it('says "active" because only active qualifications were asked for', () => {
    render(
      <QualificationsTab personId="p1" canEditQualifications onManageQualifications={vi.fn()} />
    );
    expect(screen.getByText('No active judge qualifications')).toBeInTheDocument();
    expect(screen.getByText('This user has no active judge qualifications.')).toBeInTheDocument();
  });
});
