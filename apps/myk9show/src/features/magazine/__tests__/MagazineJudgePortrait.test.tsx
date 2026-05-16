import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MagazineJudgePortrait } from '../components/MagazineJudgePortrait';

describe('MagazineJudgePortrait', () => {
  it('renders an <img> when imageUrl is supplied', () => {
    const { container } = render(
      <MagazineJudgePortrait
        imageUrl="https://example.com/judge.jpg"
        alt="Catherine Beagles"
        initials="CB"
        plateLabel="Plate I"
      />
    );
    expect(container.querySelector('img.mz-judge-portrait__img')).toHaveAttribute(
      'src',
      'https://example.com/judge.jpg'
    );
  });

  it('renders the placeholder modifier when imageUrl is null', () => {
    const { container } = render(
      <MagazineJudgePortrait imageUrl={null} initials="CB" plateLabel="Plate I" />
    );
    expect(container.firstChild).toHaveClass('mz-judge-portrait--placeholder');
  });

  it('renders the initials overlay regardless of image presence', () => {
    const { container: withImg } = render(
      <MagazineJudgePortrait
        imageUrl="https://example.com/judge.jpg"
        alt="judge"
        initials="MW"
        plateLabel="Plate II"
      />
    );
    expect(withImg.querySelector('.mz-judge-portrait__initials')).toHaveTextContent('MW');

    const { container: noImg } = render(
      <MagazineJudgePortrait imageUrl={null} initials="MW" plateLabel="Plate II" />
    );
    expect(noImg.querySelector('.mz-judge-portrait__initials')).toHaveTextContent('MW');
  });

  it('renders the plate label caption', () => {
    const { container } = render(
      <MagazineJudgePortrait imageUrl={null} initials="CB" plateLabel="Plate III" />
    );
    expect(container.querySelector('.mz-judge-portrait__caption')).toHaveTextContent(
      'Plate III'
    );
  });

  it('aria-hides the initials overlay (decorative, name carries semantic content)', () => {
    const { container } = render(
      <MagazineJudgePortrait imageUrl={null} initials="CB" plateLabel="Plate I" />
    );
    expect(container.querySelector('.mz-judge-portrait__initials')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});
