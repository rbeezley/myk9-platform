import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { Dialog, DialogContent, DialogTitle } from './dialog';

describe('DialogContent', () => {
  it('keeps long unbreakable content inside a single flexible grid column', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Calendar feed</DialogTitle>
          <code data-testid="long-token">https://myk9show.com/calendar/{'x'.repeat(400)}</code>
        </DialogContent>
      </Dialog>
    );

    const content = screen.getByRole('dialog');
    expect(content).toHaveClass('grid-cols-[minmax(0,1fr)]');
    expect(screen.getByTestId('long-token')).toBeInTheDocument();
  });
});
