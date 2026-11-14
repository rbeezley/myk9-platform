import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ParticularsSection as GazetteParticulars } from '@/features/gazette/landing/sections/ParticularsSection';
import { ParticularsSection as HeritageParticulars } from '@/features/heritage/landing/sections/ParticularsSection';
import { ParticularsSection as MagazineParticulars } from '@/features/magazine/landing/sections/ParticularsSection';
import { ParticularsSection as MonogramParticulars } from '@/features/monogram/landing/sections/ParticularsSection';

const common = {
  licenseLanguage: 'AKC Licensed Trial',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-06-01',
  confirmationDate: '2026-06-05',
  entryLimit: null,
  timezone: 'America/Chicago',
};
const fees = [{ label: 'Junior handler', amount: '$15.00', unit: 'per class entry' }];

describe('junior handler fee unit on the landing styles that arrange fees themselves', () => {
  it('Monogram prints the unit', () => {
    render(<MonogramParticulars {...common} trialsCount={1} fees={fees} />);
    expect(screen.getByText(/per class entry/)).toBeInTheDocument();
  });
  it('Magazine prints the unit', () => {
    render(<MagazineParticulars {...common} fees={fees} />);
    expect(screen.getByText('per class entry')).toBeInTheDocument();
  });
  it('Gazette prints the unit', () => {
    render(<GazetteParticulars {...common} volumeRoman="I" fees={fees} />);
    expect(screen.getByText('per class entry')).toBeInTheDocument();
  });
  it('Heritage prints the unit', () => {
    render(<HeritageParticulars {...common} fees={fees} />);
    expect(screen.getByText('per class entry')).toBeInTheDocument();
  });
});
