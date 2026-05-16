import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GazetteDropCap } from '../components/GazetteDropCap';

describe('GazetteDropCap', () => {
  it('wraps the first character in a .gz-dropcap span', () => {
    const { container } = render(<GazetteDropCap>For seventy-nine years.</GazetteDropCap>);
    const cap = container.querySelector('.gz-dropcap');
    expect(cap).toBeInTheDocument();
    expect(cap).toHaveTextContent('F');
  });

  it('renders the remainder of the lead as paragraph body text', () => {
    const { container } = render(<GazetteDropCap>For seventy-nine years.</GazetteDropCap>);
    const p = container.querySelector('p');
    expect(p?.textContent).toBe('For seventy-nine years.');
  });

  it('trims leading whitespace before extracting the first character', () => {
    const { container } = render(<GazetteDropCap>{'   The trial.'}</GazetteDropCap>);
    expect(container.querySelector('.gz-dropcap')).toHaveTextContent('T');
  });

  it('renders empty paragraph (no cap) for whitespace-only input', () => {
    const { container } = render(<GazetteDropCap>{'    '}</GazetteDropCap>);
    expect(container.querySelector('.gz-dropcap')).toBeNull();
    expect(container.querySelector('p')).toBeInTheDocument();
  });

  it('appends rest content after the lead text', () => {
    const { container } = render(
      <GazetteDropCap rest={<em data-testid="tail">— Ed.</em>}>
        Lead sentence.
      </GazetteDropCap>
    );
    const tail = container.querySelector('[data-testid="tail"]');
    expect(tail).toBeInTheDocument();
    expect(container.querySelector('p')?.textContent).toContain('Lead sentence.');
    expect(container.querySelector('p')?.textContent).toContain('— Ed.');
  });
});
