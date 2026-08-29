import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ParticularsSection as BannerParticulars } from '@/features/banner/landing/sections/ParticularsSection';
import { ParticularsSection as PosterParticulars } from '@/features/poster/landing/sections/ParticularsSection';

const commonProps = {
  licenseLanguage: 'AKC Licensed Trial',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-06-01',
  confirmationDate: '2026-06-05',
  entryLimit: 360,
  trialsCount: 2,
  timezone: 'America/Chicago',
};

describe('styled landing table overflow', () => {
  it('makes the Banner particulars table keyboard reachable', () => {
    render(<BannerParticulars {...commonProps} fees={[]} flag="#0d4d4f" />);

    expect(screen.getByRole('region', { name: 'Show particulars table' })).toHaveAttribute(
      'tabindex',
      '0'
    );
  });

  it('makes the Poster particulars table keyboard reachable', () => {
    render(<PosterParticulars {...commonProps} />);

    expect(screen.getByRole('region', { name: 'Show particulars table' })).toHaveAttribute(
      'tabindex',
      '0'
    );
  });
});
