import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FormField } from '../FormField';

describe('FormField', () => {
  it('renders label text', () => {
    render(
      <FormField label="Dog Name" fieldId="name">
        <input id="name" />
      </FormField>
    );
    expect(screen.getByText('Dog Name')).toBeInTheDocument();
  });

  it('renders required asterisk when required', () => {
    render(
      <FormField label="Dog Name" fieldId="name" required>
        <input id="name" />
      </FormField>
    );
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('(required)')).toHaveClass('sr-only');
  });

  it('does not render asterisk when not required', () => {
    render(
      <FormField label="Dog Name" fieldId="name">
        <input id="name" />
      </FormField>
    );
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('renders error message when error is provided', () => {
    render(
      <FormField label="Dog Name" fieldId="name" error="Please enter a name">
        <input id="name" />
      </FormField>
    );
    const errorEl = screen.getByText('Please enter a name');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveAttribute('id', 'name-error');
  });

  it('does not render error message when error is undefined', () => {
    render(
      <FormField label="Dog Name" fieldId="name">
        <input id="name" />
      </FormField>
    );
    expect(screen.queryByText('Please enter a name')).not.toBeInTheDocument();
  });

  it('sets data-error attribute when error is present', () => {
    const { container } = render(
      <FormField label="Dog Name" fieldId="name" error="Please enter a name">
        <input id="name" />
      </FormField>
    );
    const wrapper = container.querySelector('.form-field');
    expect(wrapper).toHaveAttribute('data-error');
  });

  it('does not set data-error attribute when no error', () => {
    const { container } = render(
      <FormField label="Dog Name" fieldId="name">
        <input id="name" />
      </FormField>
    );
    const wrapper = container.querySelector('.form-field');
    expect(wrapper).not.toHaveAttribute('data-error');
  });

  it('renders hint text when provided', () => {
    render(
      <FormField label="Date of Birth" fieldId="dob" hint="Format: YYYY-MM-DD">
        <input id="dob" />
      </FormField>
    );
    expect(screen.getByText('Format: YYYY-MM-DD')).toBeInTheDocument();
  });

  it('renders label with htmlFor matching fieldId', () => {
    render(
      <FormField label="Dog Name" fieldId="name">
        <input id="name" />
      </FormField>
    );
    const label = screen.getByText('Dog Name');
    expect(label.closest('label')).toHaveAttribute('for', 'name');
  });
});
