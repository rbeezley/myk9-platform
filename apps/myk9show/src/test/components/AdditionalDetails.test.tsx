import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AdditionalDetails } from '@/components/shows/overview/AdditionalDetails';
import type { Show } from '@/types/show-types';

describe('AdditionalDetails', () => {
  it('renders max entries per dog', () => {
    render(<AdditionalDetails show={{ maxEntriesPerDog: 3 } as Show} />);
    expect(screen.getByText('Max Entries per Dog')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders max total entries', () => {
    render(<AdditionalDetails show={{ maxTotalEntries: 100 } as Show} />);
    expect(screen.getByText('Max Total Entries')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders non-owner handlers status', () => {
    render(<AdditionalDetails show={{ allowNonOwnerHandlers: true } as Show} />);
    expect(screen.getByText('Non-Owner Handlers')).toBeInTheDocument();
    expect(screen.getByText('Allowed')).toBeInTheDocument();
  });

  it('returns null when no additional details exist', () => {
    const { container } = render(<AdditionalDetails show={{} as Show} />);
    expect(container.firstElementChild).toBeNull();
  });
});
