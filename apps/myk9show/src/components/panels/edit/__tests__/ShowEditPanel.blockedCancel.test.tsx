/**
 * MYK9-1383: "Cancel show" in a blocked delete dialog opened FROM the Edit panel. The
 * link's `?edit=true` target is the page already open, so the panel's seeded tab never
 * re-reads it; the panel itself must move to Basic Info, where the Status select lives.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), unsaved: vi.fn() }));

vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: mocks.preview,
}));
vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: mocks.unsaved,
}));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));

import { ShowEditPanel } from '../ShowEditPanel';

const onDelete = {
  kind: 'show' as const,
  objectLabel: 'show',
  targets: [{ id: 'show-1', name: 'Heartland', context: { showId: 'show-1' } }],
};

beforeEach(() => {
  mocks.preview.mockReset();
  mocks.unsaved.mockReset();
  mocks.unsaved.mockResolvedValue({ total: 0, failed: 0 });
  mocks.preview.mockResolvedValue({
    trials: 1,
    classes: 1,
    entries: 1,
    shows: 0,
    dogs: 0,
    paid: 1,
    scored: 0,
    blocking: 1,
  });
});

describe('Cancel show from the Edit panel', () => {
  it('moves a panel sitting on another tab to Basic Info and its Status select', async () => {
    const { user } = render(
      <ShowEditPanel
        open
        onClose={vi.fn()}
        initialTab="judges"
        onDelete={onDelete}
        showId="show-1"
        showName="Heartland"
        initialShowData={{ id: 'show-1', name: 'Heartland', organization: 'AKC', status: 'draft' }}
        onSave={vi.fn()}
      />
    );
    expect(screen.queryAllByRole('tab', { selected: true })[0]).toHaveTextContent(/judges/i);
    expect(screen.queryByRole('combobox', { name: /status/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Delete show' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(await within(dialog).findByRole('link', { name: 'Cancel show' }));

    expect(screen.queryAllByRole('tab', { selected: true })[0]).toHaveTextContent(/basic/i);
    expect(await screen.findByRole('combobox', { name: /status/i })).toBeVisible();
  });
});
