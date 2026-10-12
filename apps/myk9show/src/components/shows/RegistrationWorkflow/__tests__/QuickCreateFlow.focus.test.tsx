/**
 * MYK9-1081 §7.2: keyboard, focus and Escape inside Quick Create's one
 * slide-out, mirroring ManageRegistrationsPanel.mode.test.tsx (MYK9-1089) and
 * the Message Center compose mode (MYK9-1088). Leaving a form returns to the
 * step screen, never out of the modal; focus always lands inside the panel.
 */
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useUserStore } from '@/store/userStore';
import { QuickCreateFlow } from '../QuickCreateFlow';
import { resetQuickCreateMocks } from '@/test/quickCreate/quickCreateFlowMocks';
import {
  addPersonThroughForm,
  fillDogBasics,
  fillRegistration,
  panel,
} from '@/test/quickCreate/quickCreateFlowKit';

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

beforeEach(() => {
  resetQuickCreateMocks();
  useUserStore.setState({ people: [], users: [] });
});

function Harness({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        reopen
      </button>
      <QuickCreateFlow
        open={open}
        onOpenChange={next => {
          onOpenChange(next);
          setOpen(next);
        }}
        onFlowCompleted={vi.fn()}
        mode="batch"
      />
    </>
  );
}

function renderHarness() {
  const onOpenChange = vi.fn();
  return { onOpenChange, ...render(<Harness onOpenChange={onOpenChange} />) };
}

const firstName = () => screen.getByLabelText(/First Name/i);
const button = (name: string | RegExp) => screen.getByRole('button', { name });
/** Base UI hands focus back in a microtask after a prompt unmounts; let it run. */
const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 50)));

async function toDogForm(user: ReturnType<typeof render>['user']) {
  await addPersonThroughForm(user);
  await user.click(await screen.findByRole('button', { name: 'Add First Dog' }));
  await fillDogBasics(user);
}

describe('opening and Escape', () => {
  it('opening focuses First Name', async () => {
    renderHarness();
    await waitFor(() => expect(firstName()).toHaveFocus());
  });

  it('Escape on a clean form returns to the Person step; a second Escape closes', async () => {
    const { user, onOpenChange } = renderHarness();
    await waitFor(() => expect(firstName()).toHaveFocus());

    await user.keyboard('{Escape}');
    await waitFor(() => expect(button('Add Person')).toHaveFocus());
    expect(panel()).not.toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Escape on a step screen keeps progress for the next open (D5)', async () => {
    const { user, onOpenChange } = renderHarness();
    await addPersonThroughForm(user);
    await screen.findByRole('heading', { name: 'Add Dog(s)' });

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(panel()).toBeNull());

    await user.click(button('reopen'));
    expect(await screen.findByRole('heading', { name: 'Add Dog(s)' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/First Name/i)).toBeNull();
  });
});

describe('a dirty form asks before leaving', () => {
  it.each([
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['header Back', () => fireEvent.click(button('Back'))],
    ['X', () => fireEvent.click(button('Close panel'))],
    ['the backdrop', () => fireEvent.click(panel()?.parentElement as HTMLElement)],
  ])('%s raises the discard prompt and keeps the typed value', async (_label, leave) => {
    const { user } = renderHarness();
    await user.type(await screen.findByLabelText(/First Name/i), 'Mol');

    leave();

    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(firstName()).toHaveValue('Mol');
  });

  it('Keep editing stays in the form', async () => {
    const { user } = renderHarness();
    await user.type(await screen.findByLabelText(/First Name/i), 'Mol');
    await user.click(button('Back'));
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));

    await waitFor(() => expect(screen.queryByText('Discard changes?')).toBeNull());
    expect(firstName()).toHaveValue('Mol');
    expect(screen.getByRole('heading', { name: 'Add Person', level: 2 })).toBeInTheDocument();
  });

  it('Discard returns to the step screen with focus inside the panel', async () => {
    const { user } = renderHarness();
    await user.type(await screen.findByLabelText(/First Name/i), 'Mol');
    await user.click(button('Back'));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));

    expect(
      await screen.findByRole('heading', { name: 'Quick Registration Setup' })
    ).toBeInTheDocument();
    await settle();
    expect(button('Add Person')).toHaveFocus();
    expect(panel()).toContainElement(document.activeElement as HTMLElement);
  });

  it('Escape on the prompt answers the prompt and does not re-raise it', async () => {
    const { user } = renderHarness();
    await user.type(await screen.findByLabelText(/First Name/i), 'Mol');
    await user.keyboard('{Escape}');
    await screen.findByText('Discard changes?');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByText('Discard changes?')).toBeNull());
    expect(firstName()).toHaveValue('Mol');
  });

  it('after Discard focus stays in the panel even when an earlier popup was used', async () => {
    const { user } = renderHarness();
    // toDogForm opens and closes the Sex Select: Base UI's focus history now
    // holds its trigger, the stale target a discarded form must not reach.
    await toDogForm(user);
    await user.click(button('Back'));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));

    await screen.findByRole('heading', { name: 'Add Dog(s)' });
    await settle();
    expect(button('Add First Dog')).toHaveFocus();
  });
});

describe('the registration sub-mode inside Add Dog', () => {
  async function toRegistrationForm(user: ReturnType<typeof render>['user']) {
    await toDogForm(user);
    await user.click(screen.getByRole('tab', { name: /Registration/ }));
    await user.click(await screen.findByRole('button', { name: /Add New Registration/ }));
    await screen.findByLabelText(/Registered Name/i);
  }

  it.each([
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['Back', () => fireEvent.click(button('Back'))],
  ])(
    '%s returns to the dog form with its values, focus on Add New Registration',
    async (_l, leave) => {
      const { user } = renderHarness();
      await toRegistrationForm(user);
      expect(screen.getByRole('heading', { name: 'Add New Registration' })).toBeInTheDocument();

      leave();

      await waitFor(() => expect(button(/Add New Registration/)).toHaveFocus());
      expect(screen.getByRole('heading', { name: 'Add Dog' })).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: /Essential/ }));
      expect(screen.getByLabelText(/Call Name/i)).toHaveValue('Ziggy');
    }
  );

  it('leaving an Edit puts focus on that row’s Edit button', async () => {
    const { user } = renderHarness();
    await toRegistrationForm(user);
    await fillRegistration(user);
    const edit = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-edit-registration]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });

    await user.click(edit);
    expect(await screen.findByRole('heading', { name: 'Edit Registration' })).toBeInTheDocument();
    await user.click(button('Back'));

    await waitFor(() => expect(edit).toHaveFocus());
  });

  it('Tab wraps between the first and last VISIBLE controls', async () => {
    const { user } = renderHarness();
    await toRegistrationForm(user);
    const back = button('Back');
    const save = button('Save Registration');

    save.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(back).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();
    expect(panel()).toContainElement(document.activeElement as HTMLElement);
  });
});

describe('after a save', () => {
  it('after the person saves, Add First Dog has focus', async () => {
    const { user } = renderHarness();
    await addPersonThroughForm(user);
    await waitFor(() => expect(button('Add First Dog')).toHaveFocus());
  });

  it('after the dog saves, Add Another Dog has focus', async () => {
    const { user } = renderHarness();
    await toDogForm(user);
    await user.click(button(/Next: Registration/));
    await user.click(await screen.findByRole('button', { name: /Next: Optional details/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Dog' }));

    await waitFor(() => expect(button('Add Another Dog')).toHaveFocus());
  });
});
