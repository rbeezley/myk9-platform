import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FieldGuideDataGrid } from '../components/FieldGuideDataGrid';

const SIX_CELL_HERO = [
  { label: 'DATES', value: 'JUN 12–14' },
  { label: 'OPENS', value: 'APR 15' },
  { label: 'CLOSES', value: 'JUN 03', emphasis: true },
  { label: 'DRAW', value: 'JUN 04' },
  { label: 'CONFIRM', value: 'JUN 06' },
  { label: 'CAP', value: '360' },
];

describe('FieldGuideDataGrid', () => {
  it('renders one cell per item with both label and value visible', () => {
    const { container } = render(<FieldGuideDataGrid cells={SIX_CELL_HERO} />);
    const cells = container.querySelectorAll('.fg-quickref-cell');
    expect(cells.length).toBe(6);
    expect(container.textContent).toContain('DATES');
    expect(container.textContent).toContain('JUN 12–14');
    expect(container.textContent).toContain('CLOSES');
    expect(container.textContent).toContain('JUN 03');
  });

  it('lays out as a 6-column grid by default for the hero use case', () => {
    const { container } = render(<FieldGuideDataGrid cells={SIX_CELL_HERO} />);
    const grid = container.querySelector('.fg-quickref') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(6, 1fr)');
  });

  it('honors a columns override (e.g. 4 for the entry-blank top strip)', () => {
    const { container } = render(<FieldGuideDataGrid cells={SIX_CELL_HERO.slice(0, 4)} columns={4} />);
    const grid = container.querySelector('.fg-quickref') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
  });

  it('paints the value in orange-deep when emphasis is true', () => {
    const { container } = render(<FieldGuideDataGrid cells={SIX_CELL_HERO} />);
    const cells = container.querySelectorAll('.fg-quickref-cell');
    // CLOSES is the 3rd cell (index 2) and is the emphasis one.
    const closesValue = cells[2].querySelectorAll('div')[1] as HTMLElement;
    expect(closesValue.style.color).toBe('rgb(138, 62, 33)');
  });

  it('paints non-emphasis values in ink', () => {
    const { container } = render(<FieldGuideDataGrid cells={SIX_CELL_HERO} />);
    const cells = container.querySelectorAll('.fg-quickref-cell');
    const datesValue = cells[0].querySelectorAll('div')[1] as HTMLElement;
    expect(datesValue.style.color).toBe('rgb(31, 42, 36)');
  });

  it('shows the fallback string when a cell value is empty', () => {
    const { container } = render(
      <FieldGuideDataGrid cells={[{ label: 'CONFIRM', value: '' }, { label: 'DRAW', value: 'JUN 04' }]} />
    );
    expect(container.textContent).toContain('—');
  });

  it('honors a custom fallback string', () => {
    const { container } = render(
      <FieldGuideDataGrid cells={[{ label: 'CONFIRM', value: '' }]} fallback="TBA" />
    );
    expect(container.textContent).toContain('TBA');
  });

  it('drops the right border on the final cell so the box closes cleanly', () => {
    const { container } = render(<FieldGuideDataGrid cells={SIX_CELL_HERO} />);
    const cells = container.querySelectorAll('.fg-quickref-cell');
    const last = cells[cells.length - 1] as HTMLElement;
    expect(last.style.borderRightStyle).toBe('none');
  });

  it('does not emit any italic styles', () => {
    const { container } = render(<FieldGuideDataGrid cells={SIX_CELL_HERO} />);
    expect(container.innerHTML).not.toContain('font-style: italic');
    expect(container.innerHTML).not.toContain('font-style:italic');
  });
});
