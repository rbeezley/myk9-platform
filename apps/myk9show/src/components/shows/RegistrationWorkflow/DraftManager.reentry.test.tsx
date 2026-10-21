import { useState } from 'react';
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
  const deleteDraft = vi.fn();
  render(
    <DraftManager
      loadDraft={loadDraft}
      deleteDraft={deleteDraft}
      availableDrafts={[metadata]}
      hasUnsavedChanges={false}
      onDraftLoaded={onDraftLoaded}
      showResume
      {...overrides}
    />
  );
  return { loadDraft, onDraftLoaded, deleteDraft };
}

describe('DraftManager reentry', () => {
  it('offers one prominent action through the existing draft loader', () => {
    const { loadDraft, onDraftLoaded } = renderManager();

    fireEvent.click(screen.getByRole('button', { name: 'Resume entry' }));

    expect(loadDraft).toHaveBeenCalledWith('draft-1');
    expect(onDraftLoaded).toHaveBeenCalledWith(savedDraft);
    expect(screen.getByText(/select a dog below to start a different entry/i)).toBeInTheDocument();
  });

  it('offers no manual save or load draft buttons and keeps the quiet saved indicator', () => {
    renderManager({ showResume: false });

    expect(screen.queryByRole('button', { name: /Save Draft/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load Draft/ })).not.toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('shows the Saved indicator only while nothing is waiting to be autosaved', () => {
    const { unmount } = render(
      <DraftManager
        loadDraft={vi.fn(() => savedDraft)}
        deleteDraft={vi.fn()}
        availableDrafts={[]}
        hasUnsavedChanges
      />
    );
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    unmount();
    renderManager({ showResume: false, hasUnsavedChanges: false });
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('Start over discards the saved entry and the prompt goes away', () => {
    const deleteDraft = vi.fn();
    function Harness() {
      const [drafts, setDrafts] = useState([metadata]);
      return (
        <DraftManager
          loadDraft={vi.fn(() => savedDraft)}
          deleteDraft={id => {
            deleteDraft(id);
            setDrafts([]);
          }}
          availableDrafts={drafts}
          hasUnsavedChanges={false}
          showResume
        />
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));

    expect(deleteDraft).toHaveBeenCalledWith('draft-1');
    expect(screen.queryByText('Continue your entry?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume entry' })).not.toBeInTheDocument();
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
        loadDraft={vi.fn(() => savedDraft)}
        deleteDraft={vi.fn()}
        availableDrafts={[metadata]}
        hasUnsavedChanges={false}
        showResume
        dogsReady={false}
        loadingDogs
        onRetryDogs={onRetryDogs}
      />
    );

    expect(screen.getByRole('button', { name: 'Resume entry' })).toBeDisabled();
    rerender(
      <DraftManager
        loadDraft={vi.fn(() => savedDraft)}
        deleteDraft={vi.fn()}
        availableDrafts={[metadata]}
        hasUnsavedChanges={false}
        showResume
        dogsReady={false}
        loadError
        onRetryDogs={onRetryDogs}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading dogs' }));
    expect(onRetryDogs).toHaveBeenCalledOnce();

    rerender(
      <DraftManager
        loadDraft={vi.fn(() => savedDraft)}
        deleteDraft={vi.fn()}
        availableDrafts={[metadata]}
        hasUnsavedChanges={false}
        showResume
        dogsReady={false}
        onRetryDogs={onRetryDogs}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading dogs' }));
    expect(onRetryDogs).toHaveBeenCalledTimes(2);
  });

  it('waits for the account instead of offering a retry that cannot run', () => {
    const onRetryDogs = vi.fn();
    renderManager({ dogsReady: false, identityPending: true, onRetryDogs });

    expect(screen.queryByRole('button', { name: 'Retry loading dogs' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume entry' })).toBeDisabled();
    expect(screen.getByText(/waiting for your account to finish loading/i)).toBeInTheDocument();
    expect(onRetryDogs).not.toHaveBeenCalled();
  });

  it('leaves a rejected draft available for a later retry', () => {
    const onDraftLoaded = vi.fn(() => false);
    renderManager({ onDraftLoaded });

    fireEvent.click(screen.getByRole('button', { name: 'Resume entry' }));

    expect(onDraftLoaded).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Resume entry' })).toBeVisible();
  });
});
