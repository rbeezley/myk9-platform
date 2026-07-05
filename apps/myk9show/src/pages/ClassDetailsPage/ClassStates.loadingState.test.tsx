import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { LoadingClassState } from './ClassStates';

describe('LoadingClassState', () => {
  it('uses a skeleton, not a spinner, while class details load', () => {
    render(<LoadingClassState />);

    expect(screen.getByRole('status', { name: 'Loading class details' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText('Loading class details...')).not.toBeInTheDocument();
  });
});
