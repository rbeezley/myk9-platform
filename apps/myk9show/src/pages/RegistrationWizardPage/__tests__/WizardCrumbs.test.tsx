import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { WizardCrumbs } from '../WizardCrumbs';

// MYK9-2489: on the secretary's Add entry wizard, "Shows" and the show name were plain text.
describe('WizardCrumbs', () => {
  it('links Shows and the show name, and marks the wizard as the current page', () => {
    render(
      <WizardCrumbs showId="show-1" showName="Heartland UKC Nosework" workflowLabel="Add entry" />
    );

    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(screen.getByRole('link', { name: 'Shows' })).toHaveAttribute('href', '/shows');
    expect(screen.getByRole('link', { name: 'Heartland UKC Nosework' })).toHaveAttribute(
      'href',
      '/shows/show-1'
    );
    expect(screen.getByText('Add entry')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Add entry' })).not.toBeInTheDocument();
    expect(trail).toContainElement(screen.getByText('Add entry'));
  });

  it('opens each crumb in a new tab, so an entry in progress is never dropped (MYK9-1973)', () => {
    render(<WizardCrumbs showId="show-1" showName="Heartland" workflowLabel="Add entry" />);

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('sends the show crumb to the list while the show has not loaded', () => {
    render(<WizardCrumbs showId={undefined} showName={undefined} workflowLabel="Add entry" />);

    expect(screen.getByRole('link', { name: 'Show' })).toHaveAttribute('href', '/shows');
  });
});
