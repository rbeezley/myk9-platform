import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import { AddEditRegistrationDialog } from '../AddEditRegistrationDialog';
import type { Registration } from '@/types/dog-types';

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

describe('AddEditRegistrationDialog save recovery', () => {
  it('keeps the editor open when the async save reports failure', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    const onOpenChange = vi.fn();

    const { user } = render(
      <AddEditRegistrationDialog
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
        initialData={registration}
      />
    );

    const registeredName = screen.getByDisplayValue('Ch Test Dog');
    fireEvent.change(registeredName, { target: { value: 'Updated Test Name' } });
    await user.click(screen.getByRole('button', { name: /save registration/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ ...registration, registeredName: 'Updated Test Name' })
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByDisplayValue('Updated Test Name')).toHaveValue('Updated Test Name');
    expect(screen.getByDisplayValue('SR12345')).toHaveValue('SR12345');
    expect(screen.getByRole('button', { name: /save registration/i })).toBeEnabled();
  });

  it('prevents closing the editor while a save is in flight', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveSave = resolve;
        })
    );
    const onOpenChange = vi.fn();

    const { user } = render(
      <AddEditRegistrationDialog
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
        initialData={registration}
      />
    );

    await user.click(screen.getByRole('button', { name: /save registration/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    resolveSave();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
