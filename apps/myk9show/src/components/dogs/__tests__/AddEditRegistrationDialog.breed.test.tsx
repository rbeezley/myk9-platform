import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddEditRegistrationDialog } from '../AddEditRegistrationDialog';
import type { Registration } from '@/types/dog-types';

// Render Dialog + Popover inline so jsdom doesn't fight portals/floating-ui.
// This isolates the behavior under test: the breed search filter (4.E).
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

const akcRegistration: Registration = {
  id: 'reg-1',
  organization: 'AKC (American Kennel Club)',
  registeredName: 'Ch Test Dog',
  breed: '',
  registrationNumber: 'SR12345',
  status: 'Active',
};

function renderDialog(initialData?: Registration) {
  return render(
    <AddEditRegistrationDialog
      open
      onOpenChange={vi.fn()}
      onSave={vi.fn()}
      initialData={initialData}
    />
  );
}

describe('AddEditRegistrationDialog breed picker (4.E — searchable)', () => {
  it('disables the breed control until an organization is chosen', () => {
    renderDialog(); // no initialData → organization empty
    const breedControl = screen.getByText(/select organization first/i).closest('button');
    expect(breedControl).toBeDisabled();
  });

  it('exposes a visible search input once an organization is selected', () => {
    renderDialog(akcRegistration);
    expect(screen.getByPlaceholderText(/search breeds/i)).toBeInTheDocument();
  });

  it('filters the breed list as the user types', () => {
    renderDialog(akcRegistration);
    // Unfiltered: unrelated breeds are present.
    expect(screen.getByText('Beagle')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search breeds/i), {
      target: { value: 'retriever' },
    });

    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
    expect(screen.getByText('Labrador Retriever')).toBeInTheDocument();
    expect(screen.queryByText('Beagle')).toBeNull();
  });

  it('shows an empty message when nothing matches', () => {
    renderDialog(akcRegistration);
    fireEvent.change(screen.getByPlaceholderText(/search breeds/i), {
      target: { value: 'zzzzznotarealbreed' },
    });
    expect(screen.getByText(/no breeds match your search/i)).toBeInTheDocument();
  });

  it('associates the required-breed error with the trigger for assistive tech', () => {
    // akcRegistration has an empty breed; submitting surfaces the breed error,
    // which must stay wired to the control via aria-invalid / aria-describedby
    // (parity with the native SelectTrigger it replaced).
    renderDialog(akcRegistration);
    fireEvent.click(screen.getByRole('button', { name: /save registration/i }));

    const trigger = document.getElementById('breed');
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAttribute('aria-describedby', 'breed-error');
    // The error node it points at exists.
    expect(document.getElementById('breed-error')).toBeInTheDocument();
  });

  it('selecting a breed updates the trigger label', () => {
    renderDialog(akcRegistration);
    fireEvent.change(screen.getByPlaceholderText(/search breeds/i), {
      target: { value: 'golden' },
    });
    fireEvent.click(screen.getByText('Golden Retriever'));
    // Trigger now reflects the chosen breed.
    expect(screen.getByRole('button', { name: 'Golden Retriever' })).toBeInTheDocument();
  });
});

// User testing: exhibitors typed a registration number before picking a
// registry, then hit a validation error for a field whose format depends on
// the registry. The organization-first rule already governed the breed picker;
// these pin it to the number field too, so the sequence is one consistent rule.
describe('AddEditRegistrationDialog registration number gating', () => {
  it('disables the registration number until an organization is chosen', () => {
    renderDialog();

    const input = document.getElementById('registrationNumber');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', 'Select organization first');
  });

  it('enables the registration number once an organization is chosen', () => {
    renderDialog(akcRegistration);

    const input = document.getElementById('registrationNumber');
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute('placeholder', 'Enter registration number');
  });
});
