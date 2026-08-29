import { describe, expect, it, vi } from 'vitest';
import { createDraftShow } from '../useShowCreationWizardActions';

describe('createDraftShow', () => {
  it('persists the canonical draft status and shows the success overlay', async () => {
    const saveShow = vi.fn().mockResolvedValue(undefined);

    await createDraftShow(saveShow);

    expect(saveShow).toHaveBeenCalledWith('draft', true);
  });
});
