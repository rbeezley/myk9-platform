import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { PersonLifecycleBanner } from './PersonLifecycleBanner';

describe('PersonLifecycleBanner', () => {
  it('renders nothing for an ordinary active person', () => {
    const { container } = render(<PersonLifecycleBanner status="active" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('states that a removed person was removed, and when', () => {
    render(<PersonLifecycleBanner deletedAt="2026-07-30T00:00:00Z" />);

    expect(screen.getByRole('status')).toHaveTextContent(/was removed/i);
    expect(screen.getByRole('status')).toHaveTextContent(/2026/);
    expect(screen.getByRole('status')).toHaveTextContent(/roles stay disabled/i);
    expect(screen.getByRole('link', { name: /manage roles/i })).toHaveAttribute(
      'href',
      '/admin/permissions?tab=assignments'
    );
  });

  it('offers Restore only when the viewer can restore', () => {
    const onRestore = vi.fn();
    const { rerender } = render(
      <PersonLifecycleBanner deletedAt="2026-07-30T00:00:00Z" onRestore={onRestore} />
    );
    expect(screen.getByRole('button', { name: /restore person/i })).toBeInTheDocument();

    rerender(<PersonLifecycleBanner deletedAt="2026-07-30T00:00:00Z" />);
    expect(screen.queryByRole('button', { name: /restore/i })).not.toBeInTheDocument();
  });

  it('calls onRestore, and disables the button while it runs', async () => {
    const onRestore = vi.fn();
    const { user, rerender } = render(
      <PersonLifecycleBanner deletedAt="2026-07-30T00:00:00Z" onRestore={onRestore} />
    );

    await user.click(screen.getByRole('button', { name: /restore person/i }));
    expect(onRestore).toHaveBeenCalledTimes(1);

    rerender(
      <PersonLifecycleBanner deletedAt="2026-07-30T00:00:00Z" onRestore={onRestore} isRestoring />
    );
    expect(screen.getByRole('button', { name: /restoring/i })).toBeDisabled();
  });

  it('still says removed when the timestamp is unusable', () => {
    // A missing or malformed date must not cost the reader the fact itself.
    render(<PersonLifecycleBanner deletedAt="not-a-date" />);

    expect(screen.getByRole('status')).toHaveTextContent(/was removed/i);
    expect(screen.getByRole('status')).not.toHaveTextContent(/Invalid/i);
  });

  it('reports suspension for a live account', () => {
    render(<PersonLifecycleBanner status="suspended" />);

    expect(screen.getByRole('status')).toHaveTextContent(/suspended/i);
    expect(screen.getByRole('status')).toHaveTextContent(/cannot sign in/i);
  });

  it('shows removal rather than suspension when a person is both', () => {
    render(<PersonLifecycleBanner deletedAt="2026-07-30T00:00:00Z" status="suspended" />);

    expect(screen.getByRole('status')).toHaveTextContent(/was removed/i);
    expect(screen.getByRole('status')).not.toHaveTextContent(/cannot sign in/i);
  });
});
