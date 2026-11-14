import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { render } from '@/test/utils/testUtils';
import { CloseTheShowLink } from './CloseTheShowLink';

describe('CloseTheShowLink', () => {
  it('points on to the close step', () => {
    render(<CloseTheShowLink showId="show-1" />);

    expect(screen.getByRole('link', { name: 'Close the show' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=close'
    );
  });
});
