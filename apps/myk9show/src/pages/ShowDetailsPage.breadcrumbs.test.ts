import { describe, expect, it } from 'vitest';
import { showBreadcrumbs } from './ShowDetailsPage.breadcrumbs';

const show = { name: 'Spring Nosework Trial' };

describe('showBreadcrumbs', () => {
  it('starts a manager at Manage, linking to the secretary dashboard', () => {
    expect(showBreadcrumbs(true, show, 'show-1')).toEqual([
      { label: 'Manage', href: '/secretary/dashboard' },
      { label: 'Spring Nosework Trial', href: '/shows/show-1' },
    ]);
  });

  it('keeps Shows for anyone who does not manage the show', () => {
    expect(showBreadcrumbs(false, show, 'show-1')).toEqual([
      { label: 'Shows', href: '/shows' },
      { label: 'Spring Nosework Trial', href: '/shows/show-1' },
    ]);
  });

  it('shows no first crumb while the show loads, so a manager never sees Shows flip to Manage', () => {
    expect(showBreadcrumbs(false, undefined, 'show-1')).toEqual([
      { label: 'Show Details', href: '/shows/show-1' },
    ]);
  });
});
