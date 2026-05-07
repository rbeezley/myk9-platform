import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HeritageEngravedFrame } from '../components/HeritageEngravedFrame';

describe('HeritageEngravedFrame', () => {
  it('renders children inside the engraved wrapper', () => {
    const { getByText } = render(
      <HeritageEngravedFrame>
        <p>contents</p>
      </HeritageEngravedFrame>
    );
    expect(getByText('contents')).toBeInTheDocument();
  });

  it('renders four corner dots by default (tl, tr, bl, br)', () => {
    const { container } = render(
      <HeritageEngravedFrame>
        <div />
      </HeritageEngravedFrame>
    );
    expect(container.querySelectorAll('.hl-corner')).toHaveLength(4);
    expect(container.querySelector('.hl-corner.tl')).toBeInTheDocument();
    expect(container.querySelector('.hl-corner.tr')).toBeInTheDocument();
    expect(container.querySelector('.hl-corner.bl')).toBeInTheDocument();
    expect(container.querySelector('.hl-corner.br')).toBeInTheDocument();
  });

  it('omits corner dots when withCorners=false', () => {
    const { container } = render(
      <HeritageEngravedFrame withCorners={false}>
        <div />
      </HeritageEngravedFrame>
    );
    expect(container.querySelectorAll('.hl-corner')).toHaveLength(0);
  });

  it('marks corner dots as aria-hidden (decorative)', () => {
    const { container } = render(
      <HeritageEngravedFrame>
        <div />
      </HeritageEngravedFrame>
    );
    container.querySelectorAll('.hl-corner').forEach(corner => {
      expect(corner).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
