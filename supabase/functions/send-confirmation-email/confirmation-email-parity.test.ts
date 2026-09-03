import { describe, expect, it } from 'vitest';

import type {
  GazetteConfirmationProps,
  MagazineConfirmationProps,
} from '../../../packages/email/src/types';
import { buildGazetteHtml, type GazetteEmailData } from './gazette-email';
import { buildMagazineHtml, type MagazineEmailData } from './magazine-email';

const magazinePreviewProps: MagazineConfirmationProps = {
  clubName: 'Bexar County Kennel Club',
  clubEstablished: 'Est. 1947',
  clubCity: 'San Antonio, TX',
  showTitle: 'Spring Scent Work Trial',
  dateRange: '12-14 June 2026',
  editionLabel: 'Vol LXXIX - Spring 2026',
  salutation: 'Ms. Patricia Holloway',
  dogRegisteredName: "GCh. Ridgeway's Wandering Cooper, CGC",
  dogCallName: 'Cooper',
  dogBreed: 'GSP',
  dogSex: 'F',
  runs: [
    {
      trialNumeral: 'III',
      dayLabel: 'Sat 13 Jun',
      classLabel: 'Excellent - Interiors',
      judgeName: 'C. Beagles',
      armband: '314',
    },
  ],
  runCount: 1,
  totalFeesFormatted: '$25.00',
  receiptNumber: '2026-0137',
  primaryArmband: '314',
  doorsTime: '7:00 AM',
  firstClassTime: '8:30 AM',
  venueNameAndAddress: 'Live Oak Civic Center\n8001 Shin Oak Dr',
  parkingNotes: 'North lot',
  hospitalityNotes: 'Coffee at check-in',
  cratingNotes: 'Soft-sided only',
  secretaryEmail: 'secretary@bckc.org',
  secretaryPhone: '(210) 555-0142',
  trialUrl: 'https://myk9show.com/bckc-spring-2026',
  trialChairName: 'Sarah Whitman',
  trialChairTitle: 'Trial Chair',
  memberClubLanguage: 'A member club of the American Kennel Club',
  showSlug: 'bckc-spring-2026',
  licenseReference: 'License No. 2026-2841',
};

const gazettePreviewProps: GazetteConfirmationProps = {
  clubName: 'Bexar County Kennel Club',
  clubEstablished: 'Established 1947',
  clubCity: 'San Antonio, TX',
  showTitle: 'Spring Scent Work Trial',
  dateRange: 'Jun 12-14, 2026',
  editionLabel: 'VOL LXXIX - NO 47',
  salutation: 'Ms. Patricia Holloway',
  dogRegisteredName: "GCh. Ridgeway's Wandering Cooper, CGC",
  dogCallName: 'Cooper',
  dogBreed: 'GSP',
  dogSex: 'F',
  runs: [
    {
      trialNumeral: 'III',
      dayLabel: 'Sat Jun 13',
      classLabel: 'Excellent - Interiors',
      judgeName: 'Mrs. Beagles',
      armband: '314',
    },
  ],
  runCount: 1,
  totalFeesFormatted: '$25.00',
  receiptNumber: '2026-0137',
  doorsTime: '7:00 AM',
  firstClassTime: '8:30 AM',
  venueNameAndAddress: 'Live Oak Civic Center\n8001 Shin Oak Dr',
  parkingNotes: 'North lot',
  hospitalityNotes: 'Coffee at check-in',
  cratingNotes: 'Soft-sided only',
  secretaryEmail: 'secretary@bckc.org',
  secretaryPhone: '(210) 555-0142',
  trialUrl: 'https://myk9show.com/bckc-spring-2026',
  trialChairName: 'Sarah Whitman',
  trialChairTitle: 'Trial Chair',
  memberClubLanguage: 'A member club of the American Kennel Club',
  showSlug: 'bckc-spring-2026',
};

function previewRunsToProductionRows(
  runs: MagazineConfirmationProps['runs'] | GazetteConfirmationProps['runs']
) {
  return runs.map(({ trialNumeral, ...run }) => ({ ...run, numeral: trialNumeral }));
}

function magazineEdgeData(props: MagazineConfirmationProps): MagazineEmailData {
  return {
    ...props,
    dogName: props.dogRegisteredName,
    venue: props.venueNameAndAddress,
    runs: previewRunsToProductionRows(props.runs),
  };
}

function gazetteEdgeData(props: GazetteConfirmationProps): GazetteEmailData {
  return {
    ...props,
    dogName: props.dogRegisteredName,
    venue: props.venueNameAndAddress,
    runs: previewRunsToProductionRows(props.runs),
  };
}

describe('Magazine/Gazette production email content', () => {
  it('keeps Magazine production renderer on its content contract', () => {
    const productionHtml = buildMagazineHtml(magazineEdgeData(magazinePreviewProps));

    for (const content of [
      'Spring Scent Work Trial',
      'Wandering Cooper, CGC',
      'Cooper',
      'Excellent - Interiors',
      'C. Beagles',
      '314',
      '$25.00',
      'Live Oak Civic Center',
      'secretary@bckc.org',
    ]) {
      expect(productionHtml).toContain(content);
    }

    expect(productionHtml).toContain('>iii<');
  });

  it('keeps Gazette production renderer on its content contract', () => {
    const productionHtml = buildGazetteHtml(gazetteEdgeData(gazettePreviewProps));

    for (const content of [
      'Spring Scent Work Trial',
      'Wandering Cooper, CGC',
      'Cooper',
      'Excellent - Interiors',
      'Mrs. Beagles',
      '314',
      '$25.00',
      'Live Oak Civic Center',
      'secretary@bckc.org',
    ]) {
      expect(productionHtml).toContain(content);
    }

    expect(productionHtml).toContain('>iii<');
  });
});
