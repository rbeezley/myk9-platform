import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { JudgeClassInterface } from './JudgeClassInterface';

const queryState = vi.hoisted(() => ({
  entries: { data: null, isLoading: true, error: null as Error | null },
  classData: { data: null, isLoading: true, error: null as Error | null },
}));

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByClassQuery: () => queryState.entries,
  useUpdateEntryMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassQuery: () => queryState.classData,
}));

describe('JudgeClassInterface loading state', () => {
  beforeEach(() => {
    queryState.entries = { data: null, isLoading: true, error: null };
    queryState.classData = { data: null, isLoading: true, error: null };
  });

  it('uses a skeleton, not a spinner, while judge class data loads', () => {
    render(<JudgeClassInterface classId="class-1" />);

    expect(screen.getByRole('status', { name: 'Loading judge class data' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('keeps the error state distinct from loading', () => {
    queryState.entries = { data: null, isLoading: false, error: new Error('Timed out') };
    queryState.classData = { data: null, isLoading: false, error: null };

    render(<JudgeClassInterface classId="class-1" />);

    expect(screen.getByText('Timed out')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Loading judge class data' })
    ).not.toBeInTheDocument();
  });
});
