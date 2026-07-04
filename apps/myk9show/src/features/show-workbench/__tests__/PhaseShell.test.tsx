import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { Button } from '@/components/ui/button';
import { PhaseShell } from '../PhaseShell';

describe('PhaseShell', () => {
  it('stacks title and actions on mobile while preserving desktop alignment', () => {
    render(
      <PhaseShell
        title="Heartland Scent Work Classic With A Very Long Show Desk Title"
        kicker="During the show"
        actions={<Button>Tools</Button>}
      />
    );

    const shell = screen.getByLabelText(
      'Heartland Scent Work Classic With A Very Long Show Desk Title'
    );
    expect(shell.className).toContain('flex-col');
    expect(shell.className).toContain('sm:flex-row');
    const heading = screen.getByRole('heading', {
      name: 'Heartland Scent Work Classic With A Very Long Show Desk Title',
    });
    expect(heading.className).toContain('truncate');
    expect(heading).toHaveAttribute(
      'title',
      'Heartland Scent Work Classic With A Very Long Show Desk Title'
    );
    expect(heading.parentElement?.className).toContain('min-w-0');
    expect(heading.parentElement?.className).toContain('flex-1');
    const actions = screen.getByRole('button', { name: 'Tools' }).parentElement;
    expect(actions?.className).toContain('w-full');
    expect(actions?.className).toContain('sm:shrink-0');
  });
});
