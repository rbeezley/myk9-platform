import { describe, expect, it } from 'vitest';
import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { render } from '@testing-library/react';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import { ClubStatistics } from '../ClubStatistics';
import type { PrimaryTabDef } from '@/components/common/PrimaryTabs';

const tabs: PrimaryTabDef[] = [
  { id: 'upcoming', label: 'Upcoming Shows' },
  { id: 'past', label: 'Past Shows' },
  { id: 'about', label: 'About' },
  { id: 'members', label: 'Members' },
  { id: 'branding', label: 'Branding' },
];

function ClubProfileInteractionHarness() {
  const [activeTab, setActiveTab] = useUrlTab(
    ['upcoming', 'past', 'about', 'members', 'branding'],
    'upcoming'
  );

  return (
    <>
      <ClubStatistics
        stats={[
          {
            title: 'Active Members',
            value: '3',
            detail1: '3 members',
            detail2: 'In club roster',
            type: 'members',
            tab: 'members',
          },
        ]}
        onTabChange={setActiveTab}
      />
      <PrimaryTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab}>
        <TabsContent value="upcoming">Upcoming panel</TabsContent>
        <TabsContent value="past">Past panel</TabsContent>
        <TabsContent value="about">About panel</TabsContent>
        <TabsContent value="members">Members panel</TabsContent>
        <TabsContent value="branding">Branding panel</TabsContent>
      </PrimaryTabs>
      <LocationProbe />
    </>
  );
}

function LocationProbe() {
  const [searchParams] = useSearchParams();
  return <output data-testid="search-params">{searchParams.toString()}</output>;
}

describe('club profile interactions', () => {
  it('activates profile tabs through the real pointer path', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ClubProfileInteractionHarness />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('tab', { name: 'About' }));

    expect(screen.getByRole('tab', { name: 'About' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('About panel')).toBeVisible();
    expect(screen.getByTestId('search-params')).toHaveTextContent('tab=about');
  });

  it('activates a statistic-card shortcut with keyboard input', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ClubProfileInteractionHarness />
      </MemoryRouter>
    );

    const card = screen.getByRole('button', { name: /active members/i });
    await user.tab();
    expect(card).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Members panel')).toBeVisible();
    expect(screen.getByTestId('search-params')).toHaveTextContent('tab=members');
  });
});
