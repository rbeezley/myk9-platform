import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GazetteClassifiedBox } from '../components/GazetteClassifiedBox';

describe('GazetteClassifiedBox', () => {
  it('renders the category caps line', () => {
    const { container } = render(
      <GazetteClassifiedBox category="LODGING · I" title="Hampton Inn" body="closest hotel" />
    );
    expect(container.querySelector('.gz-classified__cat')).toHaveTextContent('LODGING · I');
  });

  it('renders the title heading', () => {
    const { container } = render(
      <GazetteClassifiedBox category="LODGING" title="Hampton Inn Live Oak" body="body" />
    );
    expect(container.querySelector('h3')).toHaveTextContent('Hampton Inn Live Oak');
    expect(container.querySelector('h3')).toHaveClass('gz-classified__title');
  });

  it('supports embedded <em> in the title for italic-brown accent', () => {
    const { container } = render(
      <GazetteClassifiedBox
        category="LODGING"
        title={<>Hampton Inn <em>Live Oak</em></>}
        body="body"
      />
    );
    expect(container.querySelector('h3 em')).toHaveTextContent('Live Oak');
  });

  it('renders body content as react nodes (not just strings)', () => {
    const { container } = render(
      <GazetteClassifiedBox
        category="VET"
        title="Alamo Vet"
        body={
          <>
            <span data-testid="hours">24h</span>
            <strong>open</strong>
          </>
        }
      />
    );
    expect(container.querySelector('[data-testid="hours"]')).toHaveTextContent('24h');
    expect(container.querySelector('.gz-classified__body strong')).toHaveTextContent('open');
  });

  it('renders the dotted meta line when meta prop is set', () => {
    const { container } = render(
      <GazetteClassifiedBox
        category="LODGING"
        title="Hampton"
        body="x"
        meta="0.4 MI · $129/NT · CODE BCKC26"
      />
    );
    expect(container.querySelector('.gz-classified__meta')).toHaveTextContent(
      '0.4 MI · $129/NT · CODE BCKC26'
    );
  });

  it('omits the dotted meta line when meta is null', () => {
    const { container } = render(
      <GazetteClassifiedBox category="VET" title="Alamo Vet" body="24h" meta={null} />
    );
    expect(container.querySelector('.gz-classified__meta')).toBeNull();
  });
});
