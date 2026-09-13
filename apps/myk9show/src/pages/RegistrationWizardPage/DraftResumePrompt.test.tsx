import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { DraftMetadata, SavedDraft } from '@/hooks/useDraftPersistence';
import { DraftResumePrompt } from './DraftResumePrompt';

const draft = (id: string, count: number, timestamp: number): DraftMetadata => ({
  id,
  showId: 'show-1',
  userId: 'user-1',
  timestamp,
  stepCompleted: 'dog-selection',
  title: 'Saved entry',
  preview: 'New registration',
  selectedDogsCount: count,
});

describe('DraftResumePrompt', () => {
  it('offers the latest meaningful saved selection through the existing draft loader', () => {
    const saved = { metadata: draft('new', 1, 2), data: { selectedDogs: ['dog-1'] } } as SavedDraft;
    const loadDraft = vi.fn(() => saved);
    const onDraftLoaded = vi.fn();

    render(
      <DraftResumePrompt
        drafts={[draft('empty', 0, 3), draft('new', 1, 2), draft('old', 1, 1)]}
        loadDraft={loadDraft}
        deleteDraft={vi.fn()}
        onDraftLoaded={onDraftLoaded}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resume entry' }));

    expect(loadDraft).toHaveBeenCalledWith('new');
    expect(onDraftLoaded).toHaveBeenCalledWith(saved);
  });

  it('does not offer an empty autosave as an entry', () => {
    render(
      <DraftResumePrompt
        drafts={[draft('empty', 0, 1)]}
        loadDraft={vi.fn()}
        deleteDraft={vi.fn()}
        onDraftLoaded={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Resume entry' })).not.toBeInTheDocument();
  });

  it('does not offer a previously completed entry for resubmission', () => {
    render(
      <DraftResumePrompt
        drafts={[{ ...draft('filed', 1, 2), completed: true }]}
        loadDraft={vi.fn()}
        deleteDraft={vi.fn()}
        onDraftLoaded={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Resume entry' })).not.toBeInTheDocument();
  });

  it('removes an unreadable draft so the resume prompt does not recur', () => {
    const deleteDraft = vi.fn();
    render(
      <DraftResumePrompt
        drafts={[draft('missing', 1, 1)]}
        loadDraft={vi.fn(() => null)}
        deleteDraft={deleteDraft}
        onDraftLoaded={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resume entry' }));
    expect(deleteDraft).toHaveBeenCalledWith('missing');
  });
});
