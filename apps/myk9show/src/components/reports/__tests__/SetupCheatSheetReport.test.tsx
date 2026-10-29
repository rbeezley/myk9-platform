import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { renderReportToHtml } from '@/lib/reports/reportRenderer';
import type { ReportProps } from '@/lib/reports/types';
import { AKCSetupCheatSheetReport } from '../AKCSetupCheatSheetReport';
import { UKCSetupCheatSheetReport } from '../UKCSetupCheatSheetReport';

const props: ReportProps = { showName: 'Any Show', entries: [], sortOrder: '' };

/** The `@page` rules of a full report document, in cascade order. */
function pageRules(html: string): string[] {
  return [...html.matchAll(/@page\s*\{[^}]*\}/g)].map(m => m[0].replace(/\s+/g, ' '));
}

describe('UKCSetupCheatSheetReport', () => {
  it('renders the two landscape sides as tables with every level as a column', () => {
    render(<UKCSetupCheatSheetReport {...props} />);

    const side1 = screen.getByTestId('setup-table-vehicles-containers');
    const side2 = screen.getByTestId('setup-table-interior-exterior');

    for (const table of [side1, side2]) {
      const headers = within(table)
        .getAllByRole('columnheader')
        .map(h => h.textContent);
      expect(headers.join('|')).toMatch(/Novice.*Advanced.*Superior.*Master.*Elite/);
      expect(within(table).getAllByText(/Max time 6 min/)).toHaveLength(2);
    }
    const elements = (table: HTMLElement) =>
      [...table.querySelectorAll('tbody[data-element]')].map(el => el.getAttribute('data-element'));
    expect(elements(side1)).toEqual(['vehicle', 'container']);
    expect(elements(side2)).toEqual(['interior', 'exterior']);
    expect(within(side1).getByText('Cars 3 ft, other 4 ft')).toBeInTheDocument();
  });

  it('cites the rulebook edition in each page footer', () => {
    render(<UKCSetupCheatSheetReport {...props} />);

    const footers = screen.getAllByText(/UKC Official Nosework Rulebook/);
    expect(footers).toHaveLength(2);
  });
});

describe('AKCSetupCheatSheetReport', () => {
  it('renders three pages: containers and buried, interior and exterior, handler discrimination', () => {
    render(<AKCSetupCheatSheetReport {...props} />);

    const page1 = screen.getByTestId('setup-table-containers-buried');
    const page2 = screen.getByTestId('setup-table-interior-exterior');
    const page3 = screen.getByTestId('setup-table-handler-discrimination');

    expect(within(page1).getByText('Buried')).toBeInTheDocument();
    expect(within(page1).getByText('8 sand and 8 water')).toBeInTheDocument();
    expect(within(page2).getByText('3 areas, 600 to 1,000 sq ft total')).toBeInTheDocument();
    expect(
      within(page3).getByText('1 judge-scented aid and 1 steward-scented aid')
    ).toBeInTheDocument();
    for (const table of [page1, page2, page3]) {
      const headers = within(table)
        .getAllByRole('columnheader')
        .map(h => h.textContent);
      expect(headers.join('|')).toMatch(/Novice.*Advanced.*Excellent.*Master/);
    }
  });

  it('cites the rulebook edition in each page footer and carries the HD notes', () => {
    render(<AKCSetupCheatSheetReport {...props} />);

    expect(screen.getAllByText(/Amended August 2025/)).toHaveLength(3);
    expect(screen.getByText('Hide steward.')).toBeInTheDocument();
  });
});

describe('setup cheat sheet print stylesheet', () => {
  it.each([
    ['UKC', <UKCSetupCheatSheetReport key="ukc" {...props} />],
    ['AKC', <AKCSetupCheatSheetReport key="akc" {...props} />],
  ])('%s sheet ends with a US Letter landscape @page, never a viewport size', (_name, element) => {
    const html = renderReportToHtml(renderToStaticMarkup(element));
    const rules = pageRules(html);

    // The shared report stylesheet declares its own portrait @page first; the sheet's later
    // rule is the one that wins in the cascade.
    expect(rules.length).toBeGreaterThan(1);
    expect(rules[rules.length - 1]).toBe('@page { size: 11in 8.5in; margin: 0.25in; }');
    expect(html).not.toMatch(/\b\d+(\.\d+)?v[hw]\b/);
  });
});
