import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LeadArticleSection } from '../sections/LeadArticleSection';

const BASE_PROPS = {
  showName: 'Spring Scent Work Trial',
  showSubtitle: 'An A.K.C. Licensed Trial · Six Trials',
  welcomeText: null,
  trialChairName: null,
  trialChairTitle: null,
  trialStartDate: '2026-06-12',
  trialEndDate: '2026-06-14',
  timezone: 'America/Chicago',
};

describe('LeadArticleSection', () => {
  it('mounts the #welcome anchor on the outer section wrapper (review fix #1)', () => {
    const { container } = render(<LeadArticleSection {...BASE_PROPS} />);
    const welcome = container.querySelector('#welcome');
    expect(welcome).toBeInTheDocument();
    // The lead article (front-page title + dek) must live INSIDE #welcome so
    // that anchor-scrolling from the sticky nav lands on the title, not on
    // the body columns three screenfuls down.
    expect(welcome?.querySelector('h2')).toHaveTextContent(/Spring Scent Work Trial/);
  });

  it('renders the show name as the front-page lead headline', () => {
    const { container } = render(<LeadArticleSection {...BASE_PROPS} />);
    expect(container.querySelector('h2')).toHaveTextContent('Spring Scent Work Trial');
  });

  it('renders the subtitle as the italic dek', () => {
    // Subtitle appears twice with null welcomeText: once in the dek, once
    // woven into the neutral default lead paragraph inside the columns.
    // Scope the query to the front-page lead <p>, which is the only place
    // it should appear as the *standalone* italic dek.
    const { container } = render(<LeadArticleSection {...BASE_PROPS} />);
    const dek = container.querySelector('article > p');
    expect(dek?.textContent).toMatch(/An A.K.C. Licensed Trial · Six Trials/);
  });

  it('renders the byline only when trialChairName is supplied', () => {
    const { container: withoutChair } = render(<LeadArticleSection {...BASE_PROPS} />);
    expect(withoutChair.textContent).not.toMatch(/Special to the Gazette/);

    const { container: withChair } = render(
      <LeadArticleSection {...BASE_PROPS} trialChairName="Sarah Whitman" trialChairTitle="Trial Chair" />
    );
    expect(withChair.textContent).toMatch(/By Sarah Whitman, Trial Chair · Special to the Gazette/);
  });

  it('renders the "Continued on §02" link pointing at #particulars', () => {
    const { container } = render(<LeadArticleSection {...BASE_PROPS} />);
    const continued = container.querySelector('.gz-continued a');
    expect(continued).toBeInTheDocument();
    expect(continued?.getAttribute('href')).toBe('#particulars');
    expect(continued?.textContent).toMatch(/Continued on §02/);
  });

  it('renders the 3-column body wrapper for the drop-cap article', () => {
    const { container } = render(<LeadArticleSection {...BASE_PROPS} />);
    expect(container.querySelector('.gz-columns')).toBeInTheDocument();
  });

  it('renders a drop cap inside the columns (Unicode-aware)', () => {
    const { container } = render(
      <LeadArticleSection {...BASE_PROPS} welcomeText="For seventy-nine years our club has shown." />
    );
    const cap = container.querySelector('.gz-dropcap');
    expect(cap).toHaveTextContent('F');
  });

  it('splits welcomeText into paragraphs on blank-line boundaries', () => {
    const welcomeText = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const { container } = render(
      <LeadArticleSection {...BASE_PROPS} welcomeText={welcomeText} />
    );
    // The first paragraph is consumed by the drop-cap component (which emits
    // its own <p>); the remaining two render as direct siblings inside
    // .gz-columns. Total p count inside the column container: 3.
    const columnsParas = container.querySelectorAll('.gz-columns p');
    expect(columnsParas).toHaveLength(3);
    // Verify each paragraph's content lands in the right slot — proves the
    // split landed on the right boundaries, not just that the count matches.
    expect(columnsParas[0].textContent).toContain('First paragraph.');
    expect(columnsParas[1].textContent).toBe('Second paragraph.');
    expect(columnsParas[2].textContent).toBe('Third paragraph.');
  });

  it('exposes the lead h2 id used by the welcome section\'s aria-labelledby', () => {
    // Review fix A4 — <section id="welcome"> carries aria-labelledby pointing
    // at the lead h2. The id contract must not silently drift.
    const { container } = render(<LeadArticleSection {...BASE_PROPS} />);
    const section = container.querySelector('#welcome');
    expect(section?.getAttribute('aria-labelledby')).toBe('gz-lead-title');
    const heading = container.querySelector('#gz-lead-title');
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent).toContain('Spring Scent Work Trial');
  });

  it('falls back to a neutral default lead (no editorial fiction) when welcomeText is null', () => {
    // Review fix #3 — the fallback must not claim anything that could be
    // false about a brand-new club or a first-run trial. The phrase "last
    // spring's meeting filled" used to appear here and now must not.
    const { container } = render(<LeadArticleSection {...BASE_PROPS} welcomeText={null} />);
    expect(container.textContent).not.toMatch(/last spring/i);
    expect(container.textContent).not.toMatch(/filled well before/i);
    // The neutral fallback should still print the show name as factual
    // anchor copy inside the column body.
    expect(container.querySelector('.gz-columns')?.textContent).toMatch(
      /Spring Scent Work Trial/
    );
  });
});
