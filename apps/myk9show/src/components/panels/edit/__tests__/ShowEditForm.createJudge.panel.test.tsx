import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { z } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// REAL EditPanelWrapper -> REAL SlideOverPanel (Escape handling, Save footer) and the
// REAL Dialog and Tabs: this pins how the judge dialog interacts with the panel it
// is raised over (MYK9-908 review: Escape reached SlideOverPanel.onClose).

const harness = vi.hoisted(() => ({
  canWrite: true,
  createJudge: vi.fn(),
}));

vi.mock('@/components/shows/wizard/steps/useShowDetailsStepActions', () => ({
  useShowDetailsStepActions: () => ({ handleCreateNewJudge: harness.createJudge }),
}));
vi.mock('@/features/judges/canWriteJudgeQualifications', () => ({
  useCanWriteJudgeQualifications: () => harness.canWrite,
}));
vi.mock('@/store/templateStore', () => ({ useTemplateStore: () => ({ templates: [] }) }));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ clubs: [{ id: 'c1' }], loadClubs: vi.fn() }),
}));
vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({ people: [{ id: 'p1' }], loadUsers: vi.fn() }),
}));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
vi.mock('../ShowEditBasicInfoTab', () => ({ ShowEditBasicInfoTab: () => null }));
vi.mock('../ShowEditFeesTab', () => ({ ShowEditFeesTab: () => null }));
vi.mock('../ShowEditPremiumTab', () => ({ ShowEditPremiumTab: () => null }));
vi.mock('../ShowOfficialsEditor', () => ({ ShowOfficialsEditor: () => null }));

import { EditPanelWrapper } from '../EditPanelWrapper';
import { ShowEditForm } from '../ShowEditForm';

const schema = z.object({
  id: z.string(),
  organization: z.string(),
  assignedJudges: z.array(z.unknown()),
});
const initialData = { id: 'show-1', organization: 'AKC', assignedJudges: [] as unknown[] };

function renderPanel(onClose: () => void, onSave: () => void) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <EditPanelWrapper
          open
          onClose={onClose}
          title="Edit show"
          initialData={initialData}
          schema={schema}
          onSave={onSave}
        >
          <ShowEditForm activeTab="judges" onTabChange={() => {}} />
        </EditPanelWrapper>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /add a new judge/i }));
  await user.type(screen.getByLabelText(/first name/i), 'Jane');
  await user.type(screen.getByLabelText(/last name/i), 'Doe');
  await user.type(screen.getByLabelText(/judge number/i), '98234');
  await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
}

describe('Add-judge dialog inside the real edit panel (MYK9-908)', () => {
  beforeEach(() => {
    harness.createJudge.mockReset();
    harness.canWrite = true;
  });

  it('Escape while the dialog is open (not pending) closes only the dialog, not the panel', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel(onClose, vi.fn());
    await user.click(screen.getByRole('button', { name: /add a new judge/i }));
    expect(screen.getByRole('dialog', { name: /add a new judge/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByLabelText(/first name/i)).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape while the create is pending closes neither the dialog nor the panel, and Save is unreachable', async () => {
    let resolveCreate: (id: string) => void = () => undefined;
    harness.createJudge.mockReturnValue(
      new Promise<string>(resolve => {
        resolveCreate = resolve;
      })
    );
    const onClose = vi.fn();
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderPanel(onClose, onSave);
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Judge' }));

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Jane');

    // The panel's real Save sits outside the modal: hidden and inert while pending.
    const save = screen.getByText('Save Changes');
    expect(save.closest('[inert],[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => resolveCreate('new-judge-id'));
    await waitFor(() => expect(screen.queryByLabelText(/first name/i)).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });
});
