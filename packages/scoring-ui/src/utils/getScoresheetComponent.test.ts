import { describe, it, expect } from 'vitest';
import { getScoresheetComponent, registerScoresheet } from './getScoresheetComponent';

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

describe('getScoresheetComponent', () => {
  it('returns null for unknown sport type', () => {
    const Component = getScoresheetComponent('UNKNOWN' as never, 'live');
    expect(Component).toBeNull();
  });

  it('registers and retrieves a live component', () => {
    const MockLive = () => null;
    MockLive.displayName = 'MockAKCScentWorkLive';
    registerScoresheet('AKC_SCENT_WORK', 'live', MockLive as never);

    const result = getScoresheetComponent('AKC_SCENT_WORK', 'live');
    expect(result).toBe(MockLive);
  });

  it('registers and retrieves an entry component', () => {
    const MockEntry = () => null;
    MockEntry.displayName = 'MockAKCScentWorkEntry';
    registerScoresheet('AKC_SCENT_WORK', 'entry', MockEntry as never);

    const result = getScoresheetComponent('AKC_SCENT_WORK', 'entry');
    expect(result).toBe(MockEntry);
  });

  it('returns different components for live vs entry mode', () => {
    const live = getScoresheetComponent('AKC_SCENT_WORK', 'live');
    const entry = getScoresheetComponent('AKC_SCENT_WORK', 'entry');
    expect(live).not.toBe(entry);
  });

  describe('AKC_SCENT_WORK registration', () => {
    it('has live component registered', () => {
      const Component = getScoresheetComponent('AKC_SCENT_WORK', 'live');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('has entry component registered', () => {
      const Component = getScoresheetComponent('AKC_SCENT_WORK', 'entry');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('live and entry are different components', () => {
      const live = getScoresheetComponent('AKC_SCENT_WORK', 'live');
      const entry = getScoresheetComponent('AKC_SCENT_WORK', 'entry');
      expect(live).not.toBe(entry);
    });
  });

  describe('AKC_FASTCAT registration', () => {
    it('has live component registered', () => {
      const Component = getScoresheetComponent('AKC_FASTCAT', 'live');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('has entry component registered', () => {
      const Component = getScoresheetComponent('AKC_FASTCAT', 'entry');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('live and entry are different components', () => {
      const live = getScoresheetComponent('AKC_FASTCAT', 'live');
      const entry = getScoresheetComponent('AKC_FASTCAT', 'entry');
      expect(live).not.toBe(entry);
    });
  });

  describe('AKC_SCENT_WORK_NATIONAL registration', () => {
    it('has live component registered', () => {
      const Component = getScoresheetComponent('AKC_SCENT_WORK_NATIONAL', 'live');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('has entry component registered', () => {
      const Component = getScoresheetComponent('AKC_SCENT_WORK_NATIONAL', 'entry');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('live and entry are different components', () => {
      const live = getScoresheetComponent('AKC_SCENT_WORK_NATIONAL', 'live');
      const entry = getScoresheetComponent('AKC_SCENT_WORK_NATIONAL', 'entry');
      expect(live).not.toBe(entry);
    });
  });

  describe('UKC_NOSEWORK registration', () => {
    it('has live component registered', () => {
      const Component = getScoresheetComponent('UKC_NOSEWORK', 'live');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('has entry component registered', () => {
      const Component = getScoresheetComponent('UKC_NOSEWORK', 'entry');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('live and entry are different components', () => {
      const live = getScoresheetComponent('UKC_NOSEWORK', 'live');
      const entry = getScoresheetComponent('UKC_NOSEWORK', 'entry');
      expect(live).not.toBe(entry);
    });
  });

  describe('UKC_OBEDIENCE registration', () => {
    it('has live component registered', () => {
      const Component = getScoresheetComponent('UKC_OBEDIENCE', 'live');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('has entry component registered', () => {
      const Component = getScoresheetComponent('UKC_OBEDIENCE', 'entry');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('live and entry are different components', () => {
      const live = getScoresheetComponent('UKC_OBEDIENCE', 'live');
      const entry = getScoresheetComponent('UKC_OBEDIENCE', 'entry');
      expect(live).not.toBe(entry);
    });
  });

  describe('UKC_RALLY registration', () => {
    it('has live component registered', () => {
      const Component = getScoresheetComponent('UKC_RALLY', 'live');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('has entry component registered', () => {
      const Component = getScoresheetComponent('UKC_RALLY', 'entry');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('live and entry are different components', () => {
      const live = getScoresheetComponent('UKC_RALLY', 'live');
      const entry = getScoresheetComponent('UKC_RALLY', 'entry');
      expect(live).not.toBe(entry);
    });
  });

  describe('ASCA_SCENT_DETECTION registration', () => {
    it('has live component registered', () => {
      const Component = getScoresheetComponent('ASCA_SCENT_DETECTION', 'live');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('has entry component registered', () => {
      const Component = getScoresheetComponent('ASCA_SCENT_DETECTION', 'entry');
      expect(Component).not.toBeNull();
      expect(typeof Component).toBe('function');
    });

    it('live and entry are different components', () => {
      const live = getScoresheetComponent('ASCA_SCENT_DETECTION', 'live');
      const entry = getScoresheetComponent('ASCA_SCENT_DETECTION', 'entry');
      expect(live).not.toBe(entry);
    });
  });
});
