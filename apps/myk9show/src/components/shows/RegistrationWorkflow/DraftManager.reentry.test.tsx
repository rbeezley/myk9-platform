import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import { useDraftPersistence } from '@/hooks/useDraftPersistence';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
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

  it('puts Resume entry first as the primary action and Start over after it as outline', () => {
    renderManager();

    const resume = screen.getByRole('button', { name: 'Resume entry' });
    const startOver = screen.getByRole('button', { name: 'Start over' });
    expect(
      resume.compareDocumentPosition(startOver) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(resume).toHaveClass('min-h-11', 'bg-primary');
    expect(startOver).toHaveClass('min-h-11', 'border');
    expect(startOver).not.toHaveClass('bg-primary');
    expect(screen.getByText(/Start over discards the saved entry/)).toBeInTheDocument();
  });

  it('Start over deletes every resumable draft through the real hook and the prompt goes away', () => {
    localStorage.clear();
    useShowRegistrationStore.getState().clearDraftData();
    useShowRegistrationStore.getState().setDraftData({ selectedDogs: ['dog-1'] });
    const writer = renderHook(() => useDraftPersistence('show-1', 'user-1', 'dog-selection'));
    act(() => {
      writer.result.current.saveDraft('Older entry');
      writer.result.current.saveDraft('Newer entry');
    });
    writer.unmount();
    useShowRegistrationStore.getState().clearDraftData();

    function Wired() {
      const drafts = useDraftPersistence('show-1', 'user-1', 'dog-selection');
      return (
        <DraftManager
          loadDraft={drafts.loadDraft}
          deleteDraft={drafts.deleteDraft}
          availableDrafts={drafts.availableDrafts}
          hasUnsavedChanges={drafts.hasUnsavedChanges}
          showResume
        />
      );
    }
    render(<Wired />);
    expect(screen.getByText('Continue your entry?')).toBeInTheDocument();
    const payloadKeys = () =>
      Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter(key => {
        const value = JSON.parse(localStorage.getItem(key) ?? 'null') as { data?: unknown } | null;
        return value?.data !== undefined;
      });
    expect(payloadKeys()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));

    expect(screen.queryByText('Continue your entry?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume entry' })).not.toBeInTheDocument();
    expect(payloadKeys()).toHaveLength(0);
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
