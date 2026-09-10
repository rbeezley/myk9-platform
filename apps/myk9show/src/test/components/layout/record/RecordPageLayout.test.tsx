/**
 * Unit tests for RecordPageLayout component
 * Tests breadcrumb, stats, three-panel layout, children, and optional props
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecordPageLayout } from '@/components/layout/record/RecordPageLayout';
import type {
  PropertySectionConfig,
  RecordTab,
} from '@/components/layout/record/RecordPageLayout.types';

// Mock sub-components to isolate RecordPageLayout behavior
vi.mock('@/components/layout/record/PropertySection', () => ({
  PropertySection: ({ section }: { section: PropertySectionConfig }) => (
    <div data-testid={`property-section-${section.key}`}>{section.title}</div>
  ),
}));

// --- Helpers ---

function createProperties(count = 1): PropertySectionConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `section-${i}`,
    title: `Section ${i}`,
    fields: [{ label: `Field ${i}`, value: `Value ${i}` }],
  }));
}

function createTabs(count = 2): RecordTab[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `tab-${i}`,
    label: `Tab ${i}`,
    content: <div data-testid={`tab-content-${i}`}>Tab {i} Content</div>,
  }));
}

// --- Tests ---

describe('RecordPageLayout', () => {
  describe('breadcrumb', () => {
    it('renders breadcrumb when provided', () => {
      render(
        <RecordPageLayout breadcrumb={<nav data-testid="breadcrumb">Home / Dogs / Rex</nav>} />
      );

      expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
      expect(screen.getByText('Home / Dogs / Rex')).toBeInTheDocument();
    });

    it('does not render top bar when breadcrumb and actions are omitted', () => {
      const { container } = render(<RecordPageLayout />);

      // The top bar div has "justify-between" — it should not be present
      const topBar = container.querySelector('.justify-between');
      expect(topBar).toBeNull();
    });
  });

  describe('actions', () => {
    it('renders action buttons when provided', () => {
      render(
        <RecordPageLayout
          breadcrumb={<span>Breadcrumb</span>}
          actions={<button data-testid="action-btn">Edit</button>}
        />
      );

      expect(screen.getByTestId('action-btn')).toBeInTheDocument();
    });

    it('renders top bar when only actions are provided (no breadcrumb)', () => {
      render(<RecordPageLayout actions={<button data-testid="action-btn">Edit</button>} />);

      expect(screen.getByTestId('action-btn')).toBeInTheDocument();
    });
  });

  describe('stats', () => {
    it('renders stats row when provided', () => {
      render(
        <RecordPageLayout
          stats={
            <div data-testid="stats-row">
              <span>10 Titles</span>
              <span>5 Shows</span>
            </div>
          }
        />
      );

      expect(screen.getByTestId('stats-row')).toBeInTheDocument();
      expect(screen.getByText('10 Titles')).toBeInTheDocument();
      expect(screen.getByText('5 Shows')).toBeInTheDocument();
    });

    it('does not render stats wrapper when stats is omitted', () => {
      const { container } = render(<RecordPageLayout />);

      // Stats wrapper has "pb-4" class
      const statsWrapper = container.querySelector('.pb-4');
      expect(statsWrapper).toBeNull();
    });
  });

  describe('hero section', () => {
    it('renders hero when provided', () => {
      render(<RecordPageLayout hero={<div data-testid="hero-card">Profile Card</div>} />);

      expect(screen.getByTestId('hero-card')).toBeInTheDocument();
    });

    it('does not render hero wrapper when hero is omitted', () => {
      const { container } = render(<RecordPageLayout />);

      // Hero wrapper has "pb-6" class directly inside the outer div
      const heroWrapper = container.querySelector('.pb-6');
      expect(heroWrapper).toBeNull();
    });
  });

  describe('properties sidebar (left panel)', () => {
    it('renders property sections when properties are provided', () => {
      const properties = createProperties(3);

      render(<RecordPageLayout properties={properties} />);

      expect(screen.getByTestId('property-section-section-0')).toBeInTheDocument();
      expect(screen.getByTestId('property-section-section-1')).toBeInTheDocument();
      expect(screen.getByTestId('property-section-section-2')).toBeInTheDocument();
    });

    it('does not render left sidebar when properties is empty', () => {
      render(<RecordPageLayout properties={[]} />);

      expect(screen.queryByTestId('property-section-section-0')).toBeNull();
    });

    it('does not render left sidebar when properties is undefined', () => {
      render(<RecordPageLayout />);

      expect(screen.queryByTestId('property-section-section-0')).toBeNull();
    });
  });

  describe('center panel (tabs)', () => {
    it('renders tabsContent when provided', () => {
      render(<RecordPageLayout tabsContent={<div data-testid="tabs-content">Custom Tabs</div>} />);

      expect(screen.getByTestId('tabs-content')).toBeInTheDocument();
    });

    it('renders tab content via tabs array when tabsContent is not provided', () => {
      const tabs = createTabs(2);

      render(<RecordPageLayout tabs={tabs} />);

      expect(screen.getByTestId('tab-content-0')).toBeInTheDocument();
      expect(screen.getByTestId('tab-content-1')).toBeInTheDocument();
    });

    it('prefers tabsContent over tabs array when both are provided', () => {
      const tabs = createTabs(1);

      render(
        <RecordPageLayout tabs={tabs} tabsContent={<div data-testid="custom-tabs">Custom</div>} />
      );

      expect(screen.getByTestId('custom-tabs')).toBeInTheDocument();
      // tabs array content should not appear since tabsContent takes precedence
      expect(screen.queryByTestId('tab-content-0')).toBeNull();
    });

    it('renders an empty center panel when neither tabs nor tabsContent is provided', () => {
      const { container } = render(<RecordPageLayout />);

      const mainPanel = container.querySelector('main');
      expect(mainPanel).toBeInTheDocument();
      expect(mainPanel?.children.length).toBe(0);
    });
  });

  describe('two-panel layout', () => {
    it('renders both panels when all data is provided', () => {
      const { container } = render(
        <RecordPageLayout
          properties={createProperties(1)}
          tabsContent={<div data-testid="center-tabs">Center</div>}
        />
      );

      expect(screen.getByTestId('property-section-section-0')).toBeInTheDocument();
      expect(screen.getByTestId('center-tabs')).toBeInTheDocument();

      // Exactly one aside: the properties sidebar. The right-hand
      // "associations" sidebar was removed once its only caller went away, so a
      // second aside here would mean it had crept back.
      expect(container.querySelectorAll('aside').length).toBe(1);
      expect(container.querySelector('main')).toBeInTheDocument();
    });
  });

  describe('optional props', () => {
    it('renders with no props at all', () => {
      const { container } = render(<RecordPageLayout />);

      // Should still render the outer container and center panel
      const outerDiv = container.firstElementChild as HTMLElement;
      expect(outerDiv).toBeInTheDocument();

      const mainEl = container.querySelector('main');
      expect(mainEl).toBeInTheDocument();
    });

    it('applies custom className to outer container', () => {
      const { container } = render(<RecordPageLayout className="my-custom-class" />);

      const outerDiv = container.firstElementChild as HTMLElement;
      expect(outerDiv).toHaveClass('my-custom-class');
      // Should also keep default class
      expect(outerDiv).toHaveClass('mx-auto');
    });

    it('renders with all optional props provided simultaneously', () => {
      render(
        <RecordPageLayout
          breadcrumb={<span>Breadcrumb</span>}
          actions={<button>Action</button>}
          stats={<div data-testid="stats">Stats</div>}
          hero={<div data-testid="hero">Hero</div>}
          properties={createProperties(1)}
          tabsContent={<div data-testid="tabs">Tabs</div>}
          storageKey="test:key"
          className="full-test"
        />
      );

      expect(screen.getByText('Breadcrumb')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
      expect(screen.getByTestId('stats')).toBeInTheDocument();
      expect(screen.getByTestId('hero')).toBeInTheDocument();
      expect(screen.getByTestId('property-section-section-0')).toBeInTheDocument();
      expect(screen.getByTestId('tabs')).toBeInTheDocument();
    });
  });
});
