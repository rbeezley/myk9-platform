import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { StickyNav } from '../sections/StickyNav';
import { FinalCtaSection } from '../sections/FinalCtaSection';

const ENTRY_URL = '/shows/abc-123/register';

const stickyNavProps = {
  showAbbreviation: 'SSW',
  trialStartDate: '2026-06-12',
  trialEndDate: '2026-06-14',
  timezone: 'America/New_York',
  venueName: 'Hall',
  venueCity: 'Town',
  entryCount: 3,
  entryLimit: 50,
  entryWizardUrl: ENTRY_URL,
};

const finalCtaProps = {
  entryWizardUrl: ENTRY_URL,
  classesHref: '/shows/show-1/classes',
  entryCloseDate: '2026-06-10',
  timezone: 'America/New_York',
};

describe('Poster StickyNav enter-CTA gating', () => {
  it('renders the Enter link when canEnterOnline is omitted (default true)', () => {
    const { container } = render(<StickyNav {...stickyNavProps} />);
    const link = container.querySelector(`a[href="${ENTRY_URL}"]`);
    expect(link).not.toBeNull();
  });

  it('renders the Enter link when canEnterOnline is true', () => {
    const { container } = render(<StickyNav {...stickyNavProps} canEnterOnline />);
    const link = container.querySelector(`a[href="${ENTRY_URL}"]`);
    expect(link).not.toBeNull();
  });

  it('hides the Enter link and shows the fallback when canEnterOnline is false', () => {
    const { container, getByText } = render(
      <StickyNav {...stickyNavProps} canEnterOnline={false} />
    );
    expect(container.querySelector(`a[href="${ENTRY_URL}"]`)).toBeNull();
    expect(getByText('Classes pending')).toBeTruthy();
  });

  it('shows closed-entry copy when entries are closed', () => {
    const { container, getByText, queryByText } = render(
      <StickyNav {...stickyNavProps} canEnterOnline={false} entryClosed />
    );
    expect(container.querySelector(`a[href="${ENTRY_URL}"]`)).toBeNull();
    expect(getByText('Entries closed')).toBeTruthy();
    expect(queryByText('Classes pending')).toBeNull();
  });
});

describe('Poster FinalCtaSection enter-CTA gating', () => {
  it('renders the Enter link when canEnterOnline is omitted (default true)', () => {
    const { container } = render(<FinalCtaSection {...finalCtaProps} />);
    const link = container.querySelector(`a[href="${ENTRY_URL}"]`);
    expect(link).not.toBeNull();
  });

  it('renders the Enter link when canEnterOnline is true', () => {
    const { container } = render(<FinalCtaSection {...finalCtaProps} canEnterOnline />);
    const link = container.querySelector(`a[href="${ENTRY_URL}"]`);
    expect(link).not.toBeNull();
  });

  it('hides the Enter link and shows the fallback copy when canEnterOnline is false', () => {
    const { container, getByText } = render(
      <FinalCtaSection {...finalCtaProps} canEnterOnline={false} />
    );
    expect(container.querySelector(`a[href="${ENTRY_URL}"]`)).toBeNull();
    expect(
      getByText('The secretary still needs to assign classes before online entry is available.')
    ).toBeTruthy();
  });

  it('shows closed-entry guidance when entries are closed', () => {
    const { container, getByText, queryByText } = render(
      <FinalCtaSection {...finalCtaProps} canEnterOnline={false} entryClosed />
    );
    expect(container.querySelector(`a[href="${ENTRY_URL}"]`)).toBeNull();
    expect(getByText(/Contact the trial secretary/i)).toBeTruthy();
    expect(queryByText(/classes are assigned/i)).toBeNull();
  });
});
