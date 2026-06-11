import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { ShowPhaseCard } from '../ShowPhaseCard';
import { showFactory } from '@/test/utils/factories';
import type { Show } from '@/types/show-types';

const TODAY = new Date().toISOString().split('T')[0];
const FUTURE = new Date(Date.now() + 14 * 86_400_000).toISOString().split('T')[0];
const PAST = new Date(Date.now() - 14 * 86_400_000).toISOString().split('T')[0];

const makeShow = (overrides: Partial<Show>) => showFactory.build(overrides);

function renderCard(props: Parameters<typeof ShowPhaseCard>[0]) {
  return render(
    <MemoryRouter>
      <ShowPhaseCard {...props} />
    </MemoryRouter>
  );
}

describe('ShowPhaseCard — today', () => {
  it('shows "Live today" chip', () => {
    const show = makeShow({ id: 's1', startDate: TODAY, status: 'in_progress' });
    renderCard({ show, phase: 'today', liveClassCount: 3, notStartedCount: 2, closedCount: 1 });
    expect(screen.getByText('Live today')).toBeInTheDocument();
  });

  it('shows class stage stats', () => {
    const show = makeShow({ id: 's1', startDate: TODAY, status: 'in_progress' });
    renderCard({ show, phase: 'today', liveClassCount: 4, notStartedCount: 1, closedCount: 2 });
    expect(screen.getByText(/4 live/)).toBeInTheDocument();
    expect(screen.getByText(/1 not started/)).toBeInTheDocument();
    expect(screen.getByText(/2 closed/)).toBeInTheDocument();
  });

  it('links to the workbench Show Desk sub-route', () => {
    const show = makeShow({ id: 'show-42', startDate: TODAY, status: 'in_progress' });
    renderCard({ show, phase: 'today' });
    const link = screen.getByRole('link', { name: /go to show/i });
    expect(link).toHaveAttribute('href', '/shows/show-42/show-desk');
  });
});

describe('ShowPhaseCard — upcoming', () => {
  it('shows "Entries open" chip for published shows', () => {
    const show = makeShow({ id: 's2', startDate: FUTURE, status: 'published' });
    renderCard({ show, phase: 'upcoming' });
    expect(screen.getByText('Entries open')).toBeInTheDocument();
  });

  it('shows "Entries closed" chip for upcoming-status shows', () => {
    const show = makeShow({ id: 's3', startDate: FUTURE, status: 'upcoming' });
    renderCard({ show, phase: 'upcoming' });
    expect(screen.getByText('Entries closed')).toBeInTheDocument();
  });

  it('shows days-to-show countdown', () => {
    const show = makeShow({ id: 's4', startDate: FUTURE, status: 'published' });
    renderCard({ show, phase: 'upcoming' });
    expect(screen.getByText(/in \d+ days/i)).toBeInTheDocument();
  });

  it('shows urgent deadline chip when close date is within 7 days', () => {
    const closeDate = new Date(Date.now() + 5 * 86_400_000).toISOString().split('T')[0];
    const show = makeShow({
      id: 's5',
      startDate: FUTURE,
      status: 'published',
      entryCloseDate: closeDate,
    });
    renderCard({ show, phase: 'upcoming' });
    expect(screen.getByText(/closes in/i)).toBeInTheDocument();
  });

  it('links to the workbench Setup (show base path)', () => {
    const show = makeShow({ id: 'show-99', startDate: FUTURE, status: 'published' });
    renderCard({ show, phase: 'upcoming' });
    const link = screen.getByRole('link', { name: /manage/i });
    expect(link).toHaveAttribute('href', '/shows/show-99/setup');
  });
});

describe('ShowPhaseCard — draft', () => {
  it('shows "Draft" chip', () => {
    const show = makeShow({ id: 's6', startDate: FUTURE, status: 'draft' });
    renderCard({ show, phase: 'draft' });
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('shows "Continue setup" CTA', () => {
    const show = makeShow({ id: 's7', startDate: FUTURE, status: 'draft' });
    renderCard({ show, phase: 'draft' });
    expect(screen.getByRole('link', { name: /continue setup/i })).toBeInTheDocument();
  });

  it('links to the workbench Setup (show base path)', () => {
    const show = makeShow({ id: 'draft-1', startDate: FUTURE, status: 'draft' });
    renderCard({ show, phase: 'draft' });
    const link = screen.getByRole('link', { name: /continue setup/i });
    expect(link).toHaveAttribute('href', '/shows/draft-1/setup');
  });
});

describe('ShowPhaseCard — past', () => {
  it('renders show name', () => {
    const show = makeShow({
      id: 's8',
      startDate: PAST,
      status: 'completed',
      name: 'Winter Classic',
    });
    renderCard({ show, phase: 'past' });
    expect(screen.getByText('Winter Classic')).toBeInTheDocument();
  });

  it('shows "View" link to the workbench Show Desk', () => {
    // Phase B5: the Wrap-up tab was removed; past-show review goes to Show
    // Desk where the conditional Closeout section surfaces.
    const show = makeShow({ id: 'past-7', startDate: PAST, status: 'completed' });
    renderCard({ show, phase: 'past' });
    const link = screen.getByRole('link', { name: /view/i });
    expect(link).toHaveAttribute('href', '/shows/past-7/show-desk');
  });
});
