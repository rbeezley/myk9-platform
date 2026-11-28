import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ResultLabelCell } from './ResultLabelCell';
import type { ResultLabelItem } from '@/lib/labels/resultLabelData';

const item = { armband: '27', callName: 'Ditto' } as ResultLabelItem;

describe('ResultLabelCell armband', () => {
  it('renders the accent badge on screen', () => {
    render(<ResultLabelCell item={item} screen />);
    expect(screen.getByText('27')).toHaveClass('bg-primary');
    expect(screen.getByText('27')).toHaveTextContent('Armband 27');
    expect(screen.queryByText('#27')).toBeNull();
  });

  it('keeps the plain printed text for the physical label', () => {
    render(<ResultLabelCell item={item} />);
    expect(screen.getByText('#27')).toBeInTheDocument();
  });

  it.each(['', '0', '-'])('keeps the printed text on screen for unassigned %j', armband => {
    render(<ResultLabelCell item={{ ...item, armband }} screen />);
    expect(screen.queryByText(/Armband/)).toBeNull();
    expect(document.querySelector('.bg-primary')).toBeNull();
    expect(document.querySelector('.text-muted-foreground')).toBeNull();
  });
});
