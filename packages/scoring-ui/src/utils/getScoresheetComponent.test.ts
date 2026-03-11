import { describe, it, expect } from 'vitest';
import {
  getScoresheetComponent,
  registerScoresheet,
  resetScoresheetRegistry,
} from './getScoresheetComponent';

// Import all Live/Entry scoresheet components to trigger their self-registration
import '../components/scoresheets/AKC/AKCScentWorkLiveScoresheet';
import '../components/scoresheets/AKC/AKCScentWorkEntryScoresheet';
import '../components/scoresheets/AKC/AKCFastCatLiveScoresheet';
import '../components/scoresheets/AKC/AKCFastCatEntryScoresheet';
import '../components/scoresheets/AKC/AKCNationalsLiveScoresheet';
import '../components/scoresheets/AKC/AKCNationalsEntryScoresheet';
import '../components/scoresheets/UKC/UKCNoseworkLiveScoresheet';
import '../components/scoresheets/UKC/UKCNoseworkEntryScoresheet';
import '../components/scoresheets/UKC/UKCObedienceLiveScoresheet';
import '../components/scoresheets/UKC/UKCObedienceEntryScoresheet';
import '../components/scoresheets/UKC/UKCRallyLiveScoresheet';
import '../components/scoresheets/UKC/UKCRallyEntryScoresheet';
import '../components/scoresheets/ASCA/ASCAScentDetectionLiveScoresheet';
import '../components/scoresheets/ASCA/ASCAScentDetectionEntryScoresheet';

/**
 * Self-registration tests run FIRST — they verify the registry state
 * from module side-effects that ran at import time. These must run
 * before any test that clears or overwrites the registry.
 */
describe('self-registration via imports', () => {
  const sportTypes = [
    'AKC_SCENT_WORK',
    'AKC_FASTCAT',
    'AKC_SCENT_WORK_NATIONAL',
    'UKC_NOSEWORK',
    'UKC_OBEDIENCE',
    'UKC_RALLY',
    'ASCA_SCENT_DETECTION',
  ] as const;

  for (const sportType of sportTypes) {
    describe(`${sportType} registration`, () => {
      it('has live component registered', () => {
        const Component = getScoresheetComponent(sportType, 'live');
        expect(Component).not.toBeNull();
        expect(typeof Component).toBe('function');
      });

      it('has entry component registered', () => {
        const Component = getScoresheetComponent(sportType, 'entry');
        expect(Component).not.toBeNull();
        expect(typeof Component).toBe('function');
      });

      it('live and entry are different components', () => {
        const live = getScoresheetComponent(sportType, 'live');
        const entry = getScoresheetComponent(sportType, 'entry');
        expect(live).not.toBe(entry);
      });
    });
  }
});

describe('getScoresheetComponent', () => {
  it('returns null for unknown sport type', () => {
    const Component = getScoresheetComponent('UNKNOWN' as never, 'live');
    expect(Component).toBeNull();
  });

  describe('registration mechanics', () => {
    it('registers and retrieves a live component', () => {
      const MockLive = () => null;
      MockLive.displayName = 'MockLive';
      registerScoresheet('AKC_SCENT_WORK', 'live', MockLive as never);

      const result = getScoresheetComponent('AKC_SCENT_WORK', 'live');
      expect(result).toBe(MockLive);
    });

    it('registers and retrieves an entry component', () => {
      const MockEntry = () => null;
      MockEntry.displayName = 'MockEntry';
      registerScoresheet('AKC_SCENT_WORK', 'entry', MockEntry as never);

      const result = getScoresheetComponent('AKC_SCENT_WORK', 'entry');
      expect(result).toBe(MockEntry);
    });

    it('returns different components for live vs entry mode', () => {
      const live = getScoresheetComponent('AKC_SCENT_WORK', 'live');
      const entry = getScoresheetComponent('AKC_SCENT_WORK', 'entry');
      expect(live).not.toBe(entry);
    });
  });

  describe('resetScoresheetRegistry', () => {
    it('clears all registrations', () => {
      // Verify something is registered
      expect(getScoresheetComponent('AKC_SCENT_WORK', 'live')).not.toBeNull();

      resetScoresheetRegistry();
      expect(getScoresheetComponent('AKC_SCENT_WORK', 'live')).toBeNull();
    });
  });
});
