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
});
