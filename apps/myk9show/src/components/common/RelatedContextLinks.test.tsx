import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { RelatedContextLinks } from './RelatedContextLinks';

describe('RelatedContextLinks', () => {
  it('renders nothing when items is empty', () => {
    const { container } = render(<RelatedContextLinks items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a link for each item with the correct href', () => {
    render(
      <RelatedContextLinks
        items={[
          { key: 'trial', label: 'Trial: Obedience', href: '/shows/show-1/trials/trial-1' },
          { key: 'show', label: 'Spring Show', href: '/shows/show-1' },
        ]}
      />
    );

    const trialLink = screen.getByRole('link', { name: 'Trial: Obedience' });
    expect(trialLink).toHaveAttribute('href', '/shows/show-1/trials/trial-1');

    const showLink = screen.getByRole('link', { name: 'Spring Show' });
    expect(showLink).toHaveAttribute('href', '/shows/show-1');
  });
});
