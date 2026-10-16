import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import { RegistrationFormInline } from '@/components/panels/edit/AddDogPanel/RegistrationFormInline';
import AddRegistrationPanel from '../DogDetails/Registrations/AddRegistrationPanel';
import EditRegistrationPanel from '../DogDetails/Registrations/EditRegistrationPanel';
import { fillNewRegistration } from '../DogDetails/Registrations/registrationFormTestHelpers';
import type { Registration } from '@/types/dog-types';
import { RegistrationStatusField } from '../RegistrationFormBody';
import { useRegistrationEditor } from '../useRegistrationEditor';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const registration: Registration = {
  id: 'reg-1',
  organization: 'AKC (American Kennel Club)',
  registeredName: 'Ch Test Dog',
  breed: 'Beagle',
  registrationNumber: 'SR12345',
  status: 'Active',
};

describe('registration form, in-memory save contract (unsaved dog)', () => {
  it('explains that title abbreviations belong to this organization’s registered name', () => {
    render(<RegistrationFormInline initialData={registration} onSave={vi.fn()} onDone={vi.fn()} />);

    const name = screen.getByRole('textbox', { name: /Registered Name/ });
    expect(name).toHaveAttribute('aria-describedby', 'registeredName-hint');
    expect(document.getElementById('registeredName-hint')).toHaveTextContent(
      'title abbreviations you want shown for this organization'
    );
    expect(document.getElementById('registeredName-hint')).toHaveTextContent(
      'Other registrations, the Call Name, and Title Progress stay separate.'
    );
  });

  it('hands the host an in-memory Registration and then reports done', async () => {
    const onSave = vi.fn();
    const onDone = vi.fn();
    const { user } = render(
      <RegistrationFormInline initialData={registration} onSave={onSave} onDone={onDone} />
    );

    fireEvent.change(document.getElementById('registrationDate')!, {
      target: { value: '2024-03-05' },
    });
    await user.click(screen.getByRole('button', { name: /save registration/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({ ...registration, registrationDate: '2024-03-05' });
  });

  it('gives a new registration a generated id', async () => {
    const onSave = vi.fn();
    const { user } = render(
      <RegistrationFormInline
        initialData={{ ...registration, id: '' }}
        onSave={onSave}
        onDone={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /save registration/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].id).toMatch(/^reg-/);
  });

  it('refuses a registration number with characters outside letters, digits, hyphen and slash', async () => {
    const onSave = vi.fn();
    const { user } = render(
      <RegistrationFormInline
        initialData={{ ...registration, registrationNumber: 'SR 123!' }}
        onSave={onSave}
        onDone={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /save registration/i }));

    expect(
      await screen.findByText('Only letters, numbers, hyphens, and slashes are allowed.')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the form open when the async save reports failure', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    const onDone = vi.fn();

    const { user } = render(
      <RegistrationFormInline initialData={registration} onSave={onSave} onDone={onDone} />
    );

    const registeredName = screen.getByDisplayValue('Ch Test Dog');
    fireEvent.change(registeredName, { target: { value: 'Updated Test Name' } });
    await user.click(screen.getByRole('button', { name: /save registration/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ ...registration, registeredName: 'Updated Test Name' })
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Updated Test Name')).toHaveValue('Updated Test Name');
    expect(screen.getByDisplayValue('SR12345')).toHaveValue('SR12345');
    expect(screen.getByRole('button', { name: /save registration/i })).toBeEnabled();
  });

  it('blocks Cancel while a save is in flight', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveSave = resolve;
        })
    );
    const onDone = vi.fn();

    const { user } = render(
      <RegistrationFormInline initialData={registration} onSave={onSave} onDone={onDone} />
    );

    await user.click(screen.getByRole('button', { name: /save registration/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(onDone).not.toHaveBeenCalled();

    resolveSave();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});

describe('registration form, database save contract (Dog Details panels)', () => {
  it('Add saves the form data with the shared field labels and the optional Registration Date', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { user } = render(<AddRegistrationPanel open onClose={vi.fn()} onSave={onSave} />);

    await user.click(await screen.findByRole('combobox', { name: /registration organization/i }));
    await user.click(await screen.findByRole('option', { name: /AKC \(American Kennel Club\)/ }));
    await user.type(screen.getByRole('textbox', { name: /Registered Name/ }), 'CH Panel Dog');
    // The breed is the searchable combobox, not a native select.
    expect(screen.queryByRole('option', { name: 'Golden Retriever' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/search breeds/i), {
      target: { value: 'golden' },
    });
    await user.click(screen.getByRole('option', { name: 'Golden Retriever' }));
    expect(screen.getByRole('combobox', { name: /registered breed/i })).toHaveTextContent(
      'Golden Retriever'
    );
    await user.type(document.getElementById('registrationNumber')!, 'SR-123/45');
    fireEvent.change(document.getElementById('registrationDate')!, {
      target: { value: '2024-03-05' },
    });
    await user.click(screen.getByRole('button', { name: 'Add Registration' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      organization: 'AKC (American Kennel Club)',
      registeredName: 'CH Panel Dog',
      breed: 'Golden Retriever',
      registrationNumber: 'SR-123/45',
      status: 'Active',
      registrationDate: '2024-03-05',
    });
  });

  it('Add applies the same number rule as the create flow', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { user } = render(<AddRegistrationPanel open onClose={vi.fn()} onSave={onSave} />);

    await user.click(await screen.findByRole('combobox', { name: /registration organization/i }));
    await user.click(await screen.findByRole('option', { name: /AKC \(American Kennel Club\)/ }));
    await user.type(screen.getByRole('textbox', { name: /Registered Name/ }), 'CH Panel Dog');
    fireEvent.change(screen.getByPlaceholderText(/search breeds/i), {
      target: { value: 'beagle' },
    });
    await user.click(screen.getByRole('option', { name: 'Beagle' }));
    await user.type(document.getElementById('registrationNumber')!, 'SR 123!');
    await user.click(screen.getByRole('button', { name: 'Add Registration' }));

    expect(
      await screen.findByText('Only letters, numbers, hyphens, and slashes are allowed.')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Edit opens a stored registration and saves it back with its id', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { user } = render(
      <EditRegistrationPanel
        open
        onClose={vi.fn()}
        onSave={onSave}
        registration={{ ...registration, registrationDate: '2023-01-02' }}
      />
    );

    expect(screen.getByDisplayValue('SR12345')).toBeInTheDocument();
    expect(document.getElementById('registrationDate')).toHaveValue('2023-01-02');
    expect(screen.getByRole('combobox', { name: /registered breed/i })).toHaveTextContent('Beagle');

    fireEvent.change(screen.getByDisplayValue('Ch Test Dog'), {
      target: { value: 'Updated Test Name' },
    });
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      id: 'reg-1',
      registeredName: 'Updated Test Name',
      registrationNumber: 'SR12345',
      breed: 'Beagle',
      registrationDate: '2023-01-02',
    });
  });

  it('Edit keeps a lowercase stored status instead of rewriting it to Active', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { user } = render(
      <EditRegistrationPanel
        open
        onClose={vi.fn()}
        onSave={onSave}
        registration={
          {
            id: 'reg-9',
            organization: 'AKC (American Kennel Club)',
            registered_name: 'Ch Snake Dog',
            breed: 'Beagle',
            registration_number: 'SR777',
            status: 'pending',
          } as never
        }
      />
    );

    expect(document.getElementById('registrationStatus')).toHaveTextContent('pending');
    fireEvent.change(screen.getByDisplayValue('Ch Snake Dog'), {
      target: { value: 'Ch Snake Dog II' },
    });
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      id: 'reg-9',
      status: 'pending',
    });
  });

  it('cannot be closed with Escape while a save is in flight (the wizard host)', async () => {
    const onSave = vi.fn(() => new Promise<void>(() => {}));
    const onClose = vi.fn();
    const { user } = render(
      <AddRegistrationPanel open onClose={onClose} onSave={onSave} announceSaved={false} />
    );

    await fillNewRegistration(user);
    await user.click(screen.getByRole('button', { name: 'Add Registration' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
    // EditPanelWrapper holds still and says why; the panel stays mounted behind it.
    expect(await screen.findByRole('alertdialog', { name: 'Still saving' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Add Registration', hidden: true })
    ).toBeInTheDocument();
  });
});

it('shows a stored legacy organization without replacing its identity', () => {
  render(
    <EditRegistrationPanel
      open
      onClose={vi.fn()}
      onSave={vi.fn()}
      registration={{
        id: 'asca-1',
        organization: 'ASCA (Australian Shepherd Club of America)',
        registered_name: 'ASCA Dog',
        registration_number: 'E123',
        breed: 'Beagle',
        status: 'Active',
      }}
    />
  );
  expect(screen.getByRole('combobox', { name: /Registration Organization/i })).toHaveTextContent(
    'ASCA (Australian Shepherd Club of America)'
  );
});

it.each(['approved', 'suspended', 'rejected'])(
  'shows the stored %s status and deliberately changes it to Active in memory',
  async status => {
    const onSave = vi.fn();
    const initialData = { ...registration, status };
    function StatusSaveHarness() {
      const editor = useRegistrationEditor({
        initialData,
        onSave,
        onSaved: vi.fn(),
      });
      return (
        <>
          <RegistrationStatusField editor={editor} />
          <button onClick={editor.handleSubmit}>Save registration</button>
        </>
      );
    }
    const { user } = render(<StatusSaveHarness />);
    const picker = screen.getByRole('combobox', { name: 'Status' });
    expect(picker).toHaveTextContent(status);
    await user.click(picker);
    await user.click(await screen.findByRole('option', { name: 'Active' }));
    await user.click(screen.getByRole('button', { name: /save registration/i }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: 'Active' }))
    );
  }
);
