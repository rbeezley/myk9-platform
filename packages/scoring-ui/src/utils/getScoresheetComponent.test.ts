import { afterEach, describe, it, expect } from 'vitest';
import {
  getScoresheetComponent,
  registerScoresheet,
  resetScoresheetRegistry,
} from './getScoresheetComponent';

// Import all live scoresheet components to trigger their self-registration
import '../components/scoresheets/AKC/AKCScentWorkLiveScoresheet';
import '../components/scoresheets/AKC/AKCFastCatLiveScoresheet';
import '../components/scoresheets/AKC/AKCNationalsLiveScoresheet';
import '../components/scoresheets/UKC/UKCNoseworkLiveScoresheet';
import '../components/scoresheets/UKC/UKCObedienceLiveScoresheet';
import '../components/scoresheets/UKC/UKCRallyLiveScoresheet';
import '../components/scoresheets/ASCA/ASCAScentDetectionLiveScoresheet';

const sportTypes = [
  'AKC_SCENT_WORK',
  'AKC_FASTCAT',
  'AKC_SCENT_WORK_NATIONAL',
  'UKC_NOSEWORK',
  'UKC_OBEDIENCE',
  'UKC_RALLY',
  'ASCA_SCENT_DETECTION',
] as const;

const importedRegistrations = sportTypes.map(sportType => ({
  sportType,
  component: getScoresheetComponent(sportType, 'live'),
}));

afterEach(() => {
  for (const { sportType, component } of importedRegistrations) {
    if (component) registerScoresheet(sportType, 'live', component);
  }
});

/**
 * Self-registration tests run FIRST — they verify the registry state
 * from module side-effects that ran at import time. These must run
 * before any test that clears or overwrites the registry.
 */
describe('self-registration via imports', () => {
  for (const sportType of sportTypes) {
    describe(`${sportType} registration`, () => {
      it('has live component registered', () => {
        const Component = getScoresheetComponent(sportType, 'live');
        expect(Component).not.toBeNull();
        expect(typeof Component).toBe('function');
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
