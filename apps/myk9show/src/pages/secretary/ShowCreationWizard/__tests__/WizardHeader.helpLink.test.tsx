import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { WizardHeader } from '../WizardHeader';

describe('WizardHeader help link', () => {
  it('links Help to the secretary guide section on creating a show', () => {
    render(<WizardHeader editMode={undefined} onClose={vi.fn()} />);

    const link = screen.getByRole('link', { name: 'Help' });
    expect(link).toHaveAttribute(
      'href',
      'https://help.myk9show.com/guides/secretary-guide#1--create-a-show-its-trials-and-its-classes'
    );
    expect(link).toHaveAttribute('target', '_blank');
  });
});
