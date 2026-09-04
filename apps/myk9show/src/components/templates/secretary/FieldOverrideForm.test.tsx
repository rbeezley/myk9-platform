import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FieldOverrideForm } from './FieldOverrideForm';
import type { ClassTemplate } from '@/types/template.types';
import { render } from '@/test/utils/testUtils';

const template = {
  fieldSpecifications: [
    {
      fieldName: 'entryFee',
      displayName: 'Entry Fee',
      fieldSource: 'admin-set',
      dataType: 'number',
      required: false,
      editable: true,
      defaultValue: 25,
    },
  ],
} as unknown as ClassTemplate;

describe('FieldOverrideForm', () => {
  it('shows the selected override group', async () => {
    const { user } = render(
      <FieldOverrideForm
        template={template}
        selectedClasses={[]}
        fieldOverrides={{}}
        onOverrideChange={vi.fn()}
        onResetField={vi.fn()}
        onResetAll={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('Entry Fee')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Financial/i }));
    expect(screen.getByText('Entry Fee')).toBeVisible();
    expect(screen.getByDisplayValue('25')).toBeVisible();
  });
});
