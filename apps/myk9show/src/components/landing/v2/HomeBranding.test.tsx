import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import Home from '@/pages/Home';

vi.mock('@/features/show-today/ShowTodayBanner', () => ({
  ShowTodayBanner: () => null,
}));

describe('Home branding copy', () => {
  it('mentions the approved ringside lineage once on the homepage', () => {
    render(<Home />, { initialRoute: '/' });

    const lineageMatches = screen.getAllByText(
      "It's the ringside experience you may know as myK9Q, now built right in."
    );
    expect(lineageMatches).toHaveLength(1);
    const [lineageCopy] = lineageMatches;
    expect(lineageCopy).toBeInTheDocument();
    expect({
      offlineEyebrow: screen.getByText('Offline-first · Ringside').textContent,
      lineage: lineageCopy.textContent,
      footerLink: screen.getByRole('link', { name: 'Offline ringside' }).textContent,
      credibilityCard: screen.getByText('Offline scoring and ring-flow tools.').textContent,
    }).toMatchInlineSnapshot(`
      {
        "credibilityCard": "Offline scoring and ring-flow tools.",
        "footerLink": "Offline ringside",
        "lineage": "It's the ringside experience you may know as myK9Q, now built right in.",
        "offlineEyebrow": "Offline-first · Ringside",
      }
    `);
  });
});
