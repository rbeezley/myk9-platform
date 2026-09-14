import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { DraftMetadata, SavedDraft } from '@/hooks/useDraftPersistence';
import { DraftManager } from './DraftManager';

const metadata: DraftMetadata = {
  id: 'draft-1',
  showId: 'show-1',
  userId: 'user-1',
  timestamp: Date.now(),
  stepCompleted: 'class-selection',
  title: 'My entry',
  preview: '1 dog',
  selectedDogsCount: 1,
  completed: false,
};

const savedDraft: SavedDraft = { metadata, data: { selectedDogs: ['dog-1'] } };

function renderManager(overrides: Partial<React.ComponentProps<typeof DraftManager>> = {}) {
  const loadDraft = vi.fn(() => savedDraft);
  const onDraftLoaded = vi.fn(() => true);
  render(
    <DraftManager
      saveDraft={vi.fn(() => null)}
      loadDraft={loadDraft}
      deleteDraft={vi.fn()}
      availableDrafts={[metadata]}
      clearAllDrafts={vi.fn()}
      hasUnsavedChanges={false}
      onDraftLoaded={onDraftLoaded}
      showResume
      {...overrides}
    />
  );
  return { loadDraft, onDraftLoaded };
}

describe('DraftManager reentry', () => {
  it('offers one prominent action through the existing draft loader', () => {
    const { loadDraft, onDraftLoaded } = renderManager();

    fireEvent.click(screen.getByRole('button', { name: 'Resume entry' }));

    expect(loadDraft).toHaveBeenCalledWith('draft-1');
    expect(onDraftLoaded).toHaveBeenCalledWith(savedDraft);
    expect(screen.getByText(/select a dog below to start a different entry/i)).toBeInTheDocument();
  });

  it('does not offer an empty or completed entry as resumable', () => {
    renderManager({
      availableDrafts: [
        { ...metadata, selectedDogsCount: 0 },
        { ...metadata, id: 'draft-2', completed: true },
      ],
    });

    expect(screen.queryByRole('button', { name: 'Resume entry' })).not.toBeInTheDocument();
  });

  it('keeps the entry visible while dogs load or a roster request fails', () => {
    const onRetryDogs = vi.fn();
    const { rerender } = render(
      <DraftManager
        saveDraft={vi.fn(() => null)}
        loadDraft={vi.fn(() => savedDraft)}
        deleteDraft={vi.fn()}
        availableDrafts={[metadata]}
        clearAllDrafts={vi.fn()}
        hasUnsavedChanges={false}
        showResume
        dogsReady={false}
        onRetryDogs={onRetryDogs}
      />
    );

    expect(screen.getByRole('button', { name: 'Resume entry' })).toBeDisabled();
    rerender(
      <DraftManager
        saveDraft={vi.fn(() => null)}
        loadDraft={vi.fn(() => savedDraft)}
        deleteDraft={vi.fn()}
        availableDrafts={[metadata]}
        clearAllDrafts={vi.fn()}
        hasUnsavedChanges={false}
        showResume
        dogsReady={false}
        loadError
        onRetryDogs={onRetryDogs}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading dogs' }));
    expect(onRetryDogs).toHaveBeenCalledOnce();
  });

  it('leaves a rejected draft available for a later retry', () => {
    const onDraftLoaded = vi.fn(() => false);
    renderManager({ onDraftLoaded });

    fireEvent.click(screen.getByRole('button', { name: 'Resume entry' }));

    expect(onDraftLoaded).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Resume entry' })).toBeVisible();
  });
});
