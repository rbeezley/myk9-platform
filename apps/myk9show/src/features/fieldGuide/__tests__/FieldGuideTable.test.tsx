import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  FieldGuideTable,
  FieldGuideTableHeaderCell,
  FieldGuideTableLabelCell,
  FieldGuideTableRow,
  FieldGuideTableValueCell,
} from '../components/FieldGuideTable';

describe('FieldGuideTable', () => {
  it('renders a <table> with 2px ink top + bottom borders', () => {
    const { container } = render(
      <FieldGuideTable>
        <FieldGuideTableRow>
          <FieldGuideTableLabelCell>SANCTIONING</FieldGuideTableLabelCell>
          <FieldGuideTableValueCell>AKC</FieldGuideTableValueCell>
        </FieldGuideTableRow>
      </FieldGuideTable>
    );
    const table = container.querySelector('table.fg-table') as HTMLElement;
    expect(table).not.toBeNull();
    expect(table.style.borderTop).toContain('2px solid');
    expect(table.style.borderBottom).toContain('2px solid');
  });

  it('forwards an aria-label to the underlying table', () => {
    const { container } = render(
      <FieldGuideTable ariaLabel="Trial particulars">
        <FieldGuideTableRow>
          <FieldGuideTableLabelCell>X</FieldGuideTableLabelCell>
          <FieldGuideTableValueCell>Y</FieldGuideTableValueCell>
        </FieldGuideTableRow>
      </FieldGuideTable>
    );
    const table = container.querySelector('table') as HTMLElement;
    expect(table.getAttribute('aria-label')).toBe('Trial particulars');
  });

  it('paints alternating rows with paper-warm background when alt={true}', () => {
    const { container } = render(
      <FieldGuideTable>
        <FieldGuideTableRow>
          <FieldGuideTableLabelCell>A</FieldGuideTableLabelCell>
          <FieldGuideTableValueCell>1</FieldGuideTableValueCell>
        </FieldGuideTableRow>
        <FieldGuideTableRow alt>
          <FieldGuideTableLabelCell>B</FieldGuideTableLabelCell>
          <FieldGuideTableValueCell>2</FieldGuideTableValueCell>
        </FieldGuideTableRow>
      </FieldGuideTable>
    );
    const rows = container.querySelectorAll('tr');
    expect((rows[0] as HTMLElement).style.background).toBe('transparent');
    expect((rows[1] as HTMLElement).style.background).toBe('rgb(235, 228, 207)');
    expect(rows[1].getAttribute('data-alt')).toBe('true');
  });

  it('marks rows with hairline bottom borders', () => {
    const { container } = render(
      <FieldGuideTable>
        <FieldGuideTableRow>
          <FieldGuideTableLabelCell>X</FieldGuideTableLabelCell>
          <FieldGuideTableValueCell>Y</FieldGuideTableValueCell>
        </FieldGuideTableRow>
      </FieldGuideTable>
    );
    const row = container.querySelector('tr') as HTMLElement;
    expect(row.style.borderBottom).toContain('1px solid');
    expect(row.style.borderBottom).toContain('rgb(196, 187, 160)');
  });

  it('renders header cells via FieldGuideTableHeaderCell with mono caps styling', () => {
    const { container } = render(
      <FieldGuideTable
        head={
          <tr>
            <FieldGuideTableHeaderCell>TRIAL</FieldGuideTableHeaderCell>
            <FieldGuideTableHeaderCell>DAY</FieldGuideTableHeaderCell>
          </tr>
        }
      >
        <FieldGuideTableRow>
          <FieldGuideTableLabelCell>A</FieldGuideTableLabelCell>
          <FieldGuideTableValueCell>B</FieldGuideTableValueCell>
        </FieldGuideTableRow>
      </FieldGuideTable>
    );
    const headers = container.querySelectorAll('thead th');
    expect(headers.length).toBe(2);
    const first = headers[0] as HTMLElement;
    expect(first.style.fontFamily).toContain('IBM Plex Mono');
    expect(first.style.textTransform).toBe('uppercase');
  });

  it('paints numeric value cells with mono tabular-nums alignment right', () => {
    const { container } = render(
      <FieldGuideTable>
        <FieldGuideTableRow>
          <FieldGuideTableLabelCell>FEE</FieldGuideTableLabelCell>
          <FieldGuideTableValueCell numeric>$25.00</FieldGuideTableValueCell>
        </FieldGuideTableRow>
      </FieldGuideTable>
    );
    const cell = container.querySelector('td') as HTMLElement;
    expect(cell.style.fontFamily).toContain('IBM Plex Mono');
    expect(cell.style.textAlign).toBe('right');
    expect(cell.style.fontVariantNumeric).toBe('tabular-nums');
  });

  it('does not emit italic styles', () => {
    const { container } = render(
      <FieldGuideTable>
        <FieldGuideTableRow>
          <FieldGuideTableLabelCell>X</FieldGuideTableLabelCell>
          <FieldGuideTableValueCell>Y</FieldGuideTableValueCell>
        </FieldGuideTableRow>
      </FieldGuideTable>
    );
    expect(container.innerHTML).not.toContain('font-style: italic');
    expect(container.innerHTML).not.toContain('font-style:italic');
  });
});
