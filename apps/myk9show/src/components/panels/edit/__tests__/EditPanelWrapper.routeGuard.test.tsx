import { useState } from 'react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
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
