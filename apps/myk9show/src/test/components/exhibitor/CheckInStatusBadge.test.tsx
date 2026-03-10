/**
 * Unit tests for CheckInStatusBadge component.
 * Tests rendering, interactive vs read-only states, colors, and accessibility.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CheckInStatusBadge } from '@/components/exhibitor/CheckInStatusBadge';
import type { CheckInStatus } from '@myk9/core';

describe('CheckInStatusBadge', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the status label', () => {
      render(<CheckInStatusBadge status="checked-in" />);
      expect(screen.getByText('Checked-in')).toBeInTheDocument();
    });

    it('should render an icon', () => {
      render(<CheckInStatusBadge status="checked-in" />);
      const badge = screen.getByLabelText('Status: Checked-in');
      const svg = badge.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render in compact mode (icon only, no label)', () => {
      render(<CheckInStatusBadge status="checked-in" compact />);
      expect(screen.queryByText('Checked-in')).not.toBeInTheDocument();
      // Should still have an SVG icon
      const badge = screen.getByLabelText(/Status: Checked-in/);
      const svg = badge.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('status-specific rendering', () => {
    const statuses: { status: CheckInStatus; label: string }[] = [
      { status: 'no-status', label: 'No Status' },
      { status: 'checked-in', label: 'Checked-in' },
      { status: 'conflict', label: 'Conflict' },
      { status: 'pulled', label: 'Pulled' },
      { status: 'at-gate', label: 'At Gate' },
      { status: 'come-to-gate', label: 'Come to Gate' },
      { status: 'in-ring', label: 'In Ring' },
      { status: 'completed', label: 'Completed' },
    ];

    for (const { status, label } of statuses) {
      it(`should render "${label}" for status "${status}"`, () => {
        render(<CheckInStatusBadge status={status} />);
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    }
  });

  describe('interactive vs read-only', () => {
    it('should render as a button when onClick is provided and status is exhibitor-allowed', () => {
      render(<CheckInStatusBadge status="checked-in" onClick={vi.fn()} />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should render as a span (read-only) when no onClick', () => {
      render(<CheckInStatusBadge status="checked-in" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should render as a span (read-only) for secretary-only statuses even with onClick', () => {
      render(<CheckInStatusBadge status="in-ring" onClick={vi.fn()} />);
      // "in-ring" is secretary-only → should NOT render as a button
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should render as a span for come-to-gate (secretary-only)', () => {
      render(<CheckInStatusBadge status="come-to-gate" onClick={vi.fn()} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should render as a span for completed (secretary-only)', () => {
      render(<CheckInStatusBadge status="completed" onClick={vi.fn()} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should call onClick when interactive badge is clicked', () => {
      const onClick = vi.fn();
      render(<CheckInStatusBadge status="checked-in" onClick={onClick} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledOnce();
    });

    it('should render as read-only when disabled even with onClick', () => {
      render(<CheckInStatusBadge status="checked-in" onClick={vi.fn()} disabled />);
      // disabled + onClick → isInteractive=false → isReadOnly=true → renders span
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should apply custom className', () => {
      render(<CheckInStatusBadge status="checked-in" className="my-custom-class" />);
      // The outer element is a <span> with aria-label (read-only). The text is in an inner <span>.
      const badge = screen.getByLabelText('Status: Checked-in');
      expect(badge).toHaveClass('my-custom-class');
    });

    it('should have emerald colors for checked-in', () => {
      render(<CheckInStatusBadge status="checked-in" />);
      const badge = screen.getByLabelText('Status: Checked-in');
      expect(badge).toHaveClass('bg-emerald-500/15');
    });

    it('should have amber colors for conflict', () => {
      render(<CheckInStatusBadge status="conflict" />);
      const badge = screen.getByLabelText('Status: Conflict');
      expect(badge).toHaveClass('bg-amber-500/15');
    });

    it('should have red colors for pulled', () => {
      render(<CheckInStatusBadge status="pulled" />);
      const badge = screen.getByLabelText('Status: Pulled');
      expect(badge).toHaveClass('bg-red-500/15');
    });
  });

  describe('accessibility', () => {
    it('should have aria-label for read-only badge', () => {
      render(<CheckInStatusBadge status="checked-in" />);
      expect(screen.getByLabelText('Status: Checked-in')).toBeInTheDocument();
    });

    it('should have aria-label for interactive badge', () => {
      render(<CheckInStatusBadge status="checked-in" onClick={vi.fn()} />);
      expect(screen.getByLabelText('Status: Checked-in. Click to change.')).toBeInTheDocument();
    });

    it('should have min-h-[32px] for interactive badge (touch target)', () => {
      render(<CheckInStatusBadge status="checked-in" onClick={vi.fn()} />);
      const btn = screen.getByRole('button');
      expect(btn).toHaveClass('min-h-[32px]');
    });
  });
});
