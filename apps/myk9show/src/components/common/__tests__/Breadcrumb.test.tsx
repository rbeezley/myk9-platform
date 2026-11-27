import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { Breadcrumb } from '../Breadcrumb';
import { crumbFor, type Crumb } from '../breadcrumbCrumb';
import { toPageHeaderCrumbs } from '../pageHeaderCrumbs';

// MYK9-2489: every crumb except the current page is a real link.
describe('Breadcrumb', () => {
  const items: Crumb[] = [
    { label: 'Heartland Classic', href: '/shows/show-1' },
    { label: 'Trial 1', href: '/trials/trial-1' },
    { label: 'Container Novice A', isCurrentPage: true },
  ];

  it('renders each ancestor as a link to its page, and the current page as text', () => {
    render(<Breadcrumb items={items} />);

    expect(screen.getByRole('link', { name: 'Heartland Classic' })).toHaveAttribute(
      'href',
      '/shows/show-1'
    );
    expect(screen.getByRole('link', { name: 'Trial 1' })).toHaveAttribute(
      'href',
      '/trials/trial-1'
    );
    expect(screen.getByText('Container Novice A')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Container Novice A' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('runs an ancestor onClick when its link is followed', async () => {
    const onClick = vi.fn();
    const { user } = render(
      <Breadcrumb items={[{ label: 'Shows', href: '/shows', onClick }, items[2]!]} />
    );

    await user.click(screen.getByRole('link', { name: 'Shows' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('links the home icon when asked for one', () => {
    render(<Breadcrumb items={items} showHomeIcon />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });
});

describe('crumbFor', () => {
  it('is a link for an ancestor and the current page otherwise', () => {
    expect(crumbFor('Shows', '/shows', false)).toEqual({ label: 'Shows', href: '/shows' });
    expect(crumbFor('Heartland', '/shows/1', true, '1')).toEqual({
      label: 'Heartland',
      isCurrentPage: true,
      id: '1',
    });
  });
});

describe('toPageHeaderCrumbs', () => {
  it('gives only the current page the path it is on', () => {
    expect(
      toPageHeaderCrumbs(
        [
          { label: 'Dogs', href: '/dogs' },
          { label: 'Rex', isCurrentPage: true },
        ],
        '/dogs/rex'
      )
    ).toEqual([
      { label: 'Dogs', href: '/dogs' },
      { label: 'Rex', href: '/dogs/rex' },
    ]);
  });
});

describe('the Crumb type (compile-time, checked by typecheck:tests)', () => {
  it('refuses an ancestor crumb with no destination', () => {
    // @ts-expect-error MYK9-2489: a crumb that is not the current page must carry an href.
    const forgotten: Crumb = { label: 'Shows' };
    // @ts-expect-error A crumb marked not-current still needs one.
    const notCurrent: Crumb = { label: 'Shows', isCurrentPage: false };
    const current: Crumb = { label: 'Add entry', isCurrentPage: true };

    expect([forgotten, notCurrent, current]).toHaveLength(3);
  });
});
