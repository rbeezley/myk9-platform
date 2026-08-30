import { describe, expect, it, vi } from 'vitest';
import { createDraftShow, finishShowSave } from '../showSaveCompletion';

describe('createDraftShow', () => {
  it('persists the canonical draft status and shows the success overlay', async () => {
    const saveShow = vi.fn().mockResolvedValue(undefined);

    await createDraftShow(saveShow);

    expect(saveShow).toHaveBeenCalledWith('draft', true);
  });

  it('delivers one-time passcodes to the completion overlay for a created draft', () => {
    const onCreated = vi.fn();
    const navigate = vi.fn();
    const passcodes = {
      admin: 'admin-code',
      judge: 'judge-code',
      steward: 'steward-code',
      exhibitor: 'exhibitor-code',
    };

    finishShowSave({
      status: 'draft',
      shouldShowCompletion: true,
      isEditMode: false,
      showId: 'show-1',
      showName: 'Spring Classic',
      passcodes,
      passcodeError: null,
      onCreated,
      navigate,
    });

    expect(onCreated).toHaveBeenCalledWith('show-1', 'Spring Classic', passcodes, null);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates to the existing show after an edit instead of showing creation completion', () => {
    const onCreated = vi.fn();
    const navigate = vi.fn();

    finishShowSave({
      status: 'draft',
      shouldShowCompletion: true,
      isEditMode: true,
      showId: 'show-1',
      showName: 'Spring Classic',
      passcodes: null,
      passcodeError: null,
      onCreated,
      navigate,
    });

    expect(navigate).toHaveBeenCalledWith('/shows/show-1');
    expect(onCreated).not.toHaveBeenCalled();
  });
});
