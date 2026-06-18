import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaginatedSearchResults } from '../PaginatedSearchResults';

// PaginatedSearchResults reads userRole from the ShowDataProvider context.
// The error early-return only needs that hook to resolve, so stub it.
vi.mock('@/components/providers/ShowDataProvider', () => ({
  useShowData: () => ({ userRole: 'admin' }),
}));

function renderErrorState() {
  return render(
    <PaginatedSearchResults<{ id: string }>
      data={[]}
      renderItem={(item) => <div key={item.id}>{item.id}</div>}
      searchFunction={(items) => items}
      getItemKey={(item) => item.id}
      error="boom"
    />
  );
}

describe('PaginatedSearchResults error state', () => {
  it('renders the error message text', () => {
    renderErrorState();
    expect(screen.getByText('Error: boom')).toBeInTheDocument();
  });

  // Regression: small red error text must use the theme-aware AA-contrast token
  // (--destructive-strong), not a hardcoded red that fails WCAG AA on the card
  // surface. Mirrors the assertion style in ToastContainer.test.tsx.
  it('colors the error text with the AA-contrast destructive-strong token', () => {
    renderErrorState();
    const errorText = screen.getByText('Error: boom');
    const container = errorText.parentElement;
    expect(container).not.toBeNull();
    expect(container!.className).toContain('text-destructive-strong');
    expect(container!.className).not.toContain('text-red-500');
  });
});
