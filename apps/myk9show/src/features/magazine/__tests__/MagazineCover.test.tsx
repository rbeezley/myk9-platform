import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MagazineCover } from '../components/MagazineCover';

describe('MagazineCover', () => {
  describe('with image URL', () => {
    it('renders an <img> with the supplied URL', () => {
      const { container } = render(
        <MagazineCover
          imageUrl="https://example.com/cover.jpg"
          alt="Spring Scent Work cover"
          monogramLetters="BCK"
        />
      );
      const img = container.querySelector('img.mz-cover__img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
      expect(img).toHaveAttribute('alt', 'Spring Scent Work cover');
    });

    it('renders an optional caption when provided', () => {
      const { container } = render(
        <MagazineCover
          imageUrl="https://example.com/cover.jpg"
          alt="cover"
          monogramLetters="BCK"
          caption="Photograph by the trial committee"
        />
      );
      expect(container.querySelector('.mz-cover__caption')).toHaveTextContent(
        'Photograph by the trial committee'
      );
    });

    it('does NOT render the placeholder gradient or monogram when an image is supplied', () => {
      const { container } = render(
        <MagazineCover
          imageUrl="https://example.com/cover.jpg"
          alt="cover"
          monogramLetters="BCK"
        />
      );
      expect(container.firstChild).not.toHaveClass('mz-cover--placeholder');
      expect(container.querySelector('.mz-cover__monogram')).toBeNull();
    });
  });

  describe('without image URL (placeholder mode)', () => {
    it('renders the placeholder modifier class', () => {
      const { container } = render(
        <MagazineCover imageUrl={null} monogramLetters="BCK" />
      );
      expect(container.firstChild).toHaveClass('mz-cover', 'mz-cover--placeholder');
    });

    it('renders the club monogram letters inside the placeholder', () => {
      const { container } = render(
        <MagazineCover imageUrl={null} monogramLetters="BCK" />
      );
      expect(container.querySelector('.mz-cover__monogram')).toHaveTextContent('BCK');
    });

    it('renders the default placeholder label', () => {
      const { container } = render(<MagazineCover imageUrl={null} monogramLetters="BCK" />);
      expect(container.querySelector('.mz-cover__placeholder-label')).toHaveTextContent(
        'Cover photograph · Club to supply'
      );
    });

    it('accepts a placeholder label override', () => {
      const { container } = render(
        <MagazineCover
          imageUrl={null}
          monogramLetters="BCK"
          placeholderLabel="Image to be supplied by the club"
        />
      );
      expect(container.querySelector('.mz-cover__placeholder-label')).toHaveTextContent(
        'Image to be supplied by the club'
      );
    });

    it('does NOT render an <img> in placeholder mode', () => {
      const { container } = render(<MagazineCover imageUrl={null} monogramLetters="BCK" />);
      expect(container.querySelector('img')).toBeNull();
    });

    it('exposes an aria-label so the empty slot is announced as a placeholder', () => {
      const { container } = render(<MagazineCover imageUrl={null} monogramLetters="BCK" />);
      expect(container.firstChild).toHaveAttribute(
        'aria-label',
        'Cover photograph placeholder'
      );
    });
  });
});
