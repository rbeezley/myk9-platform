import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { VolunteersCard } from '../VolunteersCard';

describe('VolunteersCard', () => {
  it('renders the heading and a link to the volunteer scheduling page', () => {
    render(<VolunteersCard />);

    expect(screen.getByRole('heading', { name: 'Volunteers' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /open volunteer scheduling/i });
    expect(link).toHaveAttribute('href', '/secretary/volunteers');
  });
});
