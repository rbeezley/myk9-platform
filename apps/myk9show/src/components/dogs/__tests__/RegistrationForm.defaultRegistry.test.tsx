import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { RegistrationFormInline } from '@/components/panels/edit/AddDogPanel/RegistrationFormInline';
import type { Registration } from '@/types/dog-types';
import { initialRegistrationData } from '../registrationForm';

const UKC_LABEL = 'UKC (United Kennel Club)';

describe('initialRegistrationData (MYK9-832)', () => {
  it('starts a UKC show on the UKC label', () => {
    expect(initialRegistrationData('UKC').organization).toBe(UKC_LABEL);
  });

  it('leaves the organization empty with no or an unknown registry', () => {
    expect(initialRegistrationData().organization).toBe('');
    expect(initialRegistrationData(null).organization).toBe('');
    expect(initialRegistrationData('NACSW').organization).toBe('');
  });
});

describe('registration form organization on a UKC show (MYK9-832)', () => {
  const organizationTrigger = () =>
    screen.getByRole('combobox', { name: /Registration Organization/ });

  it('starts a new registration on the show registry, not AKC', () => {
    render(<RegistrationFormInline defaultRegistryId="UKC" onSave={vi.fn()} onDone={vi.fn()} />);
    expect(organizationTrigger()).toHaveTextContent(UKC_LABEL);
  });

  it('keeps an existing registration on its own organization', () => {
    const existing: Registration = {
      id: 'reg-1',
      organization: 'AKC (American Kennel Club)',
      registeredName: 'Ch Test Dog',
      breed: 'Beagle',
      registrationNumber: 'SR12345',
      status: 'Active',
    };
    render(
      <RegistrationFormInline
        initialData={existing}
        defaultRegistryId="UKC"
        onSave={vi.fn()}
        onDone={vi.fn()}
      />
    );
    expect(organizationTrigger()).toHaveTextContent('AKC (American Kennel Club)');
  });
});
