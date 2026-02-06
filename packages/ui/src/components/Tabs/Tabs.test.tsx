import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

describe('Tabs', () => {
  it('should have displayName', () => {
    expect(Tabs.displayName).toBe('Tabs');
  });

  it('should render a complete tabs setup', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );
    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
    expect(screen.getByText('Content 1')).toBeInTheDocument();
  });
});

describe('TabsList', () => {
  it('should have displayName', () => {
    expect(TabsList.displayName).toBe('TabsList');
  });

  it('should apply custom className', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList className="custom-list" data-testid="list">
          <TabsTrigger value="tab1">Tab</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content</TabsContent>
      </Tabs>
    );
    expect(screen.getByTestId('list').className).toContain('custom-list');
  });
});

describe('TabsTrigger', () => {
  it('should have displayName', () => {
    expect(TabsTrigger.displayName).toBe('TabsTrigger');
  });

  it('should render as a button', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content</TabsContent>
      </Tabs>
    );
    expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument();
  });
});

describe('TabsContent', () => {
  it('should have displayName', () => {
    expect(TabsContent.displayName).toBe('TabsContent');
  });

  it('should render the active tab content', () => {
    render(
      <Tabs defaultValue="second">
        <TabsList>
          <TabsTrigger value="first">First</TabsTrigger>
          <TabsTrigger value="second">Second</TabsTrigger>
        </TabsList>
        <TabsContent value="first">First content</TabsContent>
        <TabsContent value="second">Second content</TabsContent>
      </Tabs>
    );
    expect(screen.getByText('Second content')).toBeInTheDocument();
  });
});
