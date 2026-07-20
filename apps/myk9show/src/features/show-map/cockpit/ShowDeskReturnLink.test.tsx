import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { render } from '@/test/utils/testUtils';

import { ShowDeskReturnLink } from './ShowDeskReturnLink';

function renderLink(returnTo: string) {
  render(
    <Routes>
      <Route path="/shows/:showId/reports" element={<ShowDeskReturnLink showId="show-1" />} />
    </Routes>,
    {
      initialRoute: `/shows/show-1/reports?returnTo=${encodeURIComponent(returnTo)}`,
    }
  );
}

describe('ShowDeskReturnLink', () => {
  it('renders a validated Back to Show Desk destination', () => {
    renderLink('/shows/show-1/show-desk?focus=class-1&filter=in-progress');
    expect(screen.getByRole('link', { name: 'Back to Show Desk' })).toHaveAttribute(
      'href',
      '/shows/show-1/show-desk?filter=in-progress&focus=class-1'
    );
  });

  it('does not render for an untrusted return destination', () => {
    renderLink('https://evil.example/steal');
    expect(screen.queryByRole('link', { name: 'Back to Show Desk' })).not.toBeInTheDocument();
  });
});
