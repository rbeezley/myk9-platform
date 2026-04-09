// packages/secretary/src/results/__tests__/AKCScentWorkFormatter.test.ts

import { describe, it, expect } from 'vitest';
import { AKCScentWorkFormatter } from '../formatters/AKCScentWorkFormatter';
import type { AKCSubmissionData, AKCSubmissionEntry } from '../types';

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

function makeShow(overrides: Partial<AKCSubmissionData['show']> = {}): AKCSubmissionData['show'] {
  return {
    id: 'show-1',
    name: 'Spring Scent Trial',
    clubName: 'Acme K9 Club',
    date: '2026-05-10',
    clubLicenseNumber: '12345',
    secretaryName: 'Jane Secretary',
    secretaryEmail: 'jane@example.com',
    ...overrides,
  };
}

function makeTrial(
  overrides: Partial<AKCSubmissionData['trials'][number]> = {}
): AKCSubmissionData['trials'][number] {
  return {
    id: 'trial-1',
    trialNumber: 1,
    date: '2026-05-10',
    judgeName: 'Bob Judge',
    organization: 'AKC',
    sportType: 'scent_work',
    eventNumber: '2026193001',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<AKCSubmissionEntry> = {}): AKCSubmissionEntry {
  return {
    dogName: 'Fluffy',
    breed: 'Unknown',
    registrationNumber: 'HP12345601',
    handlerName: 'Alice Handler',
    className: 'Novice A - Container',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    resultCode: 'Q',
    searchTimeSeconds: 14.5,
    totalFaults: 0,
    finalPlacement: 1,
    armbandNumber: 101,
    trialId: 'trial-1',
    classId: 'class-1',
    dogRegisteredName: 'Acme Fluffy The First',
    dogGender: 'B',
    ownerName: 'Alice Owner',
    ownerAddress: {
      street: '123 Main St',
      city: 'Columbus',
      state: 'OH',
      zip: '43215',
      country: 'US',
    },
    timeLimitSeconds: 120,
    entryStatus: 'accepted',
    checkInStatus: 'present',
    resultStatus: 'Q',
    ...overrides,
  };
}

function makeData(overrides: Partial<AKCSubmissionData> = {}): AKCSubmissionData {
  return {
    show: makeShow(),
    trials: [makeTrial()],
    entries: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AKCScentWorkFormatter', () => {
  it('has organization AKC', () => {
    expect(AKCScentWorkFormatter.organization).toBe('AKC');
  });

  it('has sportType scent_work', () => {
    expect(AKCScentWorkFormatter.sportType).toBe('scent_work');
  });

  it('has submissionEmail set', () => {
    expect(AKCScentWorkFormatter.submissionEmail).toBeTruthy();
  });

  describe('sender element', () => {
    it('starts with XML declaration', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml.startsWith('<?xml version="1.0"?>')).toBe(true);
    });

    it('has correct xmlns and schemaVersion', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml).toContain('xmlns="http://www.akc.org"');
      expect(xml).toContain('schemaVersion="1.0"');
    });

    it('includes secretary name in sender name attribute', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml).toContain('name="Jane Secretary"');
    });

    it('includes secretary email in responseEmail attribute', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml).toContain('responseEmail="jane@example.com"');
    });

    it('escapes ampersands in secretary name', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ show: makeShow({ secretaryName: 'Jane & Bob' }) })
      );
      expect(xml).toContain('name="Jane &amp; Bob"');
      expect(xml).not.toContain('name="Jane & Bob"');
    });
  });

  describe('event element', () => {
    it('produces one event per trial', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          trials: [
            makeTrial({ id: 'trial-1', eventNumber: '2026193001', date: '2026-05-10' }),
            makeTrial({ id: 'trial-2', eventNumber: '2026193002', date: '2026-05-11' }),
          ],
        })
      );
      expect((xml.match(/<event /g) ?? []).length).toBe(2);
      expect(xml).toContain('akceventid="2026193001"');
      expect(xml).toContain('akceventid="2026193002"');
    });

    it('includes club name in event', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml).toContain('clubName="Acme K9 Club"');
    });

    it('includes event date', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml).toContain('eventDate="2026-05-10"');
    });
  });

  describe('class element', () => {
    it('groups entries from the same class into one class element', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({ classId: 'class-1', armbandNumber: 101 }),
            makeEntry({ classId: 'class-1', armbandNumber: 102, finalPlacement: 2 }),
          ],
        })
      );
      expect((xml.match(/<class /g) ?? []).length).toBe(1);
    });

    it('creates separate class elements for different classes', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({ classId: 'class-1' }),
            makeEntry({
              classId: 'class-2',
              element: 'Interior',
              level: 'Novice',
              section: 'A',
              trialId: 'trial-1',
            }),
          ],
        })
      );
      expect((xml.match(/<class /g) ?? []).length).toBe(2);
    });

    it('sets compGroup to SCWK', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData({ entries: [makeEntry()] }));
      expect(xml).toContain('compGroup="SCWK"');
    });

    it('sets breedCode to ALLB on class', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData({ entries: [makeEntry()] }));
      expect(xml).toContain('breedCode="ALLB"');
    });

    it('sets gender to C (combined) on class', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData({ entries: [makeEntry()] }));
      expect(xml).toContain('gender="C"');
    });

    it('formats courseTime as seconds.0 from timeLimitSeconds', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ timeLimitSeconds: 120 })] })
      );
      expect(xml).toContain('courseTime="120.0"');
    });

    it('computes numEntries excluding withdrawals', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({ classId: 'class-1', armbandNumber: 101, entryStatus: 'accepted' }),
            makeEntry({ classId: 'class-1', armbandNumber: 102, entryStatus: 'accepted' }),
            makeEntry({ classId: 'class-1', armbandNumber: 103, entryStatus: 'withdrawn' }),
          ],
        })
      );
      expect(xml).toContain('numEntries="2"');
      expect(xml).toContain('numWithdrawals="1"');
    });

    it('computes numStarters excluding absent entries', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({ classId: 'class-1', armbandNumber: 101, checkInStatus: 'present' }),
            makeEntry({
              classId: 'class-1',
              armbandNumber: 102,
              checkInStatus: 'absent',
              resultStatus: null,
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('numEntries="2"');
      expect(xml).toContain('numStarters="1"');
    });

    it('computes numQualifying from Q results and placements 1-4', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              classId: 'class-1',
              armbandNumber: 101,
              finalPlacement: 1,
              resultStatus: null,
            }),
            makeEntry({
              classId: 'class-1',
              armbandNumber: 102,
              finalPlacement: null,
              resultStatus: 'Q',
            }),
            makeEntry({
              classId: 'class-1',
              armbandNumber: 103,
              finalPlacement: null,
              resultStatus: null,
            }),
          ],
        })
      );
      expect(xml).toContain('numQualifying="2"');
    });
  });

  describe('primaryClass mapping', () => {
    const cases: Array<[string, string, string]> = [
      ['Novice', 'A', 'SWNOVA'],
      ['Novice', 'B', 'SWNOVB'],
      ['Advanced', '', 'SWADV'],
      ['Excellent', '', 'SWEXC'],
      ['Master', '', 'SWMAST'],
      ['Detective', '', 'SWDC'],
    ];

    for (const [level, section, expected] of cases) {
      it(`maps ${level} ${section} to ${expected}`, () => {
        const xml = AKCScentWorkFormatter.formatXml(
          makeData({
            entries: [makeEntry({ level, section: section || null, element: 'Container' })],
          })
        );
        expect(xml).toContain(`primaryClass="${expected}"`);
      });
    }
  });

  describe('secondaryClass mapping', () => {
    const cases: Array<[string, string]> = [
      ['Container', 'CONTAINR'],
      ['Interior', 'INTERIOR'],
      ['Exterior', 'EXTERIOR'],
      ['Buried', 'BURIED'],
      ['Handler Discrimination', 'HANDDISC'],
    ];

    for (const [element, expected] of cases) {
      it(`maps ${element} to ${expected}`, () => {
        const xml = AKCScentWorkFormatter.formatXml(
          makeData({ entries: [makeEntry({ element })] })
        );
        expect(xml).toContain(`secondaryClass="${expected}"`);
      });
    }

    it('omits secondaryClass for Detective', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [makeEntry({ level: 'Detective', element: 'Detective', section: null })],
        })
      );
      expect(xml).not.toContain('secondaryClass=');
    });
  });

  describe('results element', () => {
    it('includes AKC registration number', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ registrationNumber: 'HP66613103' })] })
      );
      expect(xml).toContain('akcDogRegnum="HP66613103"');
    });

    it('exports empty string for missing AKC reg number (not null/undefined)', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ registrationNumber: null })] })
      );
      expect(xml).toContain('akcDogRegnum=""');
      expect(xml).not.toContain('akcDogRegnum="null"');
      expect(xml).not.toContain('akcDogRegnum="undefined"');
    });

    it('uses dogRegisteredName for dogName attribute', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              dogName: 'CallName',
              dogRegisteredName: 'Acme Fluffy The First',
            }),
          ],
        })
      );
      expect(xml).toContain('dogName="Acme Fluffy The First"');
    });

    it('falls back to dogName when dogRegisteredName is null', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [makeEntry({ dogName: 'CallName', dogRegisteredName: null })],
        })
      );
      expect(xml).toContain('dogName="CallName"');
    });

    it('includes armband number as catalogNumber', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ armbandNumber: 145 })] })
      );
      expect(xml).toContain('catalogNumber="145"');
    });

    it('includes search time as courseTime', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ searchTimeSeconds: 17.5 })] })
      );
      expect(xml).toContain('courseTime="17.5"');
    });
  });

  describe('actionCode / resultCode mapping', () => {
    it('maps withdrawn → WHLD / EXO', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'withdrawn',
              checkInStatus: null,
              resultStatus: null,
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="WHLD"');
      expect(xml).toContain('<resultCode>EXO</resultCode>');
    });

    it('maps absent → ABSN / A', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'absent',
              resultStatus: null,
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="ABSN"');
      expect(xml).toContain('<resultCode>A</resultCode>');
    });

    it('maps disqualified → DISQ / A', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: 'disqualified',
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="DISQ"');
      expect(xml).toContain('<resultCode>A</resultCode>');
    });

    it('maps excused → EXCU / EXO', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: 'excused',
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="EXCU"');
      expect(xml).toContain('<resultCode>EXO</resultCode>');
    });

    it('maps placement 1 → PLAC / 1', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: null,
              finalPlacement: 1,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="PLAC"');
      expect(xml).toContain('<resultCode>1</resultCode>');
    });

    it('maps placement 4 → PLAC / 4', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: null,
              finalPlacement: 4,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="PLAC"');
      expect(xml).toContain('<resultCode>4</resultCode>');
    });

    it('maps Q with no placement → CNT / Q', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: 'Q',
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="CNT"');
      expect(xml).toContain('<resultCode>Q</resultCode>');
    });

    it('maps explicit NQ → CNT / NQ', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: 'NQ',
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="CNT"');
      expect(xml).toContain('<resultCode>NQ</resultCode>');
    });

    it('maps unscored entry (null result, null placement) → CNT / NQ', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: null,
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="CNT"');
      expect(xml).toContain('<resultCode>NQ</resultCode>');
    });
  });

  describe('owner address', () => {
    it('uses USState and USPostalCode for US addresses', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              ownerAddress: {
                street: '123 Main St',
                city: 'Columbus',
                state: 'OH',
                zip: '43215',
                country: 'US',
              },
            }),
          ],
        })
      );
      expect(xml).toContain('<USState>OH</USState>');
      expect(xml).toContain('<USPostalCode>43215</USPostalCode>');
      expect(xml).not.toContain('ForeignState');
    });

    it('uses ForeignState and ForeignPostalCode for Canadian addresses', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              ownerAddress: {
                street: '456 Maple Ave',
                city: 'Ottawa',
                state: 'ON',
                zip: 'K1A0A6',
                country: 'CA',
              },
            }),
          ],
        })
      );
      expect(xml).toContain('<ForeignState>ON</ForeignState>');
      expect(xml).toContain('<ForeignPostalCode>K1A0A6</ForeignPostalCode>');
      expect(xml).not.toContain('USState');
    });

    it('strips hyphens from US zip codes', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              ownerAddress: {
                street: '1 Park Ave',
                city: 'New York',
                state: 'NY',
                zip: '10001-1234',
                country: 'US',
              },
            }),
          ],
        })
      );
      expect(xml).toContain('<USPostalCode>100011234</USPostalCode>');
    });

    it('omits ownerAddress element when ownerAddress is null', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ ownerAddress: null })] })
      );
      expect(xml).not.toContain('<ownerAddress>');
    });
  });

  describe('gender', () => {
    it('uses D for male dogs', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ dogGender: 'D' })] })
      );
      expect(xml).toContain('gender="D"');
    });

    it('uses B for female dogs', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ dogGender: 'B' })] })
      );
      expect(xml).toContain('gender="B"');
    });

    it('defaults to B when dogGender is null', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ dogGender: null })] })
      );
      expect(xml).toContain('gender="B"');
    });
  });

  describe('multi-trial show', () => {
    it('only includes entries from each trial in the correct event', () => {
      const xml = AKCScentWorkFormatter.formatXml({
        show: makeShow(),
        trials: [
          makeTrial({ id: 'trial-1', eventNumber: 'EV001', date: '2026-05-10' }),
          makeTrial({ id: 'trial-2', eventNumber: 'EV002', date: '2026-05-11' }),
        ],
        entries: [
          makeEntry({ trialId: 'trial-1', armbandNumber: 101 }),
          makeEntry({ trialId: 'trial-2', armbandNumber: 201 }),
        ],
      });
      // Both events present
      expect(xml).toContain('akceventid="EV001"');
      expect(xml).toContain('akceventid="EV002"');
    });
  });
});
