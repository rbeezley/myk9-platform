import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import type { ClassTemplate } from '@/types/template.types';
import { FieldOverrideForm } from './FieldOverrideForm';

const template = {
  fieldSpecifications: [
    {
      fieldName: 'entryFee',
      displayName: 'Entry fee',
      fieldSource: 'admin-set',
      dataType: 'number',
      required: false,
      editable: true,
      defaultValue: 25,
    },
    {
      fieldName: 'secretaryNote',
      displayName: 'Secretary note',
      fieldSource: 'admin-set',
      dataType: 'text',
      required: false,
      editable: true,
      defaultValue: '',
    },
  ],
} as ClassTemplate;

const props = {
  template,
  selectedClasses: [],
  fieldOverrides: {},
  onOverrideChange: vi.fn(),
  onResetField: vi.fn(),
  onResetAll: vi.fn(),
};

describe('FieldOverrideForm', () => {
  it('shows financial fields when the Financial tab is selected', async () => {
    const user = userEvent.setup();
    render(<FieldOverrideForm {...props} />);

    await user.click(screen.getByRole('tab', { name: /financial/i }));

    expect(screen.getByRole('spinbutton')).toHaveValue(25);
  });

  it('makes fields outside the known groups reachable from Other', async () => {
    const user = userEvent.setup();
    render(<FieldOverrideForm {...props} />);

    await user.click(screen.getByRole('tab', { name: /other/i }));

    expect(screen.getByPlaceholderText('Enter secretary note')).toBeVisible();
  });
});
