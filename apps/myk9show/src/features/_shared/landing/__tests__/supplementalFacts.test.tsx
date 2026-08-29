import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnTheDaySection as BannerOnTheDaySection } from '@/features/banner/landing/sections/OnTheDaySection';
import { ScheduleSection as FieldGuideScheduleSection } from '@/features/fieldGuide/landing/sections/ScheduleSection';
import { ClassifiedsSection } from '@/features/gazette/landing/sections/ClassifiedsSection';
import { PlanSection as MonogramPlanSection } from '@/features/monogram/landing/sections/PlanSection';
import { OnTheDaySection as PosterOnTheDaySection } from '@/features/poster/landing/sections/OnTheDaySection';
import { render } from '@/test/utils/testUtils';

const awards = 'Rosettes are presented after each trial.';
const houseRules = 'Dogs must remain leashed outside the search area.';

function expectFacts(): void {
  expect(screen.getByText(awards)).toBeInTheDocument();
  expect(screen.getByText(houseRules)).toBeInTheDocument();
}

describe('shared supplemental facts in formerly divergent landing styles', () => {
  it('renders Banner awards and house rules in the existing on-the-day section', () => {
    render(
      <BannerOnTheDaySection
        items={[]}
        hospitalityNotes={null}
        awardsDescription={awards}
        houseRulesNotes={houseRules}
        flag="#123456"
      />
    );
    expectFacts();
  });

  it('renders Field Guide awards and house rules in the existing schedule section', () => {
    render(
      <FieldGuideScheduleSection
        items={[]}
        hospitalityNotes={null}
        awardsDescription={awards}
        houseRulesNotes={houseRules}
      />
    );
    expectFacts();
  });

  it('renders Gazette house rules beside its existing awards classified', () => {
    render(
      <ClassifiedsSection
        accommodations={[]}
        hospitalityNotes={null}
        awardsDescription={awards}
        houseRulesNotes={houseRules}
        volumeRoman="I"
      />
    );
    expectFacts();
  });

  it('renders Monogram awards and house rules in the existing plan section', () => {
    render(
      <MonogramPlanSection
        accommodations={[]}
        hospitalityNotes={null}
        awardsDescription={awards}
        houseRulesNotes={houseRules}
      />
    );
    expectFacts();
  });

  it('renders Poster awards and house rules in the existing on-the-day section', () => {
    render(
      <PosterOnTheDaySection
        items={[]}
        hospitalityNotes={null}
        awardsDescription={awards}
        houseRulesNotes={houseRules}
      />
    );
    expectFacts();
  });
});
