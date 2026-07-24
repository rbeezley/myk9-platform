import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnhancedTrainingJournal, type TrainingEntry } from './EnhancedTrainingJournal';
import type { TrainingGoal } from '@/types/training';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({
  toast: { error: toastErrorMock },
}));

const entry: TrainingEntry = {
  id: 'entry-1',
  title: 'Container drill',
  content: 'Worked corners',
  date: new Date('2026-05-01T12:00:00Z'),
  duration: 30,
  skills: ['Containers'],
  difficulty: 3,
  progress: 'excellent',
  photos: [],
};

const goal: TrainingGoal = {
  id: 'goal-1',
  dog_id: 'dog-123',
  owner_id: 'user-123',
  title: 'Earn NW1 by September',
  target_date: '2026-09-01',
  sport_tag: 'Scent Work',
  notes: null,
  completed_at: null,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

describe('EnhancedTrainingJournal quick actions', () => {
  it('opens a progress report with training metrics', () => {
    render(<EnhancedTrainingJournal entries={[entry]} />);

    fireEvent.click(screen.getByRole('button', { name: /view progress report/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Progress Report')).toBeInTheDocument();
    expect(screen.getAllByText('Containers').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 sessions .* 30 min/i).length).toBeGreaterThan(0);
  });

  it('creates and completes training goals', () => {
    const onCreateGoal = vi.fn();
    const onToggleGoal = vi.fn();

    render(
      <EnhancedTrainingJournal
        entries={[entry]}
        goals={[goal]}
        onCreateGoal={onCreateGoal}
        onToggleGoal={onToggleGoal}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /set training goals/i }));
    fireEvent.change(screen.getByPlaceholderText(/earn nw1/i), {
      target: { value: 'Improve buried hides' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onCreateGoal).toHaveBeenCalledWith({
      title: 'Improve buried hides',
      target_date: null,
      sport_tag: null,
    });

    fireEvent.click(screen.getByRole('button', { name: /complete/i }));

    expect(onToggleGoal).toHaveBeenCalledWith(goal);
  });
});

describe('EnhancedTrainingJournal accessibility', () => {
  it('gives the entry form fields programmatic accessible names', () => {
    render(<EnhancedTrainingJournal entries={[entry]} />);
    fireEvent.click(screen.getByRole('button', { name: /new training session/i }));

    expect(screen.getByLabelText(/session title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/duration \(minutes\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^difficulty$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^progress$/i)).toBeInTheDocument();
  });

  it('gives rich-text formatting toggles accessible names and pressed state', () => {
    render(<EnhancedTrainingJournal entries={[entry]} />);
    fireEvent.click(screen.getByRole('button', { name: /new training session/i }));

    // Formatting toggles are true toggle controls: they expose aria-pressed
    // reflecting the mark's active state (tiptap mark toggling itself is
    // exercised by RichTextEditor's own suite; this asserts the a11y contract).
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');

    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
  });

  it('gives each entry Edit and Delete control a distinct accessible name identifying the entry', () => {
    const other: TrainingEntry = { ...entry, id: 'entry-2', title: 'Interior search' };
    render(<EnhancedTrainingJournal entries={[entry, other]} />);

    expect(screen.getByRole('button', { name: 'Edit Container drill' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Container drill' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Interior search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Interior search' })).toBeInTheDocument();
  });
});

describe('EnhancedTrainingJournal deletion recovery', () => {
  it('requires confirmation and identifies the entry being deleted', () => {
    const onDeleteEntry = vi.fn().mockResolvedValue(undefined);
    render(<EnhancedTrainingJournal entries={[entry]} onDeleteEntry={onDeleteEntry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Container drill' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Container drill');
    expect(onDeleteEntry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onDeleteEntry).not.toHaveBeenCalled();
    expect(screen.getByText('Container drill')).toBeInTheDocument();
  });

  it('deletes the entry after confirmation', async () => {
    const onDeleteEntry = vi.fn().mockResolvedValue(undefined);
    render(<EnhancedTrainingJournal entries={[entry]} onDeleteEntry={onDeleteEntry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Container drill' }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(onDeleteEntry).toHaveBeenCalledWith('entry-1'));
  });

  it('retains the entry and announces the failure when delete fails', async () => {
    const onDeleteEntry = vi.fn().mockRejectedValue(new Error('network error'));
    render(<EnhancedTrainingJournal entries={[entry]} onDeleteEntry={onDeleteEntry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Container drill' }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(toastErrorMock.mock.calls[0][0]).toMatch(/couldn.?t delete/i);
    // Entry is still rendered — nothing was optimistically removed.
    expect(screen.getByText('Container drill')).toBeInTheDocument();
  });
});
