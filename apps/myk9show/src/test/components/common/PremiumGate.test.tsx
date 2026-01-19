import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PremiumGate } from '@/components/common/PremiumGate';
import { Trophy } from 'lucide-react';

describe('PremiumGate Component', () => {
  describe('Rendering', () => {
    it('should render with title and description', () => {
      render(
        <PremiumGate
          title="Premium Feature"
          description="This is a premium feature description."
        />
      );

      expect(screen.getByText('Premium Feature')).toBeInTheDocument();
      expect(screen.getByText('This is a premium feature description.')).toBeInTheDocument();
    });

    it('should render upgrade button', () => {
      render(
        <PremiumGate
          title="Test Feature"
          description="Test description"
        />
      );

      expect(screen.getByRole('button', { name: /upgrade to premium/i })).toBeInTheDocument();
    });

    it('should render with default crown icon', () => {
      render(
        <PremiumGate
          title="Test Feature"
          description="Test description"
        />
      );

      // Crown icon should be rendered in the icon container
      const iconContainer = document.querySelector('.rounded-full.shadow-lg');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should render with custom icon when provided', () => {
      render(
        <PremiumGate
          title="Test Feature"
          description="Test description"
          icon={Trophy}
        />
      );

      // The component should still render
      expect(screen.getByText('Test Feature')).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('should render with small size', () => {
      const { container } = render(
        <PremiumGate
          title="Small Gate"
          description="Small description"
          size="sm"
        />
      );

      expect(container.firstChild).toHaveClass('py-12');
    });

    it('should render with medium size (default)', () => {
      const { container } = render(
        <PremiumGate
          title="Medium Gate"
          description="Medium description"
        />
      );

      expect(container.firstChild).toHaveClass('py-16');
    });

    it('should render with large size', () => {
      const { container } = render(
        <PremiumGate
          title="Large Gate"
          description="Large description"
          size="lg"
        />
      );

      expect(container.firstChild).toHaveClass('py-20');
    });
  });

  describe('Interactions', () => {
    it('should call onUpgrade callback when upgrade button is clicked', async () => {
      const handleUpgrade = vi.fn();
      const user = userEvent.setup();

      render(
        <PremiumGate
          title="Test Feature"
          description="Test description"
          onUpgrade={handleUpgrade}
        />
      );

      await user.click(screen.getByRole('button', { name: /upgrade to premium/i }));

      expect(handleUpgrade).toHaveBeenCalledTimes(1);
    });

    it('should work without onUpgrade callback', async () => {
      const user = userEvent.setup();

      render(
        <PremiumGate
          title="Test Feature"
          description="Test description"
        />
      );

      // Should not throw when clicked without callback
      await expect(
        user.click(screen.getByRole('button', { name: /upgrade to premium/i }))
      ).resolves.not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button with proper role', () => {
      render(
        <PremiumGate
          title="Test Feature"
          description="Test description"
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should have proper heading hierarchy', () => {
      render(
        <PremiumGate
          title="Test Feature"
          description="Test description"
        />
      );

      const heading = screen.getByRole('heading', { name: 'Test Feature' });
      expect(heading).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <PremiumGate
          title="Test Feature"
          description="Test description"
          className="custom-test-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-test-class');
    });
  });
});
