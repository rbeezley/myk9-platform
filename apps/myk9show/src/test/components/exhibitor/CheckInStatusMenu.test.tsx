/**
 * Unit tests for CheckInStatusMenu component.
 * Tests dropdown rendering, status selection, disabled state, and accessibility.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CheckInStatusMenu } from '@/components/exhibitor/CheckInStatusMenu';

describe('CheckInStatusMenu', () => {
  const defaultProps = {
    status: 'checked-in' as const,
    onStatusChange: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('trigger badge', () => {
    it('should render the current status as trigger', () => {
      render(<CheckInStatusMenu {...defaultProps} />);
      expect(screen.getByText('Checked-in')).toBeInTheDocument();
    });

    it('should open dropdown when trigger is clicked', () => {
      render(<CheckInStatusMenu {...defaultProps} />);
      fireEvent.click(screen.getByText('Checked-in'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('should not open dropdown when disabled', () => {
      render(<CheckInStatusMenu {...defaultProps} disabled />);
      fireEvent.click(screen.getByText('Checked-in'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('dropdown menu', () => {
    it('should show only exhibitor-allowed statuses', () => {
      render(<CheckInStatusMenu {...defaultProps} />);
      fireEvent.click(screen.getByText('Checked-in'));

      const menu = screen.getByRole('menu');
      const items = within(menu).getAllByRole('menuitem');

      // 5 exhibitor-allowed: checked-in, at-gate, conflict, pulled, no-status
      expect(items).toHaveLength(5);
    });

    it('should NOT show secretary-only statuses', () => {
      render(<CheckInStatusMenu {...defaultProps} />);
      fireEvent.click(screen.getByText('Checked-in'));

      expect(screen.queryByText('Come to Gate')).not.toBeInTheDocument();
      expect(screen.queryByText('In Ring')).not.toBeInTheDocument();
      expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    });

    it('should show exhibitor-allowed status labels', () => {
      render(<CheckInStatusMenu {...defaultProps} />);
      fireEvent.click(screen.getByText('Checked-in'));

      // Use getAllByText since "Checked-in" appears in both trigger and menu
      expect(screen.getAllByText('Checked-in').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('At Gate')).toBeInTheDocument();
      expect(screen.getByText('Conflict')).toBeInTheDocument();
      expect(screen.getByText('Pulled')).toBeInTheDocument();
      expect(screen.getByText('No Status')).toBeInTheDocument();
    });

    it('should mark active status with a check icon', () => {
      render(<CheckInStatusMenu {...defaultProps} status="conflict" />);
      fireEvent.click(screen.getByText('Conflict'));

      const menu = screen.getByRole('menu');
      const conflictItem = within(menu)
        .getAllByRole('menuitem')
        .find(item => within(item).queryByText('Conflict'));
      expect(conflictItem).toBeDefined();
      // Active item gets bg-accent/50 class
      expect(conflictItem).toHaveClass('bg-accent/50');
    });
  });

  describe('selection', () => {
    it('should call onStatusChange when a different status is selected', () => {
      const onStatusChange = vi.fn();
      render(<CheckInStatusMenu status="checked-in" onStatusChange={onStatusChange} />);

      fireEvent.click(screen.getByText('Checked-in'));
      fireEvent.click(screen.getByText('At Gate'));

      expect(onStatusChange).toHaveBeenCalledWith('at-gate');
    });

    it('should NOT call onStatusChange when selecting the current status', () => {
      const onStatusChange = vi.fn();
      render(<CheckInStatusMenu status="checked-in" onStatusChange={onStatusChange} />);

      fireEvent.click(screen.getByText('Checked-in'));
      // Click the menu item for "Checked-in" (second instance — in the menu)
      const menu = screen.getByRole('menu');
      const checkedInItem = within(menu)
        .getAllByRole('menuitem')
        .find(item => within(item).queryByText('Checked-in'));
      fireEvent.click(checkedInItem!);

      expect(onStatusChange).not.toHaveBeenCalled();
    });

    it('should close dropdown after selection', () => {
      render(<CheckInStatusMenu {...defaultProps} />);

      fireEvent.click(screen.getByText('Checked-in'));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Pulled'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('should close dropdown when clicking the backdrop', () => {
      render(<CheckInStatusMenu {...defaultProps} />);

      fireEvent.click(screen.getByText('Checked-in'));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // The backdrop is a fixed inset-0 div
      const backdrop = document.querySelector('.fixed.inset-0');
      expect(backdrop).toBeInTheDocument();
      fireEvent.click(backdrop!);

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('disabled state', () => {
    it('should render disabled reason as sr-only text', () => {
      render(
        <CheckInStatusMenu
          {...defaultProps}
          disabled
          disabledReason="Check-in disabled by show management"
        />
      );

      const srOnly = screen.getByText('Check-in disabled by show management');
      expect(srOnly).toHaveClass('sr-only');
    });
  });

  describe('accessibility', () => {
    it('should have role="menu" on the dropdown', () => {
      render(<CheckInStatusMenu {...defaultProps} />);
      fireEvent.click(screen.getByText('Checked-in'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('should have role="menuitem" on each option', () => {
      render(<CheckInStatusMenu {...defaultProps} />);
      fireEvent.click(screen.getByText('Checked-in'));
      const items = screen.getAllByRole('menuitem');
      expect(items.length).toBe(5);
    });

    it('should have aria-label on the menu', () => {
      render(<CheckInStatusMenu {...defaultProps} />);
      fireEvent.click(screen.getByText('Checked-in'));
      expect(screen.getByLabelText('Check-in status options')).toBeInTheDocument();
    });

    it('should have min-h-[44px] on menu items (touch target)', () => {
      render(<CheckInStatusMenu {...defaultProps} />);
      fireEvent.click(screen.getByText('Checked-in'));
      const items = screen.getAllByRole('menuitem');
      for (const item of items) {
        expect(item).toHaveClass('min-h-[44px]');
      }
    });
  });
});
