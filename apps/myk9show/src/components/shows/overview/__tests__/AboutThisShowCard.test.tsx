import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';
import { AboutThisShowCard } from '../AboutThisShowCard';

vi.mock('@/components/shows/overview/ShowOfficials', () => ({
  ShowOfficials: () => <div data-testid="officials" />,
}));
vi.mock('@/components/shows/overview/JudgesList', () => ({
  JudgesList: () => <div data-testid="judges" />,
}));
vi.mock('@/components/shows/overview/ShareEvent', () => ({
  ShareEvent: () => <div data-testid="share" />,
}));

const show = {
  id: 'show-1',
  name: 'Heartland Classic',
  location: 'Tulsa, OK',
  clubName: 'Heartland Club',
  assignedJudges: [],
} as unknown as Show;

describe('AboutThisShowCard (MYK9-955)', () => {
  it('starts folded and offers Edit show and View as exhibitor', async () => {
    const { user } = render(<AboutThisShowCard show={show} />, {
      initialRoute: '/shows/show-1?focus=class-1',
    });

    expect(screen.queryByTestId('officials')).toBeNull();
    expect(screen.getByRole('link', { name: /edit show/i })).toHaveAttribute(
      'href',
      '/shows/show-1?focus=class-1&edit=true'
    );
    const preview = screen.getByRole('link', { name: /view as exhibitor/i }).getAttribute('href');
    expect(preview).toContain('preview=public');
    expect(decodeURIComponent(preview ?? '')).toContain('returnTo=/shows/show-1?focus=class-1');

    await user.click(screen.getByRole('button', { name: /about this show/i }));
    expect(screen.getByTestId('officials')).toBeInTheDocument();
    expect(screen.getByTestId('judges')).toBeInTheDocument();
  });
});
