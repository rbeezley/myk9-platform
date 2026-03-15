import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PageShell } from '@/components/common/PageShell';

describe('PageShell', () => {
  it('renders children within a constrained container', () => {
    render(
      <PageShell>
        <p>Content</p>
      </PageShell>
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('applies max-w-7xl container by default', () => {
    const { container } = render(
      <PageShell>
        <p>Content</p>
      </PageShell>
    );
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('max-w-7xl');
    expect(shell.className).toContain('mx-auto');
  });

  it('accepts a custom maxWidth', () => {
    const { container } = render(
      <PageShell maxWidth="max-w-5xl">
        <p>Content</p>
      </PageShell>
    );
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('max-w-5xl');
    expect(shell.className).not.toContain('max-w-7xl');
  });

  it('accepts additional className', () => {
    const { container } = render(
      <PageShell className="bg-red-500">
        <p>Content</p>
      </PageShell>
    );
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('bg-red-500');
  });
});
