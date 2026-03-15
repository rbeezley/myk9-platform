import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NotFoundState } from '@/components/common/NotFoundState';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('NotFoundState', () => {
  it('renders entity name in message', () => {
    render(
      <MemoryRouter>
        <NotFoundState entityName="Show" backTo="/shows" backLabel="Back to Shows" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Show Not Found')).toBeInTheDocument();
  });

  it('navigates back when button clicked', () => {
    render(
      <MemoryRouter>
        <NotFoundState entityName="Show" backTo="/shows" backLabel="Back to Shows" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Back to Shows'));
    expect(mockNavigate).toHaveBeenCalledWith('/shows');
  });
});
