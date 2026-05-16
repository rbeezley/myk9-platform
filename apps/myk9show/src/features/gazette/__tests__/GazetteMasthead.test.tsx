import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GazetteMasthead } from '../components/GazetteMasthead';

describe('GazetteMasthead', () => {
  it('renders the club name plain when fewer than 3 words', () => {
    const { container } = render(<GazetteMasthead clubName="Bexar Gazette" />);
    const title = container.querySelector('.gz-masthead__title');
    expect(title).toHaveTextContent('Bexar Gazette');
    // No <em> wrap when word count < 3
    expect(title?.querySelectorAll('em').length).toBe(0);
  });

  it('auto-italicizes first and last word when clubName has 3+ words', () => {
    const { container } = render(
      <GazetteMasthead clubName="Bexar County Kennel Club" />
    );
    const ems = container.querySelectorAll('.gz-masthead__title em');
    expect(ems.length).toBe(2);
    expect(ems[0]).toHaveTextContent('Bexar');
    expect(ems[1]).toHaveTextContent('Club');
  });

  it('keeps middle words straight (non-italic) between the bookends', () => {
    const { container } = render(<GazetteMasthead clubName="The Mockingbird Press Gazette" />);
    const title = container.querySelector('.gz-masthead__title');
    expect(title?.textContent).toMatch(/The.+Mockingbird Press.+Gazette/);
  });

  it('renders an explicit titleSlot when provided, bypassing auto-italic', () => {
    render(
      <GazetteMasthead
        titleSlot={<span data-testid="custom-title">Custom Title Here</span>}
      />
    );
    expect(screen.getByTestId('custom-title')).toHaveTextContent('Custom Title Here');
  });

  it('renders volume + edition in the top strip', () => {
    const { container } = render(
      <GazetteMasthead clubName="Bexar County Gazette" volumeRoman="LXXIX" edition={47} />
    );
    expect(container.querySelector('.gz-masthead__strip')).toHaveTextContent('VOL. LXXIX · NO 47');
  });

  it('omits the volume cell when volumeRoman is null', () => {
    const { container } = render(
      <GazetteMasthead clubName="Bexar County Gazette" volumeRoman={null} edition={47} />
    );
    expect(container.querySelector('.gz-masthead__strip')?.textContent).toContain('NO 47');
    expect(container.querySelector('.gz-masthead__strip')?.textContent).not.toContain('VOL.');
  });

  it('renders the motto in italic body type inside the sub-strip', () => {
    const { container } = render(
      <GazetteMasthead clubName="Test Club Gazette" motto="A worthy register" />
    );
    expect(container.querySelector('.gz-masthead__sub-center')).toHaveTextContent(
      /A worthy register/
    );
  });

  it('applies title rise-in animation classes by default', () => {
    const { container } = render(<GazetteMasthead clubName="Animated Test Gazette" />);
    expect(container.querySelector('.gz-masthead__title')).toHaveClass('gz-rise', 'delay-1');
  });

  it('suppresses animation classes when noAnimation is set', () => {
    const { container } = render(
      <GazetteMasthead clubName="Static Test Gazette" noAnimation />
    );
    const title = container.querySelector('.gz-masthead__title');
    expect(title).not.toHaveClass('gz-rise');
  });

  // ─── Word-split edge cases (review issue #10) ─────────────────────────────
  // The auto-italic rule splits on any whitespace and italicizes the
  // first + last *token*. These cases document the behavior for club
  // names with hyphens, periods, possessives, and acronym embedding.

  it('treats a hyphenated word as a single token', () => {
    const { container } = render(
      <GazetteMasthead clubName="Bexar-County Kennel Club" />
    );
    const ems = container.querySelectorAll('.gz-masthead__title em');
    expect(ems.length).toBe(2);
    expect(ems[0]).toHaveTextContent('Bexar-County');
    expect(ems[1]).toHaveTextContent('Club');
  });

  it('keeps trailing punctuation attached to the italicized last word', () => {
    const { container } = render(
      <GazetteMasthead clubName="The Working Dog Co." />
    );
    const ems = container.querySelectorAll('.gz-masthead__title em');
    expect(ems[1]).toHaveTextContent('Co.');
  });

  it('italicizes around an embedded apostrophe', () => {
    const { container } = render(
      <GazetteMasthead clubName="St. John's Kennel Club" />
    );
    const ems = container.querySelectorAll('.gz-masthead__title em');
    expect(ems[0]).toHaveTextContent('St.');
    expect(ems[1]).toHaveTextContent('Club');
  });

  it('does not italicize single-word names (e.g. acronyms)', () => {
    const { container } = render(<GazetteMasthead clubName="AKC" />);
    const ems = container.querySelectorAll('.gz-masthead__title em');
    expect(ems.length).toBe(0);
    expect(container.querySelector('.gz-masthead__title')).toHaveTextContent('AKC');
  });

  it('handles trailing whitespace gracefully', () => {
    const { container } = render(<GazetteMasthead clubName="   Bexar County Gazette  " />);
    const ems = container.querySelectorAll('.gz-masthead__title em');
    expect(ems.length).toBe(2);
    expect(ems[0]).toHaveTextContent('Bexar');
    expect(ems[1]).toHaveTextContent('Gazette');
  });
});
