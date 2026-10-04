import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import {
  StepProfile,
  missingAddressMessage,
  personNeedsAddress,
  profileDataFromPerson,
} from '../StepProfile';
import type { ProfileData } from '../StepProfile';

const defaultData: ProfileData = {
  firstName: '',
  lastName: '',
  phone: '',
  streetAddress: '',
  city: '',
  state: '',
  zipCode: '',
};

function makeProps(overrides = {}) {
  return {
    data: defaultData,
    email: 'test@example.com',
    onChange: vi.fn(),
    onNext: vi.fn(),
    isSubmitting: false,
    error: '',
    ...overrides,
  };
}

describe('StepProfile', () => {
  it('renders the profile form', () => {
    render(<StepProfile {...makeProps()} />);
    expect(screen.getByTestId('step-profile')).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
  });

  it('shows the email as a disabled field', () => {
    render(<StepProfile {...makeProps()} />);
    const emailInput = screen.getByDisplayValue('test@example.com');
    expect(emailInput).toBeDisabled();
  });

  it('calls onChange when first name is typed', () => {
    const onChange = vi.fn();
    render(<StepProfile {...makeProps({ onChange })} />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Alice' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultData, firstName: 'Alice' });
  });

  it('calls onChange when last name is typed', () => {
    const onChange = vi.fn();
    render(<StepProfile {...makeProps({ onChange })} />);
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Smith' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultData, lastName: 'Smith' });
  });

  it('calls onNext when form is submitted', () => {
    const onNext = vi.fn();
    render(<StepProfile {...makeProps({ onNext })} />);
    fireEvent.submit(screen.getByTestId('step-profile'));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('disables the submit button while submitting', () => {
    render(<StepProfile {...makeProps({ isSubmitting: true })} />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });

  it('shows an error message when error prop is set', () => {
    render(<StepProfile {...makeProps({ error: 'Something went wrong' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('pre-fills data from props', () => {
    const data: ProfileData = {
      ...defaultData,
      firstName: 'Bob',
      lastName: 'Jones',
      phone: '5551234567',
    };
    render(<StepProfile {...makeProps({ data })} />);
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Bob');
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Jones');
  });

  it('asks for the mailing address and says why registries need it', () => {
    render(<StepProfile {...makeProps()} />);
    expect(screen.getByLabelText(/street address/i)).toBeRequired();
    expect(screen.getByLabelText(/^city/i)).toBeRequired();
    expect(screen.getByLabelText(/^state/i)).toBeRequired();
    expect(screen.getByLabelText(/zip \/ postal code/i)).toBeRequired();
    expect(
      screen.getByText(/registry organizations like AKC require the owner's address/i)
    ).toBeInTheDocument();
  });

  // Native validation would block submit and show one browser tooltip, so the
  // page's message naming every missing field would never be seen.
  it('leaves validation to the page so its message is the one shown', () => {
    render(<StepProfile {...makeProps()} />);
    expect(screen.getByTestId('step-profile')).toHaveAttribute('novalidate');
  });

  it('calls onChange when the street address is typed', () => {
    const onChange = vi.fn();
    render(<StepProfile {...makeProps({ onChange })} />);
    fireEvent.change(screen.getByLabelText(/street address/i), {
      target: { value: '1 Main St' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...defaultData, streetAddress: '1 Main St' });
  });
});

describe('missingAddressMessage', () => {
  const complete = {
    ...defaultData,
    streetAddress: '1 Main St',
    city: 'Tulsa',
    state: 'OK',
    zipCode: '74101',
  };

  it('is empty when every address part is filled', () => {
    expect(missingAddressMessage(complete)).toBe('');
  });

  it('names each missing part, treating whitespace as missing', () => {
    expect(missingAddressMessage({ ...complete, city: '  ', zipCode: '' })).toBe(
      'Please enter your city, ZIP or postal code.'
    );
  });
});

describe('personNeedsAddress', () => {
  it('is false for a person who was not read (unknown is never "missing")', () => {
    expect(personNeedsAddress(undefined)).toBe(false);
  });

  it('is true for a read person with no address', () => {
    expect(personNeedsAddress({ first_name: 'A', last_name: 'B', street_address: null })).toBe(
      true
    );
  });

  it('is false for a read person with a complete address', () => {
    expect(
      personNeedsAddress({
        street_address: '1 Main St',
        city: 'Tulsa',
        state: 'OK',
        zip_code: '74101',
      })
    ).toBe(false);
  });
});

describe('profileDataFromPerson', () => {
  it('prefers the stored person and falls back to signup metadata', () => {
    expect(
      profileDataFromPerson(
        { first_name: 'Ann', last_name: '', phone: null, city: 'Tulsa' },
        { last_name: 'Lee', phone: '555' }
      )
    ).toEqual({
      firstName: 'Ann',
      lastName: 'Lee',
      phone: '555',
      streetAddress: '',
      city: 'Tulsa',
      state: '',
      zipCode: '',
    });
  });
});
