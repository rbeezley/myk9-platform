import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { render, screen, fireEvent } from '@/test/utils/testUtils';
import { SavedScoreLine } from './SavedScoreLine';
import { useSavedScoreStore } from './savedScore';

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntryById: vi.fn().mockResolvedValue(null),
    getScoreUploadState: vi.fn().mockResolvedValue('pending'),
    readScoreFromServer: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn(() => () => undefined),
  },
}));

const LIST = '/at-show/show-1/class/class-1';
const SHEET = `${LIST}/score/entry-1`;

const Where = () => <div>at {useLocation().pathname}</div>;

describe('SavedScoreLine (MYK9-2012)', () => {
  beforeEach(() => {
    useSavedScoreStore.getState().set({
      entryId: 'entry-1',
      dogLabel: '100 Willow',
      resultLabel: 'Qualified',
      timeLabel: '0:04.35',
      listPath: LIST,
      scoreRoute: SHEET,
    });
  });

  it('Correct opens that dog’s scoresheet, the one path every correction already uses', () => {
    render(
      <Routes>
        <Route path={LIST} element={<SavedScoreLine />} />
        <Route path={SHEET} element={<Where />} />
      </Routes>,
      { initialRoute: LIST }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Correct' }));

    expect(screen.getByText(`at ${SHEET}`)).toBeInTheDocument();
  });

  it('is announced politely and offers nothing about any other dog', () => {
    render(<SavedScoreLine />, { initialRoute: LIST });

    const line = screen.getByRole('status');
    expect(line).toHaveTextContent(/^Saved: 100 Willow · Qualified · 0:04\.35/);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
