import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { EntriesIdentityPendingCard } from './EntriesIdentityPendingCard';

describe('EntriesIdentityPendingCard', () => {
  it('distinguishes a confirmed missing profile from an unresolved identity', () => {
    const onRetry = vi.fn();

    const { rerender } = render(
      <EntriesIdentityPendingCard onRetry={onRetry} refreshing={false} identityState="unresolved" />
    );
    expect(screen.getByText('Getting your shows ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();

    rerender(
      <EntriesIdentityPendingCard onRetry={onRetry} refreshing={false} identityState="missing" />
    );
    expect(screen.getByText('We could not find your exhibitor profile')).toBeInTheDocument();
    expect(screen.getByText(/ask your show secretary/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Getting your shows ready')).not.toBeInTheDocument();
  });
});
