/**
 * Unit tests for PropertySection component
 * Tests rendering, collapsible behavior, inline editing, custom render, and null handling
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertySection } from '@/components/layout/record/PropertySection';
import type { PropertySectionConfig } from '@/components/layout/record/RecordPageLayout.types';

// Mock InlineEditableField to avoid testing its internals
vi.mock('@/components/common/InlineEditableField', () => ({
  InlineEditableField: ({
    value,
    label,
    suffix,
  }: {
    value: string | number | null | undefined;
    label: string;
    suffix?: string;
  }) => (
    <span data-testid={`inline-editable-${label}`}>
      {value}
      {suffix}
    </span>
  ),
}));

// Stub icon component
function StubIcon({ className }: { className?: string }) {
  return <svg data-testid="section-icon" className={className} />;
}

function createSection(overrides: Partial<PropertySectionConfig> = {}): PropertySectionConfig {
  return {
    key: 'test-section',
    title: 'Test Section',
    fields: [],
    ...overrides,
  };
}

describe('PropertySection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Rendering', () => {
    it('renders the section title', () => {
      render(<PropertySection section={createSection({ title: 'Dog Info' })} />);
      expect(screen.getByText('Dog Info')).toBeInTheDocument();
    });

    it('renders field labels and values', () => {
      const section = createSection({
        fields: [
          { label: 'Breed', value: 'Golden Retriever' },
          { label: 'Weight', value: 65 },
        ],
      });
      render(<PropertySection section={section} />);
      expect(screen.getByText('Breed')).toBeInTheDocument();
      expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
      expect(screen.getByText('Weight')).toBeInTheDocument();
      expect(screen.getByText('65')).toBeInTheDocument();
    });

    it('renders icon when provided', () => {
      const section = createSection({ icon: StubIcon });
      render(<PropertySection section={section} />);
      expect(screen.getByTestId('section-icon')).toBeInTheDocument();
    });

    it('does not render icon container when no icon provided', () => {
      const section = createSection({ icon: undefined });
      render(<PropertySection section={section} />);
      expect(screen.queryByTestId('section-icon')).not.toBeInTheDocument();
    });
  });

  describe('Null/undefined values', () => {
    it('shows "Not set" for null values', () => {
      const section = createSection({
        fields: [{ label: 'Color', value: null }],
      });
      render(<PropertySection section={section} />);
      expect(screen.getByText('Not set')).toBeInTheDocument();
    });

    it('shows "Not set" for undefined values', () => {
      const section = createSection({
        fields: [{ label: 'Color', value: undefined }],
      });
      render(<PropertySection section={section} />);
      expect(screen.getByText('Not set')).toBeInTheDocument();
    });

    it('shows "Not set" for empty string values', () => {
      const section = createSection({
        fields: [{ label: 'Color', value: '' }],
      });
      render(<PropertySection section={section} />);
      expect(screen.getByText('Not set')).toBeInTheDocument();
    });
  });

  describe('Suffix', () => {
    it('shows suffix for non-editable fields with values', () => {
      const section = createSection({
        fields: [{ label: 'Weight', value: 65, suffix: ' lbs' }],
      });
      render(<PropertySection section={section} />);
      expect(screen.getByText(/65/)).toBeInTheDocument();
      expect(screen.getByText(/lbs/)).toBeInTheDocument();
    });
  });

  describe('Custom render prop', () => {
    it('uses custom render when provided', () => {
      const section = createSection({
        fields: [
          {
            label: 'Status',
            value: 'active',
            render: <span data-testid="custom-render">Custom Content</span>,
          },
        ],
      });
      render(<PropertySection section={section} />);
      expect(screen.getByTestId('custom-render')).toBeInTheDocument();
      expect(screen.getByText('Custom Content')).toBeInTheDocument();
    });

    it('custom render takes precedence over onSave', () => {
      const onSave = vi.fn();
      const section = createSection({
        fields: [
          {
            label: 'Name',
            value: 'Buddy',
            render: <span>Custom</span>,
            onSave,
          },
        ],
      });
      render(<PropertySection section={section} />);
      expect(screen.getByText('Custom')).toBeInTheDocument();
      // InlineEditableField should NOT be rendered
      expect(screen.queryByTestId('inline-editable-Name')).not.toBeInTheDocument();
    });
  });

  describe('InlineEditableField', () => {
    it('renders InlineEditableField when onSave is provided', () => {
      const onSave = vi.fn();
      const section = createSection({
        fields: [{ label: 'Name', value: 'Buddy', onSave }],
      });
      render(<PropertySection section={section} />);
      expect(screen.getByTestId('inline-editable-Name')).toBeInTheDocument();
    });
  });

  describe('Collapsible behavior', () => {
    it('is expanded by default', () => {
      const section = createSection({
        fields: [{ label: 'Breed', value: 'Poodle' }],
      });
      render(<PropertySection section={section} />);
      expect(screen.getByText('Poodle')).toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('collapses when header is clicked', async () => {
      const user = userEvent.setup();
      const section = createSection({
        fields: [{ label: 'Breed', value: 'Poodle' }],
      });
      render(<PropertySection section={section} />);

      await user.click(screen.getByRole('button'));

      expect(screen.queryByText('Poodle')).not.toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    });

    it('re-expands on second click', async () => {
      const user = userEvent.setup();
      const section = createSection({
        fields: [{ label: 'Breed', value: 'Poodle' }],
      });
      render(<PropertySection section={section} />);

      await user.click(screen.getByRole('button'));
      expect(screen.queryByText('Poodle')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button'));
      expect(screen.getByText('Poodle')).toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('persists collapse state in localStorage when storagePrefix is provided', async () => {
      const user = userEvent.setup();
      const section = createSection({ key: 'details' });
      render(<PropertySection section={section} storagePrefix="myk9:dog" />);

      await user.click(screen.getByRole('button'));

      expect(localStorage.getItem('myk9:dog:details')).toBe('false');
    });

    it('restores collapsed state from localStorage', () => {
      localStorage.setItem('myk9:dog:details', 'false');
      const section = createSection({
        key: 'details',
        fields: [{ label: 'Breed', value: 'Poodle' }],
      });
      render(<PropertySection section={section} storagePrefix="myk9:dog" />);

      expect(screen.queryByText('Poodle')).not.toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    });

    it('defaults to expanded when localStorage has no saved state', () => {
      const section = createSection({
        key: 'details',
        fields: [{ label: 'Breed', value: 'Poodle' }],
      });
      render(<PropertySection section={section} storagePrefix="myk9:dog" />);

      expect(screen.getByText('Poodle')).toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('does not use localStorage when storagePrefix is not provided', async () => {
      const user = userEvent.setup();
      const section = createSection({ key: 'details' });
      render(<PropertySection section={section} />);

      await user.click(screen.getByRole('button'));

      expect(localStorage.getItem('details')).toBeNull();
      expect(localStorage.getItem('undefined:details')).toBeNull();
    });
  });
});
