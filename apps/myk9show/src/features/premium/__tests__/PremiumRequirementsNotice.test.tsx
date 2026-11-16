import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { PremiumRequirementsNotice } from '../PremiumRequirementsNotice';

describe('PremiumRequirementsNotice (MYK9-2053)', () => {
  it('renders nothing when nothing is missing', () => {
    const { container } = render(<PremiumRequirementsNotice items={[]} registry="AKC" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each fact with a link to its field, and none for a fact with no home', () => {
    render(
      <PremiumRequirementsNotice
        registry="AKC"
        items={[
          {
            id: 'venue',
            key: 'venue',
            message: 'AKC requires the show location. Add it in Edit show.',
            href: '/shows/s1?edit=true',
          },
          {
            id: 'committee',
            key: 'committee',
            message: 'AKC requires an Event Committee.',
            href: null,
          },
        ]}
      />
    );
    expect(screen.getByText(/AKC requires the show location/)).toBeInTheDocument();
    expect(screen.getByText(/AKC requires an Event Committee/)).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/shows/s1?edit=true');
  });

  it('names the registry in the heading', () => {
    render(
      <PremiumRequirementsNotice
        registry="AKC"
        items={[
          { id: 'venue', key: 'venue', message: 'AKC requires the show location.', href: null },
        ]}
      />
    );
    expect(screen.getByText('Before you publish, AKC still needs:')).toBeInTheDocument();
  });
});
