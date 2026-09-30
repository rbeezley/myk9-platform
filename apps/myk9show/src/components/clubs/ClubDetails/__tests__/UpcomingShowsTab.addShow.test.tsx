import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UpcomingShowsTab } from '../UpcomingShowsTab';

const noop = vi.fn();

describe('UpcomingShowsTab Add First Show (MYK9-890)', () => {
  it('offers Add First Show when the viewer can create shows', () => {
    render(
      <UpcomingShowsTab
        shows={[]}
        onViewShowDetails={noop}
        onRegisterForShow={noop}
        onAddShow={noop}
      />
    );
    expect(screen.getByRole('button', { name: /add first show/i })).toBeInTheDocument();
  });

  it('hides it, and says who can add shows, when the viewer cannot', () => {
    render(<UpcomingShowsTab shows={[]} onViewShowDetails={noop} onRegisterForShow={noop} />);
    expect(screen.queryByRole('button', { name: /add first show/i })).not.toBeInTheDocument();
    expect(screen.getByText(/added by the club's appointed secretaries/i)).toBeInTheDocument();
  });
});
