/**
 * Unit tests for EntryStatusBadge component
 * Tests rendering, icon display, size variants, and status-based styling
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntryStatusBadge } from '@/components/shows/EntryStatusBadge';
import type { Show } from '@/types/show-types';
import type { EntryStatusInfo } from '@/utils/entryStatusUtils';

// Mock the utility functions
vi.mock('@/utils/entryStatusUtils', () => ({
  getEntryStatus: vi.fn(),
  getEntryStatusBadgeStyle: vi.fn(),
}));

// Import mocked functions for configuration
import { getEntryStatus, getEntryStatusBadgeStyle } from '@/utils/entryStatusUtils';
const mockGetEntryStatus = vi.mocked(getEntryStatus);
const mockGetEntryStatusBadgeStyle = vi.mocked(getEntryStatusBadgeStyle);

// Helper to create a mock show
function createMockShow(): Show {
  return {
    id: 'show-123',
    name: 'Test Show',
    entryOpenDate: '2024-01-01',
    entryCloseDate: '2024-02-01',
    startDate: '2024-02-15',
    endDate: '2024-02-16',
  } as Show;
}

describe('EntryStatusBadge', () => {
  beforeEach(() => {
    // Default mock returns
    mockGetEntryStatus.mockReturnValue({
      status: 'accepting',
      label: 'Accepting Entries',
      description: 'Entries close on 2/1/2024',
      canEnter: true,
      daysUntilClose: 20,
    } as EntryStatusInfo);

    mockGetEntryStatusBadgeStyle.mockReturnValue({
      className: 'bg-success-green/10 text-success-green',
      variant: 'default',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the status label', () => {
      render(<EntryStatusBadge show={createMockShow()} />);

      expect(screen.getByText('Accepting Entries')).toBeInTheDocument();
    });

    it('should call getEntryStatus with show and userHasEntries', () => {
      const show = createMockShow();
      render(<EntryStatusBadge show={show} userHasEntries={true} />);

      expect(mockGetEntryStatus).toHaveBeenCalledWith(show, true);
    });

    it('should default userHasEntries to false', () => {
      const show = createMockShow();
      render(<EntryStatusBadge show={show} />);

      expect(mockGetEntryStatus).toHaveBeenCalledWith(show, false);
    });

    it('should apply badge style classes', () => {
      mockGetEntryStatusBadgeStyle.mockReturnValue({
        className: 'bg-warning-orange/10 text-warning-orange animate-pulse',
        variant: 'default',
      });

      render(<EntryStatusBadge show={createMockShow()} />);

      const badge = screen.getByText('Accepting Entries').closest('div, span');
      expect(badge).toHaveClass('bg-warning-orange/10');
      expect(badge).toHaveClass('animate-pulse');
    });

    it('should include description as title attribute', () => {
      mockGetEntryStatus.mockReturnValue({
        status: 'closing_soon',
        label: 'Closes in 3 days',
        description: 'Hurry! Entries close on 2/1/2024',
        canEnter: true,
        daysUntilClose: 3,
      } as EntryStatusInfo);

      render(<EntryStatusBadge show={createMockShow()} />);

      const badge = screen.getByTitle('Hurry! Entries close on 2/1/2024');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('icon display', () => {
    it('should render icon by default', () => {
      render(<EntryStatusBadge show={createMockShow()} />);

      // SVG icon should be present
      const badge = screen.getByText('Accepting Entries').closest('div, span');
      const svg = badge?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should not render icon when showIcon is false', () => {
      render(<EntryStatusBadge show={createMockShow()} showIcon={false} />);

      const badge = screen.getByText('Accepting Entries').closest('div, span');
      const svg = badge?.querySelector('svg');
      expect(svg).toBeNull();
    });
  });

  describe('size variants', () => {
    it('should apply small size classes by default', () => {
      render(<EntryStatusBadge show={createMockShow()} />);

      const badge = screen.getByText('Accepting Entries').closest('div, span');
      expect(badge).toHaveClass('text-xs');
      expect(badge).toHaveClass('px-2');
      expect(badge).toHaveClass('py-0.5');
    });

    it('should apply medium size classes when size is md', () => {
      render(<EntryStatusBadge show={createMockShow()} size="md" />);

      const badge = screen.getByText('Accepting Entries').closest('div, span');
      expect(badge).toHaveClass('text-sm');
      expect(badge).toHaveClass('px-3');
      expect(badge).toHaveClass('py-1');
    });
  });

  describe('custom className', () => {
    it('should apply custom className to badge', () => {
      render(
        <EntryStatusBadge
          show={createMockShow()}
          className="my-custom-class another-class"
        />
      );

      const badge = screen.getByText('Accepting Entries').closest('div, span');
      expect(badge).toHaveClass('my-custom-class');
      expect(badge).toHaveClass('another-class');
    });
  });

  describe('status-specific rendering', () => {
    it('should render accepting status correctly', () => {
      mockGetEntryStatus.mockReturnValue({
        status: 'accepting',
        label: 'Accepting Entries',
        description: 'Entries close on 2/1/2024',
        canEnter: true,
      } as EntryStatusInfo);

      mockGetEntryStatusBadgeStyle.mockReturnValue({
        className: 'bg-success-green/10 text-success-green',
        variant: 'default',
      });

      render(<EntryStatusBadge show={createMockShow()} />);

      expect(screen.getByText('Accepting Entries')).toBeInTheDocument();
    });

    it('should render closing_soon status correctly', () => {
      mockGetEntryStatus.mockReturnValue({
        status: 'closing_soon',
        label: 'Closes in 3 days',
        description: 'Hurry! Entries close soon',
        canEnter: true,
        daysUntilClose: 3,
      } as EntryStatusInfo);

      mockGetEntryStatusBadgeStyle.mockReturnValue({
        className: 'bg-warning-orange/10 text-warning-orange animate-pulse',
        variant: 'default',
      });

      render(<EntryStatusBadge show={createMockShow()} />);

      expect(screen.getByText('Closes in 3 days')).toBeInTheDocument();
    });

    it('should render closed status correctly', () => {
      mockGetEntryStatus.mockReturnValue({
        status: 'closed',
        label: 'Entries Closed',
        description: 'Entries closed on 2/1/2024',
        canEnter: false,
      } as EntryStatusInfo);

      mockGetEntryStatusBadgeStyle.mockReturnValue({
        className: 'bg-muted/50 text-muted-foreground',
        variant: 'secondary',
      });

      render(<EntryStatusBadge show={createMockShow()} />);

      expect(screen.getByText('Entries Closed')).toBeInTheDocument();
    });

    it('should render submitted status correctly', () => {
      mockGetEntryStatus.mockReturnValue({
        status: 'submitted',
        label: 'Entry Submitted',
        description: 'You have entries for this show',
        canEnter: true,
      } as EntryStatusInfo);

      mockGetEntryStatusBadgeStyle.mockReturnValue({
        className: 'bg-primary/10 text-primary',
        variant: 'default',
      });

      render(<EntryStatusBadge show={createMockShow()} userHasEntries={true} />);

      expect(screen.getByText('Entry Submitted')).toBeInTheDocument();
      expect(mockGetEntryStatus).toHaveBeenCalledWith(expect.anything(), true);
    });

    it('should render not_yet_open status correctly', () => {
      mockGetEntryStatus.mockReturnValue({
        status: 'not_yet_open',
        label: 'Opens 1/1/2024',
        description: 'Entries open in 5 days',
        canEnter: false,
        daysUntilOpen: 5,
      } as EntryStatusInfo);

      mockGetEntryStatusBadgeStyle.mockReturnValue({
        className: 'bg-muted/30 text-muted-foreground',
        variant: 'outline',
      });

      render(<EntryStatusBadge show={createMockShow()} />);

      expect(screen.getByText('Opens 1/1/2024')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible title with description', () => {
      mockGetEntryStatus.mockReturnValue({
        status: 'accepting',
        label: 'Accepting Entries',
        description: 'Show entries are open until February 1, 2024',
        canEnter: true,
      } as EntryStatusInfo);

      render(<EntryStatusBadge show={createMockShow()} />);

      const badge = screen.getByTitle('Show entries are open until February 1, 2024');
      expect(badge).toBeInTheDocument();
    });

    it('should render with flex layout for icon alignment', () => {
      render(<EntryStatusBadge show={createMockShow()} />);

      const badge = screen.getByText('Accepting Entries').closest('div, span');
      expect(badge).toHaveClass('flex');
      expect(badge).toHaveClass('items-center');
      expect(badge).toHaveClass('gap-1');
    });
  });
});
