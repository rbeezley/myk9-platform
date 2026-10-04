/**
 * MYK9-1009: the Result Catalog on an AKC show is the AKC marked catalog
 * (Scent Work Regulations Ch.3 §36-37). These tests render realistic class data
 * and assert what a reader of the printed page would see.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ResultCatalog } from '../ResultCatalog';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';

function dog(overrides: Partial<ReportEntry>): ReportEntry {
  return {
    id: 'e',
    armband: '101',
    runOrder: 1,
    callName: 'Dog',
    breed: 'Labrador Retriever',
    handler: 'Jane Mitchell',
    registrationNumber: null,
    checkInStatus: null,
    section: null,
    isScored: true,
    resultText: 'pending',
    searchTimeSeconds: null,
    totalFaults: null,
    finalPlacement: null,
    entryStatus: 'confirmed',
    trialId: 't1',
    classId: 'c1',
    ...overrides,
  };
}

const entries: ReportEntry[] = [
  // Placed first; handler is the owner, so no handler line prints.
  dog({
    id: 'q1',
    armband: '101',
    callName: 'Buddy',
    breed: 'Golden Retriever',
    registrationNumber: 'SS12345601',
    registeredName: 'Sunny Meadow Buddy Holly',
    dateOfBirth: '2020-03-05',
    ownerName: 'Jane Mitchell',
    ownerAddress: '12 Oak Lane, Austin, TX 78701',
    resultText: 'qualified',
    searchTimeSeconds: 47.5,
    totalFaults: 0,
    finalPlacement: 1,
  }),
  // Placed second; handler is someone other than the owner.
  dog({
    id: 'q2',
    armband: '102',
    callName: 'Pepper',
    handler: 'Carlos Rivera',
    ownerName: 'Dana Cole',
    ownerAddress: '9 Elm Court, Round Rock, TX 78664',
    handlerDiffersFromOwner: true,
    resultText: 'qualified',
    searchTimeSeconds: 61.25,
    totalFaults: 1,
    finalPlacement: 2,
  }),
  dog({
    id: 'nq1',
    armband: '103',
    callName: 'Scout',
    ownerName: 'Ravi Patel',
    resultText: 'nq',
    searchTimeSeconds: 180,
    totalFaults: 2,
    finalPlacement: 9996,
  }),
  dog({
    id: 'exc1',
    armband: '104',
    callName: 'Maple',
    ownerName: 'Lee Park',
    resultText: 'excused',
    searchTimeSeconds: 33,
    totalFaults: 0,
    resultReason: 'Handler corrected the dog in the search area',
  }),
  dog({ id: 'abs1', armband: '105', callName: 'Gus', ownerName: 'Tia Wong', resultText: 'absent' }),
  dog({
    id: 'wd1',
    armband: '106',
    callName: 'Daisy',
    ownerName: 'Pam Ortiz',
    entryStatus: 'withdrawn',
    withdrawalReasonCode: 'in_season',
    isScored: false,
  }),
  dog({
    id: 'wd2',
    armband: '107',
    callName: 'Rex',
    ownerName: 'Al Burns',
    entryStatus: 'withdrawn',
    withdrawalReasonCode: 'judge_change',
    isScored: false,
  }),
  // A pull is NOT a withdrawal: entered, did not run.
  dog({
    id: 'pull1',
    armband: '108',
    callName: 'Fig',
    ownerName: 'Moe Díaz',
    entryStatus: 'scratched',
    isScored: false,
  }),
  // The source row of a move-up was never a dog in this class.
  dog({
    id: 'moved1',
    armband: '109',
    callName: 'Hopper',
    entryStatus: 'moved',
    isScored: false,
  }),
];

const akcProps: ReportProps = {
  showName: 'Spring Scent Trial',
  organization: 'AKC',
  sortOrder: 'armband',
  entries,
  allTrials: [{ id: 't1', date: '2026-04-12', trialNumber: '1', registryId: 'AKC' }],
  allClasses: [
    {
      id: 'c1',
      trialId: 't1',
      element: 'Buried',
      level: 'Novice',
      judgeName: 'Ruth Hale',
      timeLimitSeconds: 180,
    },
  ],
};

function classFacts(container: HTMLElement): Record<string, string> {
  const facts: Record<string, string> = {};
  container.querySelectorAll('.catalog-class-fact').forEach(fact => {
    const label = fact.querySelector('dt')?.textContent?.replace(/:\s*$/, '') ?? '';
    facts[label] = fact.querySelector('dd')?.textContent ?? '';
  });
  return facts;
}

function rowFor(armband: string): HTMLElement {
  const cell = screen.getAllByRole('cell').find(item => item.textContent === armband);
  return cell!.closest('tr') as HTMLElement;
}

describe('ResultCatalog on an AKC show (marked catalog)', () => {
  it('titles the report as the marked catalog', () => {
    render(<ResultCatalog {...akcProps} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'AKC Scent Work Marked Catalog'
    );
  });

  it('prints the class header counts, judge and maximum time', () => {
    const { container } = render(<ResultCatalog {...akcProps} />);
    // 9 rows, less the moved-up source row (never in this class) = 8 listed;
    // 2 withdrawn; entries = 8 - 2; competing excludes absent and the pull.
    expect(classFacts(container)).toEqual({
      Entries: '6',
      Competing: '4',
      Qualifying: '2',
      Withdrawn: '2',
      Judge: 'Ruth Hale',
      'Maximum time': '3 min',
    });
  });

  it('lists every dog in the class except the moved-up source row', () => {
    render(<ResultCatalog {...akcProps} />);
    expect(screen.queryByText('Call: Hopper')).not.toBeInTheDocument();
    expect(screen.getByText('Call: Fig')).toBeInTheDocument();
    expect(screen.getAllByText(/^Call:/)).toHaveLength(8);
  });

  it('prints the placed dog with registration, birth date, names, breed and owner address inline', () => {
    render(<ResultCatalog {...akcProps} />);
    const row = within(rowFor('101'));
    expect(row.getByText('SS12345601')).toBeInTheDocument();
    expect(row.getByText('3/5/2020')).toBeInTheDocument();
    expect(row.getByText(/Sunny Meadow Buddy Holly/)).toBeInTheDocument();
    expect(row.getByText('Call: Buddy')).toBeInTheDocument();
    expect(row.getByText('Golden Retriever')).toBeInTheDocument();
    expect(row.getByText('Jane Mitchell')).toBeInTheDocument();
    expect(row.getByText('12 Oak Lane, Austin, TX 78701')).toBeInTheDocument();
    expect(row.getByText('00:47.50')).toBeInTheDocument();
    expect(row.getByText('Q')).toBeInTheDocument();
    expect(row.getByText('1')).toBeInTheDocument();
  });

  it('leaves the handler blank when the handler is the owner', () => {
    render(<ResultCatalog {...akcProps} />);
    expect(within(rowFor('101')).queryByText(/Handler:/)).not.toBeInTheDocument();
  });

  it('keeps the Jr. mark for a junior who handles their own dog', () => {
    render(
      <ResultCatalog
        {...akcProps}
        entries={[
          dog({
            id: 'jr',
            armband: '120',
            handler: 'Sam Lee',
            ownerName: 'Sam Lee',
            handlerIsJunior: true,
          }),
        ]}
      />
    );
    const ownerCell = within(rowFor('120')).getByText(/Sam Lee/);
    expect(ownerCell).toHaveTextContent('Sam Lee Jr.');
    expect(within(rowFor('120')).queryByText(/Handler:/)).not.toBeInTheDocument();
  });

  it('prints the handler under the owner when they differ', () => {
    render(<ResultCatalog {...akcProps} />);
    const row = within(rowFor('102'));
    expect(row.getByText('Dana Cole')).toBeInTheDocument();
    expect(row.getByText('Handler: Carlos Rivera')).toBeInTheDocument();
    expect(row.getByText('2')).toBeInTheDocument();
  });

  it('prints NQ with its time and faults but no placement', () => {
    render(<ResultCatalog {...akcProps} />);
    const cells = within(rowFor('103')).getAllByRole('cell');
    expect(cells.map(cell => cell.textContent)).toEqual(
      expect.arrayContaining(['03:00.00', '2', 'NQ'])
    );
    expect(cells.at(-1)).toHaveTextContent('');
  });

  it('prints EXC with the judge-recorded reason', () => {
    render(<ResultCatalog {...akcProps} />);
    const row = within(rowFor('104'));
    expect(row.getByText(/^EXC/)).toBeInTheDocument();
    expect(row.getByText('Handler corrected the dog in the search area')).toBeInTheDocument();
  });

  it('prints ABS for an absent dog with no time or faults', () => {
    render(<ResultCatalog {...akcProps} />);
    const cells = within(rowFor('105')).getAllByRole('cell');
    expect(cells.map(cell => cell.textContent)).toContain('ABS');
    expect(cells[6]).toHaveTextContent('');
    expect(cells[7]).toHaveTextContent('');
  });

  it('prints AIS and AJC for the two withdrawal reasons, and Pulled for a pull', () => {
    render(<ResultCatalog {...akcProps} />);
    expect(within(rowFor('106')).getByText('AIS')).toBeInTheDocument();
    expect(within(rowFor('107')).getByText('AJC')).toBeInTheDocument();
    expect(within(rowFor('108')).getByText('Pulled')).toBeInTheDocument();
    expect(within(rowFor('108')).queryByText('AIS')).not.toBeInTheDocument();
  });

  it('prints a blank where a dog or owner field was not read, never a guess', () => {
    render(
      <ResultCatalog
        {...akcProps}
        entries={[dog({ id: 'bare', armband: '110', callName: 'Nova', resultText: 'nq' })]}
      />
    );
    const cells = within(rowFor('110')).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('');
    expect(cells[2]).toHaveTextContent('');
    expect(cells[3]).toHaveTextContent('Call: Nova');
    expect(cells[5]).toHaveTextContent('');
  });

  it("prints the judge's initials box once, in the repeating footer, with no signature line", () => {
    const { container } = render(<ResultCatalog {...akcProps} />);
    expect(screen.getAllByText("Judge's initials")).toHaveLength(1);
    // The <tfoot> of the single catalog table is what repeats on every printed page.
    const table = container.querySelector('table.catalog-akc-table')!;
    expect(table.querySelectorAll('tfoot')).toHaveLength(1);
    expect(table.querySelector('tfoot')).toHaveTextContent("Judge's initials");
    expect(table.querySelector('tfoot .catalog-initials-box')).not.toBeNull();
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(screen.queryByText(/Judge.?s Signature/i)).not.toBeInTheDocument();
  });

  it('keeps the legacy layout for a non-AKC trial in the same show data', () => {
    render(
      <ResultCatalog
        {...akcProps}
        organization="UKC"
        allTrials={[{ id: 't1', date: '2026-04-12', trialNumber: '1', registryId: 'UKC' }]}
      />
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'UKC Scent Work Show Results'
    );
    expect(screen.queryByText('Date of Birth')).not.toBeInTheDocument();
    expect(screen.getAllByText("Judge's initials")).toHaveLength(1);
  });

  it('names the trial and date in each class header on a multi-trial show', () => {
    render(
      <ResultCatalog
        {...akcProps}
        entries={[
          dog({ id: 'a', armband: '101', classId: 'c1', trialId: 't1' }),
          dog({ id: 'b', armband: '201', classId: 'c2', trialId: 't2' }),
        ]}
        allTrials={[
          { id: 't1', date: '2026-11-07', trialNumber: '1', registryId: 'AKC' },
          {
            id: 't2',
            name: 'Sunday Trial',
            date: '2026-11-08',
            trialNumber: '2',
            registryId: 'AKC',
          },
        ]}
        allClasses={[
          { id: 'c1', trialId: 't1', element: 'Container', level: 'Novice', section: 'A' },
          { id: 'c2', trialId: 't2', element: 'Container', level: 'Novice', section: '-' },
        ]}
      />
    );
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(headings).toEqual([
      '1 — 11/7/2026 — Container Novice A',
      'Sunday Trial — 11/8/2026 — Container Novice',
    ]);
  });

  it('flags an owner who was read but has no address, and stays quiet for an unread one', () => {
    render(
      <ResultCatalog
        {...akcProps}
        entries={[
          dog({ id: 'read', armband: '301', ownerName: 'Read Blank', ownerAddressMissing: true }),
          dog({ id: 'unread', armband: '302', ownerName: 'Not Read' }),
          dog({
            id: 'has',
            armband: '303',
            ownerName: 'Has Addr',
            ownerAddress: '1 A St, Austin, TX 78701',
          }),
        ]}
      />
    );
    expect(within(rowFor('301')).getByText('No address on file')).toBeInTheDocument();
    expect(within(rowFor('302')).queryByText('No address on file')).not.toBeInTheDocument();
    expect(within(rowFor('303')).queryByText('No address on file')).not.toBeInTheDocument();
  });

  it('prints the top notice only when the owner and date-of-birth read did not complete', () => {
    const notice = /could not be loaded — reprint when online before sending to AKC/;
    const { rerender } = render(
      <ResultCatalog {...akcProps} catalogProfilesReadComplete={false} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(notice);
    expect(screen.queryByText('No address on file')).not.toBeInTheDocument();
    rerender(<ResultCatalog {...akcProps} catalogProfilesReadComplete />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<ResultCatalog {...akcProps} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
