import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { RosterSection as MonogramRoster } from '@/features/monogram/landing/sections/RosterSection';
import { RosterSection as PosterRoster } from '@/features/poster/landing/sections/RosterSection';
import { RosterSection as BannerRoster } from '@/features/banner/landing/sections/RosterSection';
import { RosterSection as GazetteRoster } from '@/features/gazette/landing/sections/RosterSection';
import { RosterSection as MagazineRoster } from '@/features/magazine/landing/sections/RosterSection';

const base = {
  entryCount: 4,
  entryLimit: 60,
  journeySteps: [],
  timezone: 'America/Chicago',
  volumeRoman: 'I',
  flag: '#c00',
  flagText: '#900',
  flagBright: '#f33',
};

const styles: Array<[string, ComponentType<Record<string, unknown>>]> = [
  ['monogram', MonogramRoster as unknown as ComponentType<Record<string, unknown>>],
  ['poster', PosterRoster as unknown as ComponentType<Record<string, unknown>>],
  ['banner', BannerRoster as unknown as ComponentType<Record<string, unknown>>],
  ['gazette', GazetteRoster as unknown as ComponentType<Record<string, unknown>>],
  ['magazine', MagazineRoster as unknown as ComponentType<Record<string, unknown>>],
];

describe('roster heading once the show has happened (MYK9-1288)', () => {
  it.each(styles)('%s drops the filling pace and reads as a final roster', (_name, Roster) => {
    const { container } = render(<Roster {...base} pastShow />);

    expect(container.textContent).toMatch(/final\s*roster/i);
    expect(container.textContent).not.toMatch(/filling/i);
  });

  it.each(styles)('%s still reports a pace before the show', (_name, Roster) => {
    const { container } = render(<Roster {...base} />);

    expect(container.textContent).toMatch(/filling/i);
    expect(screen.queryByText(/final roster/i)).not.toBeInTheDocument();
  });
});
