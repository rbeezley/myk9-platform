import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MonogramSectionHead } from '../components/MonogramSectionHead';

describe('MonogramSectionHead', () => {
  it('renders the eyebrow text', () => {
    const { getByText } = render(
      <MonogramSectionHead numeral="ii" eyebrow="Trial particulars" title="All the facts" />
    );
    expect(getByText('Trial particulars')).toBeInTheDocument();
  });

  it('renders the folio numeral via MonogramSectionFolio', () => {
    const { container, getByText } = render(
      <MonogramSectionHead numeral="iv" eyebrow="The roster" title="Filling" />
    );
    expect(getByText('iv')).toBeInTheDocument();
    expect(container.querySelector('.mg-section-folio')).not.toBeNull();
  });

  it('renders the title as an h2', () => {
    const { container } = render(
      <MonogramSectionHead numeral="i" eyebrow="Letter from the chair" title="A welcome" />
    );
    expect(container.querySelector('h2')?.textContent).toBe('A welcome');
  });

  it('accepts ReactNode titles with italic accent fragments', () => {
    const { container } = render(
      <MonogramSectionHead
        numeral="ii"
        eyebrow="x"
        title={
          <>
            All the <span className="italic">facts</span>
          </>
        }
      />
    );
    expect(container.querySelector('h2 span.italic')?.textContent).toBe('facts');
  });

  it('uses the mg-section__head class so monogram.css selectors apply', () => {
    const { container } = render(
      <MonogramSectionHead numeral="i" eyebrow="x" title="y" />
    );
    expect(container.querySelector('.mg-section__head')).not.toBeNull();
  });
});
