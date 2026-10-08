import { useState } from 'react';
import { createMemoryRouter, Link, Outlet, RouterProvider, useNavigate } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UnsavedChangesRouteGuardProvider } from '@/components/navigation/UnsavedChangesRouteGuard';
import {
  CreatedInSessionProvider,
  useCreatedInSession,
} from '@/components/shows/RegistrationWorkflow/CreatedInSessionContext';
import type { Dog, User } from '@/types/dog-types';
import { WizardLeaveGuard } from './WizardLeaveGuard';

const deleteRecord = vi.fn();

const owner = (id: string, firstName: string, lastName: string) =>
  ({ id, firstName, lastName }) as User;
const dog = (id: string, callName: string, ownerId: string) =>
  ({ id, name: `${callName} Registered`, callName, ownerId }) as Dog;

/** Stands in for the wizard page: creates records, submits, and has exits. */
function FakeWizard() {
  const session = useCreatedInSession();
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  return (
    <>
      <WizardLeaveGuard submitted={submitted} />
      <button onClick={() => session?.recordOwnerCreated(owner('o1', 'Pat', 'Lee'))}>
        create owner
      </button>
      <button onClick={() => session?.recordDogCreated(dog('d1', 'Cracker', 'o1'))}>
        create dog
      </button>
      <button onClick={() => session?.recordDogCreated(dog('d2', 'Maple', 'o1'))}>
        create second dog
      </button>
      <button onClick={() => setSubmitted(true)}>submit</button>
      <button onClick={() => setSubmitted(false)}>go to earlier step</button>
      <button onClick={() => navigate('/secretary/register/s1?dogId=d9', { replace: true })}>
        clear handoff
      </button>
      <Link to="/elsewhere">Back to show</Link>
    </>
  );
}

function renderWizard(initialEntry = '/secretary/register/s1') {
  const router = createMemoryRouter(
    [
      {
        // Inside the router, as in App: the provider needs the data-router context.
        element: (
          <UnsavedChangesRouteGuardProvider>
            <CreatedInSessionProvider>
              <Outlet />
            </CreatedInSessionProvider>
          </UnsavedChangesRouteGuardProvider>
        ),
        children: [
          { path: '/secretary/register/:showId', element: <FakeWizard /> },
          { path: '/elsewhere', element: <div>Elsewhere page</div> },
        ],
      },
    ],
    { initialEntries: [initialEntry] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

function fireBeforeUnload() {
  const event = new Event('beforeunload', { cancelable: true });
  act(() => {
    window.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

describe('WizardLeaveGuard (MYK9-1058)', () => {
  it('names the dog created in this session when she leaves before an entry exists', async () => {
    const user = userEvent.setup();
    const router = renderWizard();
    await user.click(screen.getByText('create dog'));
    await user.click(screen.getByText('Back to show'));

    expect(await screen.findByText('Cracker has no entry yet.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/secretary/register/s1');
  });

  it('names an owner who was created without a dog', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByText('create owner'));
    await user.click(screen.getByText('Back to show'));

    expect(await screen.findByText('Pat Lee has no entry yet.')).toBeInTheDocument();
  });

  it('names every dog created, and the dog rather than its owner', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByText('create owner'));
    await user.click(screen.getByText('create dog'));
    await user.click(screen.getByText('create second dog'));
    await user.click(screen.getByText('Back to show'));

    expect(await screen.findByText('Cracker and Maple have no entry yet.')).toBeInTheDocument();
  });

  it('"Finish entry" stays on the wizard', async () => {
    const user = userEvent.setup();
    const router = renderWizard();
    await user.click(screen.getByText('create dog'));
    await user.click(screen.getByText('Back to show'));
    await user.click(await screen.findByRole('button', { name: 'Finish entry' }));

    expect(router.state.location.pathname).toBe('/secretary/register/s1');
    expect(screen.queryByText('Cracker has no entry yet.')).not.toBeInTheDocument();
  });

  it('"Leave without entry" navigates and deletes nothing', async () => {
    const user = userEvent.setup();
    const router = renderWizard();
    await user.click(screen.getByText('create dog'));
    await user.click(screen.getByText('Back to show'));
    await user.click(await screen.findByRole('button', { name: 'Leave without entry' }));

    expect(router.state.location.pathname).toBe('/elsewhere');
    expect(deleteRecord).not.toHaveBeenCalled();
  });

  it('prompts on browser Back too', async () => {
    const user = userEvent.setup();
    const router = renderWizard('/secretary/register/s1');
    await act(async () => {
      await router.navigate('/elsewhere');
    });
    await act(async () => {
      await router.navigate(-1);
    });
    await user.click(screen.getByText('create dog'));
    await act(async () => {
      await router.navigate(1);
    });

    expect(await screen.findByText('Cracker has no entry yet.')).toBeInTheDocument();
  });

  it('does not prompt after a submit', async () => {
    const user = userEvent.setup();
    const router = renderWizard();
    await user.click(screen.getByText('create dog'));
    await user.click(screen.getByText('submit'));
    await user.click(screen.getByText('Back to show'));

    expect(router.state.location.pathname).toBe('/elsewhere');
    expect(screen.queryByText('Cracker has no entry yet.')).not.toBeInTheDocument();
    expect(fireBeforeUnload()).toBe(false);
  });

  it('stays quiet after a submit even when she clicks back to an earlier step', async () => {
    const user = userEvent.setup();
    const router = renderWizard();
    await user.click(screen.getByText('create dog'));
    await user.click(screen.getByText('submit'));
    await user.click(screen.getByText('go to earlier step'));
    await user.click(screen.getByText('Back to show'));

    expect(router.state.location.pathname).toBe('/elsewhere');
    expect(fireBeforeUnload()).toBe(false);
  });

  it('does not prompt when nothing was created in this session', async () => {
    const user = userEvent.setup();
    const router = renderWizard();
    await user.click(screen.getByText('Back to show'));

    expect(router.state.location.pathname).toBe('/elsewhere');
    expect(fireBeforeUnload()).toBe(false);
  });

  it('does not prompt for a same-page change such as clearing the ?dogId handoff', async () => {
    const user = userEvent.setup();
    const router = renderWizard();
    await user.click(screen.getByText('create dog'));
    await user.click(screen.getByText('clear handoff'));

    expect(router.state.location.search).toBe('?dogId=d9');
    expect(screen.queryByText('Cracker has no entry yet.')).not.toBeInTheDocument();
  });

  it('asks the browser to confirm closing the tab once a record was created', async () => {
    const user = userEvent.setup();
    renderWizard();
    expect(fireBeforeUnload()).toBe(false);
    await user.click(screen.getByText('create dog'));

    expect(fireBeforeUnload()).toBe(true);
  });

  it('guards the show-desk late-entry variant, and a queued offline submit clears it', async () => {
    const user = userEvent.setup();
    const router = renderWizard('/secretary/register/s1?source=show-desk&entryMode=late');
    await user.click(screen.getByText('create dog'));
    await user.click(screen.getByText('Back to show'));
    expect(await screen.findByText('Cracker has no entry yet.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Finish entry' }));
    // The offline writer advances to the receipt step exactly as the online one does.
    await user.click(screen.getByText('submit'));
    await user.click(screen.getByText('Back to show'));

    expect(router.state.location.pathname).toBe('/elsewhere');
    expect(fireBeforeUnload()).toBe(false);
  });
});
