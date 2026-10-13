/**
 * MYK9-1134: the real QuickCreateFlow tells its steps whether the person was made in this
 * flow or picked from the duplicate prompt. Only a picked person asks the server
 * (`can_edit_person`) before Edit Details is offered; a person made here never waits on it.
 * This pins the wiring end to end, so the flag cannot be dropped between the duplicate
 * prompt and the button (LESSONS last-hop-drop).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useUserStore } from '@/store/userStore';
import { supabase } from '@/services/database/supabaseClient';
import { QuickCreateFlow } from '../QuickCreateFlow';
import { resetQuickCreateMocks } from '@/test/quickCreate/quickCreateFlowMocks';
import { addPersonThroughForm, JOURNEY_TIMEOUT_MS } from '@/test/quickCreate/quickCreateFlowKit';

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/hooks/usePeopleQuery', () => ({
  usePeopleQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  ...(await import('@/test/quickCreate/quickCreateFlowMocks')).usersModule,
}));
vi.mock(
  '@/services/replication/ReplicatedShowDeskPeopleTable',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).showDeskPeopleModule
);
vi.mock(
  '@/hooks/useDogStoreCompat',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).dogStoreModule
);
vi.mock(
  '../CreatedInSessionContext',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).createdInSessionModule
);
vi.mock(
  '@/components/ui/popover',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).popoverModule
);

const rpc = vi.spyOn(supabase, 'rpc');

const existing = {
  id: 'person-existing-1',
  firstName: 'Molly',
  lastName: 'Mailbox',
  email: 'molly@example.test',
  phone: '',
  dogs: [],
};

beforeEach(() => {
  resetQuickCreateMocks();
  rpc.mockReset();
  useUserStore.setState({ people: [existing], users: [existing] } as never);
});

const canEditPersonCalls = () => rpc.mock.calls.filter(([fn]) => fn === 'can_edit_person');

function renderFlow() {
  return render(
    <QuickCreateFlow open onOpenChange={vi.fn()} onFlowCompleted={vi.fn()} mode="batch" />
  );
}

async function pickExistingPerson(user: ReturnType<typeof renderFlow>['user']) {
  for (const [label, value] of [
    [/First Name/i, 'Molly'],
    [/Last Name/i, 'Mailbox'],
    [/Email Address/i, 'molly@example.test'],
  ] as const) {
    await user.click(await screen.findByLabelText(label));
    await user.paste(value);
  }
  await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
  await user.click(await screen.findByRole('button', { name: 'Use This Person' }));
  await screen.findByRole('button', { name: 'Add First Dog' });
  await user.click(screen.getByRole('button', { name: 'Back' }));
  // Positive control: the person step rendered with the picked person.
  await screen.findByText('Person Added');
}

describe('Quick Create Edit Details follows people_update', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('hides Edit Details on a picked person the server will not let her change', async () => {
    rpc.mockResolvedValue({ data: false, error: null } as never);
    const { user } = renderFlow();
    await pickExistingPerson(user);

    await waitFor(() => expect(canEditPersonCalls()).toHaveLength(1));
    expect(canEditPersonCalls()[0]).toEqual([
      'can_edit_person',
      { p_person_id: 'person-existing-1' },
    ]);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Edit Details' })).not.toBeInTheDocument()
    );
  });

  it('offers Edit Details on a picked person the server lets her change', async () => {
    rpc.mockResolvedValue({ data: true, error: null } as never);
    const { user } = renderFlow();
    await pickExistingPerson(user);

    await waitFor(() => expect(canEditPersonCalls()).toHaveLength(1));
    expect(await screen.findByRole('button', { name: 'Edit Details' })).toBeInTheDocument();
  });

  it('offers Edit Details on a person made in this flow without asking', async () => {
    useUserStore.setState({ people: [], users: [] } as never);
    const { user } = renderFlow();
    await addPersonThroughForm(user);
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('button', { name: 'Edit Details' })).toBeInTheDocument();
    expect(canEditPersonCalls()).toHaveLength(0);
  });
});
