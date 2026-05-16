import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FieldGuideChip } from '../components/FieldGuideChip';

describe('FieldGuideChip', () => {
  it('renders the children text content', () => {
    const { container } = render(<FieldGuideChip>OPEN</FieldGuideChip>);
    expect(container.textContent).toBe('OPEN');
  });

  it('applies the default neutral palette when no variant is supplied', () => {
    const { container } = render(<FieldGuideChip>NOVICE</FieldGuideChip>);
    const chip = container.querySelector('span') as HTMLElement;
    // Parchment-warm background, ink text, ink border.
    expect(chip.style.background).toBe('rgb(235, 228, 207)');
    expect(chip.style.color).toBe('rgb(31, 42, 36)');
    expect(chip.style.border).toContain('rgb(31, 42, 36)');
  });

  it('applies the orange palette for the primary status indicator', () => {
    const { container } = render(<FieldGuideChip variant="orange">OPEN</FieldGuideChip>);
    const chip = container.querySelector('span') as HTMLElement;
    expect(chip.style.background).toBe('rgb(201, 100, 66)');
    // Orange chips use paper text for contrast.
    expect(chip.style.color).toBe('rgb(246, 241, 230)');
    expect(chip.style.border).toContain('rgb(201, 100, 66)');
  });

  it('applies the cyan palette for the secondary indicator', () => {
    const { container } = render(<FieldGuideChip variant="cyan">HD (MASTER)</FieldGuideChip>);
    const chip = container.querySelector('span') as HTMLElement;
    expect(chip.style.background).toBe('rgb(58, 110, 114)');
    expect(chip.style.color).toBe('rgb(246, 241, 230)');
    expect(chip.style.border).toContain('rgb(58, 110, 114)');
  });

  it('uses the IBM Plex Mono family with tight 0.04em tracking', () => {
    const { container } = render(<FieldGuideChip>STATUS</FieldGuideChip>);
    const chip = container.querySelector('span') as HTMLElement;
    expect(chip.style.fontFamily).toContain('IBM Plex Mono');
    expect(chip.style.letterSpacing).toBe('0.04em');
    expect(chip.style.fontSize).toBe('10.5px');
    expect(chip.style.fontWeight).toBe('500');
  });

  it('does not emit any italic styles regardless of variant', () => {
    const { container } = render(
      <>
        <FieldGuideChip>A</FieldGuideChip>
        <FieldGuideChip variant="orange">B</FieldGuideChip>
        <FieldGuideChip variant="cyan">C</FieldGuideChip>
      </>
    );
    const chips = container.querySelectorAll('span');
    chips.forEach(chip => {
      expect((chip as HTMLElement).style.fontStyle).not.toBe('italic');
    });
    expect(container.innerHTML).not.toContain('font-style: italic');
    expect(container.innerHTML).not.toContain('font-style:italic');
  });

  it('renders an icon when supplied, marked aria-hidden', () => {
    const { container } = render(
      <FieldGuideChip icon={<svg data-testid="ic" />}>WITH ICON</FieldGuideChip>
    );
    const iconWrap = container.querySelector('[aria-hidden="true"]');
    expect(iconWrap).not.toBeNull();
    expect(iconWrap?.querySelector('[data-testid="ic"]')).not.toBeNull();
    expect(container.textContent).toBe('WITH ICON');
  });

  it('omits the icon wrapper when no icon is supplied', () => {
    const { container } = render(<FieldGuideChip>NO ICON</FieldGuideChip>);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('exposes the variant as a data attribute for downstream styling hooks', () => {
    const { container } = render(<FieldGuideChip variant="orange">X</FieldGuideChip>);
    expect(container.querySelector('[data-variant="orange"]')).not.toBeNull();
  });

  it('forwards style overrides without dropping the chip palette', () => {
    const { container } = render(
      <FieldGuideChip variant="orange" style={{ marginLeft: 8 }}>
        OVERRIDE
      </FieldGuideChip>
    );
    const chip = container.querySelector('span') as HTMLElement;
    expect(chip.style.marginLeft).toBe('8px');
    // Override must not stomp the orange background.
    expect(chip.style.background).toBe('rgb(201, 100, 66)');
  });

  it('applies the canonical fg-chip class plus a variant modifier', () => {
    const { container } = render(<FieldGuideChip variant="cyan">ANCHOR</FieldGuideChip>);
    const chip = container.querySelector('span') as HTMLElement;
    expect(chip.className).toContain('fg-chip');
    expect(chip.className).toContain('fg-chip--cyan');
  });
});
