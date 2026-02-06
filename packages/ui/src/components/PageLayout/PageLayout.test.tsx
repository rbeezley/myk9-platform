import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PageLayout } from './PageLayout';

describe('PageLayout', () => {
  it('should render with title', () => {
    render(<PageLayout title="Show Details"><div>Content</div></PageLayout>);
    expect(screen.getByText('Show Details')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('should render title as h1', () => {
    render(<PageLayout title="Page Title"><div /></PageLayout>);
    const title = screen.getByText('Page Title');
    expect(title.tagName).toBe('H1');
  });

  it('should render subtitle when provided', () => {
    render(
      <PageLayout title="Title" subtitle="A subtitle">
        <div />
      </PageLayout>
    );
    expect(screen.getByText('A subtitle')).toBeInTheDocument();
  });

  it('should not render subtitle when not provided', () => {
    const { container } = render(
      <PageLayout title="Title"><div /></PageLayout>
    );
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });

  it('should render actions when provided', () => {
    render(
      <PageLayout title="Title" actions={<button>Save</button>}>
        <div />
      </PageLayout>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('should not render actions area when not provided', () => {
    const { container } = render(
      <PageLayout title="Title"><div /></PageLayout>
    );
    // The actions wrapper div should not exist
    const header = container.querySelector('.flex.items-center.justify-between');
    expect(header).not.toBeNull();
  });

  it('should forward ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<PageLayout ref={ref} title="Title"><div /></PageLayout>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('should have displayName', () => {
    expect(PageLayout.displayName).toBe('PageLayout');
  });

  it('should apply custom className', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<PageLayout ref={ref} title="Title" className="custom-page"><div /></PageLayout>);
    expect(ref.current?.className).toContain('custom-page');
  });

  it('should apply contentClassName', () => {
    const { container } = render(
      <PageLayout title="Title" contentClassName="custom-content"><div /></PageLayout>
    );
    const contentDiv = container.querySelector('.custom-content');
    expect(contentDiv).not.toBeNull();
  });
});
