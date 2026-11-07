import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { VenueAddressAutocomplete } from './VenueAddressAutocomplete';

function renderField() {
  const onChange = vi.fn();
  const onSettledBlur = vi.fn();
  render(
    <VenueAddressAutocomplete
      id="show-location"
      value=""
      onChange={onChange}
      onSettledBlur={onSettledBlur}
      placeholder="Enter venue name and address"
    />
  );
  return {
    onChange,
    onSettledBlur,
    field: screen.getByPlaceholderText('Enter venue name and address'),
  };
}

describe('VenueAddressAutocomplete', () => {
  it('is a plain textarea: no combobox, no suggestions, no network', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { field, onChange } = renderField();
    fireEvent.change(field, { target: { value: 'Purina Farms, Gray Summit' } });

    expect(onChange).toHaveBeenCalledWith('Purina Farms, Gray Summit');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('fires onSettledBlur when focus leaves the field', () => {
    const { field, onSettledBlur } = renderField();
    fireEvent.blur(field);
    expect(onSettledBlur).toHaveBeenCalledTimes(1);
  });
});
