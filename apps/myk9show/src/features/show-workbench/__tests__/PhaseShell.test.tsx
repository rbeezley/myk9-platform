import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { Button } from '@/components/ui/button';
import { PhaseShell } from '../PhaseShell';

describe('PhaseShell', () => {
  it('stacks title and actions on mobile while preserving desktop alignment', () => {
    render(
      <PhaseShell title="Show Desk" kicker="During the show" actions={<Button>Tools</Button>} />
    );

    const shell = screen.getByLabelText('Show Desk');
    expect(shell.className).toContain('flex-col');
    expect(shell.className).toContain('sm:flex-row');
    expect(screen.getByRole('heading', { name: 'Show Desk' }).className).toContain('break-words');
    expect(screen.getByRole('button', { name: 'Tools' }).parentElement?.className).toContain(
      'w-full'
    );
  });
});
