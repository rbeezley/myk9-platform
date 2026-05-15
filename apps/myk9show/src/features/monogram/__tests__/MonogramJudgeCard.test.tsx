import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MonogramJudgeCard } from '../components/MonogramJudgeCard';

describe('MonogramJudgeCard', () => {
  it('renders the judge name as an h3', () => {
    const { container } = render(<MonogramJudgeCard name="Catherine Beagles" />);
    expect(container.querySelector('h3')?.textContent).toBe('Catherine Beagles');
  });

  it('derives 2-letter initials from the name by default', () => {
    const { getByText } = render(<MonogramJudgeCard name="Catherine Beagles" />);
    // Two-word name → "CB"
    expect(getByText('CB')).toBeInTheDocument();
  });

  it('caps initials at 2 letters for the 64px portrait slot', () => {
    const { getByText } = render(<MonogramJudgeCard name="Mary Anne Whitfield" />);
    // Three-word name should still yield two initials, not three.
    expect(getByText('MA')).toBeInTheDocument();
  });

  it('honors an explicit initialsOverride', () => {
    const { getByText } = render(
      <MonogramJudgeCard name="Catherine Beagles" initialsOverride="CCB" />
    );
    expect(getByText('CCB')).toBeInTheDocument();
  });

  it('renders the credential line when supplied', () => {
    const { getByText } = render(
      <MonogramJudgeCard name="Marcus Whitfield" credential="Exteriors · Buried" />
    );
    expect(getByText('Exteriors · Buried')).toBeInTheDocument();
  });

  it('omits the credential line when null', () => {
    const { container } = render(<MonogramJudgeCard name="Marcus Whitfield" credential={null} />);
    expect(container.querySelector('.mg-judge-card__credential')).toBeNull();
  });

  it('renders the bio paragraph when supplied', () => {
    const { getByText } = render(
      <MonogramJudgeCard name="Marcus Whitfield" bio="Twenty years as a detection-dog handler." />
    );
    expect(getByText(/Twenty years/)).toBeInTheDocument();
  });

  it('renders without crashing when only a name is supplied', () => {
    const { container } = render(<MonogramJudgeCard name="Solo" />);
    expect(container.querySelector('article')).not.toBeNull();
  });
});
