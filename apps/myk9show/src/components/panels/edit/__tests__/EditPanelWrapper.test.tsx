import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';

const testSchema = z.object({
  name: z.string().min(1, 'Please enter a name'),
});

const multiErrorSchema = z.object({
  name: z.string().min(1, 'Please enter a name'),
  breed: z.string().min(1, 'Please enter a breed'),
  sex: z.string().min(1, 'Please select a sex'),
});

function TestFormFields() {
  const { form } = useEditPanel<{ name: string }>();
  if (!form) return null;
  return (
    <FormField label="Name" required error={form.getError('name')} fieldId="name">
      <Input
        id="name"
        value={form.data.name}
        onChange={e => form.setValue('name', e.target.value)}
        onBlur={() => form.touchField('name')}
        {...form.getFieldProps('name')}
      />
    </FormField>
  );
}

function MultiErrorFormFields() {
  const { form } = useEditPanel<{ name: string; breed: string; sex: string }>();
  if (!form) return null;

  return (
    <>
      <Input aria-label="Name" value={form.data.name} readOnly />
      <Input aria-label="Breed" value={form.data.breed} readOnly />
      <Input aria-label="Sex" value={form.data.sex} readOnly />
    </>
  );
}

describe('EditPanelWrapper with schema', () => {
  it('exposes form on context when schema is provided', () => {
    render(
      <EditPanelWrapper
        open={true}
        onClose={vi.fn()}
        title="Test"
        initialData={{ name: '' }}
        schema={testSchema}
        onSave={vi.fn()}
        forceHasChanges
      >
        <TestFormFields />
      </EditPanelWrapper>
    );
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it('Save button is not disabled when form has errors', () => {
    render(
      <EditPanelWrapper
        open={true}
        onClose={vi.fn()}
        title="Test"
        initialData={{ name: '' }}
        schema={testSchema}
        onSave={vi.fn()}
        forceHasChanges
      >
        <TestFormFields />
      </EditPanelWrapper>
    );
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).not.toBeDisabled();
  });

  it('does not call onSave when form is invalid', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <EditPanelWrapper
        open={true}
        onClose={vi.fn()}
        title="Test"
        initialData={{ name: '' }}
        schema={testSchema}
        onSave={onSave}
        forceHasChanges
      >
        <TestFormFields />
      </EditPanelWrapper>
    );
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('closes force-enabled create forms without showing a discard dialog when unchanged', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <EditPanelWrapper
        open={true}
        onClose={onClose}
        title="Test"
        initialData={{ name: '' }}
        schema={testSchema}
        onSave={vi.fn()}
        forceHasChanges
        variant="dialog"
      >
        <TestFormFields />
      </EditPanelWrapper>
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText(/discard changes/i)).not.toBeInTheDocument();
  });

  it.each([390, 320])(
    'keeps the complete action group prioritized at %ipx',
    async viewportWidth => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: viewportWidth,
      });

      render(
        <EditPanelWrapper
          open
          onClose={vi.fn()}
          title="Test"
          initialData={{ name: 'Original' }}
          schema={testSchema}
          onSave={vi.fn()}
          variant="dialog"
        >
          <TestFormFields />
        </EditPanelWrapper>
      );

      const user = userEvent.setup();
      await user.clear(screen.getByRole('textbox', { name: /name/i }));
      await user.type(screen.getByRole('textbox', { name: /name/i }), 'Updated');

      expect(screen.getByTestId('edit-panel-action-row')).toHaveClass('flex-wrap', 'gap-y-2');
      expect(screen.getByTestId('edit-panel-status-group')).toHaveClass('min-w-0');
      expect(screen.getByTestId('edit-panel-action-group')).toHaveClass('shrink-0');
      expect(screen.getByText('Unsaved changes')).toHaveClass('hidden', 'sm:inline');
      expect(screen.getByRole('button', { name: 'Save Changes' })).toHaveTextContent(
        'Save Changes'
      );
    }
  );

  it('renders a complete, expandable validation summary above the action row', async () => {
    const user = userEvent.setup();
    render(
      <EditPanelWrapper
        open
        onClose={vi.fn()}
        title="Test"
        initialData={{ name: '', breed: '', sex: '' }}
        schema={multiErrorSchema}
        onSave={vi.fn()}
        forceHasChanges
        variant="dialog"
      >
        <MultiErrorFormFields />
      </EditPanelWrapper>
    );

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const summary = screen.getByRole('alert');
    const actionRow = screen.getByTestId('edit-panel-action-row');
    expect(
      summary.compareDocumentPosition(actionRow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText(/Please enter a name/)).toBeInTheDocument();
    expect(screen.getByText(/Please enter a breed/)).toBeInTheDocument();
    expect(screen.queryByText(/Please select a sex/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show 1 more error/i }));

    expect(screen.getByText(/Please select a sex/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show fewer errors/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });
});
