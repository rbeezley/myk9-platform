import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AdditionalDetails } from '@/components/shows/overview/AdditionalDetails';
import type { Show } from '@/types/show-types';

// Mock useResolvePersonName to return resolved names
vi.mock('@/hooks/useResolvePersonName', () => ({
  useResolvePersonName: () => (id: string | null | undefined) => {
    if (!id) return 'Not assigned';
    const names: Record<string, string> = { 'steward-1': 'Pat Garcia' };
    return names[id] || id;
  },
}));

describe('AdditionalDetails', () => {
  it('renders organization when present', () => {
    render(<AdditionalDetails show={{ organization: 'AKC' } as Show} />);
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('AKC')).toBeInTheDocument();
  });

  it('renders day-of-show fee when different from pre-entry', () => {
    render(<AdditionalDetails show={{ preEntryFee: '$30', dayOfShowFee: '$40' } as Show} />);
    expect(screen.getByText('Day-of-Show Fee')).toBeInTheDocument();
    expect(screen.getByText('$40')).toBeInTheDocument();
  });

  it('omits day-of-show fee when same as pre-entry', () => {
    render(<AdditionalDetails show={{ preEntryFee: '$30', dayOfShowFee: '$30' } as Show} />);
    expect(screen.queryByText('Day-of-Show Fee')).not.toBeInTheDocument();
  });

  it('renders max entries per dog', () => {
    render(<AdditionalDetails show={{ maxEntriesPerDog: 3 } as Show} />);
    expect(screen.getByText('Max Entries per Dog')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders non-owner handlers status', () => {
    render(<AdditionalDetails show={{ allowNonOwnerHandlers: true } as Show} />);
    expect(screen.getByText('Non-Owner Handlers')).toBeInTheDocument();
    expect(screen.getByText('Allowed')).toBeInTheDocument();
  });

  it('resolves chief steward person ID to name', () => {
    render(<AdditionalDetails show={{ chiefSteward: 'steward-1' } as Show} />);
    expect(screen.getByText('Chief Steward')).toBeInTheDocument();
    expect(screen.getByText('Pat Garcia')).toBeInTheDocument();
  });

  it('returns null when no additional details exist', () => {
    const { container } = render(<AdditionalDetails show={{} as Show} />);
    expect(container.firstElementChild).toBeNull();
  });
});
