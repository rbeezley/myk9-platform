import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { Button } from '@/components/ui/button';
import { PhaseShell } from '../PhaseShell';

describe('PhaseShell', () => {
  it('names the region and its heading for screen readers, and draws only the actions', () => {
    render(<PhaseShell title="Your show" actions={<Button>Tools</Button>} />);

    const region = screen.getByRole('region', { name: 'Your show' });
    expect(region).toContainElement(screen.getByRole('button', { name: 'Tools' }));
    // The heading stays for the outline and the e2e loaded signal, but is not drawn.
    expect(screen.getByRole('heading', { level: 2, name: 'Your show' }).className).toContain(
      'sr-only'
    );
  });

  it('renders no actions slot without actions', () => {
    render(<PhaseShell title="Your show" />);
    expect(screen.getByRole('region', { name: 'Your show' }).children).toHaveLength(1);
  });
});
