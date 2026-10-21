import { describe, expect, it } from 'vitest';
import { showBreadcrumbs } from './ShowDetailsPage.breadcrumbs';

describe('showBreadcrumbs', () => {
  it('starts a manager at Manage, linking to the secretary dashboard', () => {
    expect(showBreadcrumbs(true, 'Spring Nosework Trial', 'show-1')).toEqual([
      { label: 'Manage', href: '/secretary/dashboard' },
      { label: 'Spring Nosework Trial', href: '/shows/show-1' },
    ]);
  });

  it('keeps Shows for anyone who does not manage the show', () => {
    expect(showBreadcrumbs(false, 'Spring Nosework Trial', 'show-1')).toEqual([
      { label: 'Shows', href: '/shows' },
      { label: 'Spring Nosework Trial', href: '/shows/show-1' },
    ]);
  });

  it('names a show that has not loaded yet', () => {
    expect(showBreadcrumbs(true, undefined, 'show-1')[1].label).toBe('Show Details');
  });
});
