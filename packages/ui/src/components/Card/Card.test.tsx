import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';

describe('Card', () => {
  it('should render with children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(<Card className="custom" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card').className).toContain('custom');
  });

  it('should forward ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Card ref={ref}>Content</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('should have displayName', () => {
    expect(Card.displayName).toBe('Card');
  });
});

describe('CardHeader', () => {
  it('should render with children', () => {
    render(<CardHeader>Header</CardHeader>);
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('should forward ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<CardHeader ref={ref}>Header</CardHeader>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('should have displayName', () => {
    expect(CardHeader.displayName).toBe('CardHeader');
  });
});

describe('CardTitle', () => {
  it('should render as h3', () => {
    render(<CardTitle>Title</CardTitle>);
    const title = screen.getByText('Title');
    expect(title.tagName).toBe('H3');
  });

  it('should forward ref', () => {
    const ref = React.createRef<HTMLHeadingElement>();
    render(<CardTitle ref={ref}>Title</CardTitle>);
    expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
  });

  it('should have displayName', () => {
    expect(CardTitle.displayName).toBe('CardTitle');
  });
});

describe('CardDescription', () => {
  it('should render as p', () => {
    render(<CardDescription>Description</CardDescription>);
    const desc = screen.getByText('Description');
    expect(desc.tagName).toBe('P');
  });

  it('should have displayName', () => {
    expect(CardDescription.displayName).toBe('CardDescription');
  });
});

describe('CardContent', () => {
  it('should render with children', () => {
    render(<CardContent>Body</CardContent>);
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('should have displayName', () => {
    expect(CardContent.displayName).toBe('CardContent');
  });
});

describe('CardFooter', () => {
  it('should render with children', () => {
    render(<CardFooter>Footer</CardFooter>);
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('should have displayName', () => {
    expect(CardFooter.displayName).toBe('CardFooter');
  });
});

describe('Card composition', () => {
  it('should compose all sub-components together', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>My Title</CardTitle>
          <CardDescription>My Description</CardDescription>
        </CardHeader>
        <CardContent>My Content</CardContent>
        <CardFooter>My Footer</CardFooter>
      </Card>
    );

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('My Description')).toBeInTheDocument();
    expect(screen.getByText('My Content')).toBeInTheDocument();
    expect(screen.getByText('My Footer')).toBeInTheDocument();
  });
});
