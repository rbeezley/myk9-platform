import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AtShowClassRefreshResult } from './AtShowClassListToolbar';
import { CLASS_REFRESH_MESSAGES } from './useAtShowClassRefresh';

describe('AtShowClassRefreshResult floating (MYK9-1746)', () => {
  it('keeps one live region mounted and puts the answer in it', () => {
    const { rerender } = render(<AtShowClassRefreshResult phase="idle" floating />);
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('');

    rerender(<AtShowClassRefreshResult phase="offline" floating />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent(CLASS_REFRESH_MESSAGES.offline);
  });

  it('pins to the viewport so a scrolled steward still sees it', () => {
    render(<AtShowClassRefreshResult phase="failed" floating />);
    expect(screen.getByRole('status').className).toContain('fixed');
  });

  it('renders nothing for the inline class-list variant while idle', () => {
    const { container } = render(<AtShowClassRefreshResult phase="idle" />);
    expect(container).toBeEmptyDOMElement();
  });
});
