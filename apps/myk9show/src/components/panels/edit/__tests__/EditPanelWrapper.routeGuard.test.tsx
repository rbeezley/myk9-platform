import { useState, type ReactNode } from 'react';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';
import {
  UnsavedChangesRouteGuard,
  UnsavedChangesRouteGuardProvider,
} from '@/components/navigation/UnsavedChangesRouteGuard';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';

const testSchema = z.object({
  name: z.string().min(1, 'Please enter a name'),
});

function TestFormFields() {
  const { form } = useEditPanel<{ name: string }>();
  if (!form) return null;

  return (
    <FormField label="Name" required error={form.getError('name')} fieldId="name">
      <Input
        id="name"
        value={form.data.name}
        onChange={event => form.setValue('name', event.target.value)}
        {...form.getFieldProps('name')}
      />
    </FormField>
  );
}

function DirtyEditPage() {
  const [open, setOpen] = useState(true);

  return (
    <EditPanelWrapper
      open={open}
      onClose={() => setOpen(false)}
      title="Dog details"
      initialData={{ name: 'Original name' }}
      schema={testSchema}
      onSave={vi.fn()}
      variant="dialog"
      footerActions={<Link to="/next">Leave form</Link>}
    >
      <TestFormFields />
    </EditPanelWrapper>
  );
}

/**
 * Mirrors BrowseDogsPage: the panel's own close and save paths issue a router
 * navigation (dropping `?add=true`, then routing to the created record). The
 * navigation happens synchronously inside the callbacks the panel invokes.
 */
function SelfNavigatingEditPage() {
  const [open, setOpen] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  return (
    <>
      <p>Add form page</p>
      <EditPanelWrapper
        open={open}
        onClose={() => {
          setOpen(false);
          const params = new URLSearchParams(searchParams);
          params.delete('add');
          setSearchParams(params, { replace: true });
        }}
        title="Dog details"
        initialData={{ name: 'Original name' }}
        schema={testSchema}
        onSave={(_data, { runSelfNavigation }) => {
          // Mirrors AddDogPanel: the save routes to the record it just created.
          runSelfNavigation(() => navigate('/next'));
        }}
        variant="dialog"
      >
        <TestFormFields />
      </EditPanelWrapper>
    </>
  );
}

function createTestRouter() {
  return createMemoryRouter(
    [
      { path: '/edit', element: <DirtyEditPage /> },
      { path: '/next', element: <p>Next page</p> },
    ],
    { initialEntries: ['/edit'] }
  );
}

function MultipleDirtyFormsPage() {
  return (
    <UnsavedChangesRouteGuardProvider>
      <UnsavedChangesRouteGuard isDirty subject="first form" />
      <UnsavedChangesRouteGuard isDirty subject="second form" />
      <Link to="/next">Leave forms</Link>
    </UnsavedChangesRouteGuardProvider>
  );
}

function FailingSaveEditPage() {
  const [failed, setFailed] = useState(false);

  return (
    <EditPanelWrapper
      open
      onClose={vi.fn()}
      title="Dog details"
      initialData={{ name: 'Original name' }}
      schema={testSchema}
      onSave={() => {
        setFailed(true);
        throw new Error('save failed');
      }}
      variant="dialog"
      footerActions={
        <>
          {failed && <span>Save failed</span>}
          <Link to="/next">Leave form</Link>
        </>
      }
    >
      <TestFormFields />
    </EditPanelWrapper>
  );
}

function SlowSaveEditPage({ onSaveStarted }: { onSaveStarted: (release: () => void) => void }) {
  const [saving, setSaving] = useState(false);

  return (
    <EditPanelWrapper
      open
      onClose={vi.fn()}
      title="Dog details"
      initialData={{ name: 'Original name' }}
      schema={testSchema}
      onSave={() => {
        setSaving(true);
        return new Promise<void>(resolve => onSaveStarted(resolve));
      }}
      variant="dialog"
      footerActions={
        <>
          {saving && <span>Saving in progress</span>}
          <Link to="/next">Leave form</Link>
        </>
      }
    >
      <TestFormFields />
    </EditPanelWrapper>
  );
}

const BLOCKER_PATHS = [
  ['standalone guard', ({ children }: { children: ReactNode }) => <>{children}</>],
  ['registry provider', UnsavedChangesRouteGuardProvider],
] as const;

describe.each(BLOCKER_PATHS)('EditPanelWrapper self-navigation (%s)', (_label, Wrapper) => {
  function createSelfNavigatingRouter() {
    return createMemoryRouter(
      [
        {
          path: '/edit',
          element: (
            <Wrapper>
              <SelfNavigatingEditPage />
            </Wrapper>
          ),
        },
        { path: '/next', element: <p>Next page</p> },
      ],
      { initialEntries: ['/edit?add=true'] }
    );
  }

  it('closes after a single discard confirmation when closing navigates', async () => {
    const user = userEvent.setup();
    render(<RouterProvider router={createSelfNavigatingRouter()} />);

    const input = screen.getByRole('textbox', { name: /name/i });
    await user.clear(input);
    await user.type(input, 'U');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await user.click(await screen.findByRole('button', { name: /discard changes/i }));

    // Match any route-guard heading, not just this subject: a guard that blocks
    // as its form goes clean falls back to "Leave this page?".
    expect(screen.queryByRole('heading', { name: /^leave /i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /name/i })).not.toBeInTheDocument();
  });

  it('still guards route leave after a failed save', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/edit',
          element: (
            <Wrapper>
              <FailingSaveEditPage />
            </Wrapper>
          ),
        },
        { path: '/next', element: <p>Next page</p> },
      ],
      { initialEntries: ['/edit'] }
    );
    render(<RouterProvider router={router} />);

    const input = screen.getByRole('textbox', { name: /name/i });
    await user.clear(input);
    await user.type(input, 'U');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText(/save failed/i);

    await user.click(screen.getByRole('link', { name: /leave form/i }));

    expect(await screen.findByRole('heading', { name: /leave dog details/i })).toBeInTheDocument();
    expect(screen.queryByText('Next page')).not.toBeInTheDocument();
  });

  it('keeps guarding while a slow save is in flight', async () => {
    const user = userEvent.setup();
    let releaseSave: (() => void) | undefined;
    const router = createMemoryRouter(
      [
        {
          path: '/edit',
          element: (
            <Wrapper>
              <SlowSaveEditPage onSaveStarted={release => (releaseSave = release)} />
            </Wrapper>
          ),
        },
        { path: '/next', element: <p>Next page</p> },
      ],
      { initialEntries: ['/edit'] }
    );
    render(<RouterProvider router={router} />);

    const input = screen.getByRole('textbox', { name: /name/i });
    await user.clear(input);
    await user.type(input, 'U');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText(/saving in progress/i);

    // The save has not resolved: a navigation now must still warn, because the
    // request can still fail and the edit is not yet safe.
    await user.click(screen.getByRole('link', { name: /leave form/i }));
    expect(await screen.findByRole('heading', { name: /^leave /i })).toBeInTheDocument();
    expect(screen.queryByText('Next page')).not.toBeInTheDocument();

    releaseSave?.();
  });

  it('does not prompt when a successful save navigates away', async () => {
    const user = userEvent.setup();
    render(<RouterProvider router={createSelfNavigatingRouter()} />);

    const input = screen.getByRole('textbox', { name: /name/i });
    await user.clear(input);
    await user.type(input, 'U');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Next page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^leave /i })).not.toBeInTheDocument();
  });
});

describe('EditPanelWrapper self-navigation context', () => {
  // The capability AddDogPanel's "Use existing dog" button relies on: a child
  // of the panel adopting an existing record navigates without a second prompt.
  function ChildNavigatesPage() {
    return (
      <EditPanelWrapper
        open
        onClose={vi.fn()}
        title="Dog details"
        initialData={{ name: 'Original name' }}
        schema={testSchema}
        onSave={vi.fn()}
        variant="dialog"
      >
        <TestFormFields />
        <AdoptExistingButton />
      </EditPanelWrapper>
    );
  }

  function AdoptExistingButton() {
    const { runSelfNavigation } = useEditPanel<{ name: string }>();
    const navigate = useNavigate();

    return (
      <button onClick={() => runSelfNavigation(() => navigate('/next'))}>Use existing dog</button>
    );
  }

  it("lets a child navigate on the panel's behalf without a route prompt", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { path: '/edit', element: <ChildNavigatesPage /> },
        { path: '/next', element: <p>Next page</p> },
      ],
      { initialEntries: ['/edit'] }
    );
    render(<RouterProvider router={router} />);

    const input = screen.getByRole('textbox', { name: /name/i });
    await user.clear(input);
    await user.type(input, 'U');
    await user.click(screen.getByRole('button', { name: /use existing dog/i }));

    expect(await screen.findByText('Next page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^leave /i })).not.toBeInTheDocument();
  });
});

describe('EditPanelWrapper route guard', () => {
  it('keeps a dirty edit in place until the user chooses to discard it', async () => {
    const user = userEvent.setup();
    render(<RouterProvider router={createTestRouter()} />);

    const input = screen.getByRole('textbox', { name: /name/i });
    await user.clear(input);
    await user.type(input, 'Updated name');
    await user.click(screen.getByRole('link', { name: /leave form/i }));

    expect(await screen.findByRole('heading', { name: /leave dog details/i })).toBeInTheDocument();
    expect(screen.getByText(/unsaved changes in dog details/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(screen.getByDisplayValue('Updated name')).toBeInTheDocument();
    expect(screen.queryByText('Next page')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /leave form/i }));
    await user.click(screen.getByRole('button', { name: /discard changes/i }));

    expect(await screen.findByText('Next page')).toBeInTheDocument();
  });

  it('uses the panel cancel dialog without showing the route dialog', async () => {
    const user = userEvent.setup();
    render(<RouterProvider router={createTestRouter()} />);

    const input = screen.getByRole('textbox', { name: /name/i });
    await user.clear(input);
    await user.type(input, 'Updated name');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(await screen.findByRole('heading', { name: /discard changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /leave dog details/i })).not.toBeInTheDocument();
  });

  it('aggregates multiple dirty forms behind one route blocker', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { path: '/edit', element: <MultipleDirtyFormsPage /> },
        { path: '/next', element: <p>Next page</p> },
      ],
      { initialEntries: ['/edit'] }
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('link', { name: /leave forms/i }));

    expect(await screen.findByRole('heading', { name: /leave first form/i })).toBeInTheDocument();
    expect(screen.queryByText('Next page')).not.toBeInTheDocument();
  });
});
