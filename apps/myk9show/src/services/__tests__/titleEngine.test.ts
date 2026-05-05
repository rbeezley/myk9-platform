import { describe, it, expect } from 'vitest';
import {
  computeTitleProgress,
  inferLevelFromTitle,
  mapExhibitorResultToLeg,
  mapManualResultToLeg,
  type QualifyingLeg,
} from '../titleEngine';
import type { SportTitleRow } from '@/types/sport-template-types';
import type { ExhibitorResult } from '@/hooks/queries/useExhibitorResults';
import type { ManualResult } from '@/types/manual-result-types';

// ========================================
// TEST HELPERS
// ========================================

const TEMPLATE_ID = 'tmpl-akc';
const AKC_LEVELS = ['Novice', 'Advanced', 'Excellent', 'Master'];

function makeTitle(
  overrides: Partial<SportTitleRow> & { abbreviation: string; full_name: string }
): SportTitleRow {
  return {
    id: `title-${overrides.abbreviation}`,
    sport_template_id: TEMPLATE_ID,
    title_type: 'element',
    required_legs: 3,
    required_elements: ['Container'],
    prerequisite_title_id: null,
    supersedes_title_ids: [],
    sort_order: 100,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    ...overrides,
  };
}

function makeLeg(
  element: string,
  level: string,
  date: string,
  source: 'platform' | 'manual' = 'platform'
): QualifyingLeg {
  return {
    id: `leg-${element}-${level}-${date}-${source}`,
    source,
    element,
    level,
    trial_date: date,
    show_name: `Show ${date}`,
  };
}

// ========================================
// AKC ELEMENT TITLES
// ========================================

const AKC_ELEMENT_TITLES: SportTitleRow[] = [
  makeTitle({
    abbreviation: 'SCN',
    full_name: 'Scent Work Container Novice',
    required_elements: ['Container'],
    sort_order: 100,
  }),
  makeTitle({
    abbreviation: 'SCA',
    full_name: 'Scent Work Container Advanced',
    required_elements: ['Container'],
    sort_order: 101,
  }),
  makeTitle({
    abbreviation: 'SIN',
    full_name: 'Scent Work Interior Novice',
    required_elements: ['Interior'],
    sort_order: 110,
  }),
  makeTitle({
    abbreviation: 'SEN',
    full_name: 'Scent Work Exterior Novice',
    required_elements: ['Exterior'],
    sort_order: 120,
  }),
  makeTitle({
    abbreviation: 'SBN',
    full_name: 'Scent Work Buried Novice',
    required_elements: ['Buried'],
    sort_order: 130,
  }),
];

// ========================================
// TESTS
// ========================================

describe('titleEngine', () => {
  describe('inferLevelFromTitle', () => {
    it('should infer Novice from "Scent Work Container Novice"', () => {
      const title = makeTitle({ abbreviation: 'SCN', full_name: 'Scent Work Container Novice' });
      expect(inferLevelFromTitle(title, AKC_LEVELS)).toBe('Novice');
    });

    it('should infer Master from "Scent Work Master"', () => {
      const title = makeTitle({ abbreviation: 'SWM', full_name: 'Scent Work Master' });
      expect(inferLevelFromTitle(title, AKC_LEVELS)).toBe('Master');
    });

    it('should infer Advanced from ASCA levels', () => {
      const title = makeTitle({
        abbreviation: 'SCAc',
        full_name: 'Scent Detection Advanced Containers',
      });
      expect(inferLevelFromTitle(title, ['Novice', 'Open', 'Advanced', 'Excellent'])).toBe(
        'Advanced'
      );
    });

    it('should return null when level not found', () => {
      const title = makeTitle({ abbreviation: 'SWD', full_name: 'Scent Work Detective' });
      expect(inferLevelFromTitle(title, AKC_LEVELS)).toBe(null);
    });
  });

  describe('mapExhibitorResultToLeg', () => {
    it('should map a qualified result to a leg', () => {
      const result: ExhibitorResult = {
        id: 'r1',
        dogId: 'd1',
        dogName: 'Rex',
        dogCallName: 'Rex',
        showId: 's1',
        classId: 'c1',
        className: 'Container Novice',
        classLevel: 'Novice',
        classElement: 'Container',
        resultText: 'Q',
        resultStatus: 'qualified',
        searchTimeSeconds: 30,
        totalFaults: 0,
        finalPlacement: 1,
        scoringCompletedAt: '2025-01-15',
        showName: 'January Trial',
        showDate: '2025-01-15',
      };
      const leg = mapExhibitorResultToLeg(result);
      expect(leg).toEqual({
        id: 'r1',
        source: 'platform',
        element: 'Container',
        level: 'Novice',
        trial_date: '2025-01-15',
        show_name: 'January Trial',
      });
    });

    it('should return null for NQ result', () => {
      const result: ExhibitorResult = {
        id: 'r1',
        dogId: 'd1',
        dogName: 'Rex',
        dogCallName: 'Rex',
        showId: 's1',
        classId: 'c1',
        className: 'Container Novice',
        classLevel: 'Novice',
        classElement: 'Container',
        resultText: 'NQ',
        resultStatus: 'nq',
        searchTimeSeconds: null,
        totalFaults: 2,
        finalPlacement: null,
        scoringCompletedAt: '2025-01-15',
        showName: 'January Trial',
        showDate: '2025-01-15',
      };
      expect(mapExhibitorResultToLeg(result)).toBeNull();
    });

    it('should return null when classElement is missing', () => {
      const result: ExhibitorResult = {
        id: 'r1',
        dogId: 'd1',
        dogName: 'Rex',
        dogCallName: 'Rex',
        showId: 's1',
        classId: 'c1',
        className: 'Container Novice',
        classLevel: 'Novice',
        classElement: null,
        resultText: 'Q',
        resultStatus: 'qualified',
        searchTimeSeconds: 30,
        totalFaults: 0,
        finalPlacement: 1,
        scoringCompletedAt: '2025-01-15',
        showName: 'January Trial',
        showDate: '2025-01-15',
      };
      expect(mapExhibitorResultToLeg(result)).toBeNull();
    });
  });

  describe('mapManualResultToLeg', () => {
    it('should map a qualified manual result to a leg', () => {
      const result: ManualResult = {
        id: 'mr1',
        dog_id: 'd1',
        owner_id: 'u1',
        organization: 'AKC',
        sport_template_id: TEMPLATE_ID,
        show_name: 'Club Trial',
        trial_date: '2025-02-10',
        judge: 'Judge Smith',
        location: 'Springfield',
        element: 'Container',
        level: 'Novice',
        section: null,
        result_status: 'qualified',
        search_time_seconds: 25,
        placement: 1,
        points_earned: 0,
        notes: null,
        source: 'manual',
        created_at: '2025-02-10',
        updated_at: '2025-02-10',
      };
      const leg = mapManualResultToLeg(result);
      expect(leg).toEqual({
        id: 'mr1',
        source: 'manual',
        element: 'Container',
        level: 'Novice',
        trial_date: '2025-02-10',
        show_name: 'Club Trial',
        judge: 'Judge Smith',
        location: 'Springfield',
        notes: null,
        search_time_seconds: 25,
        sport_template_id: TEMPLATE_ID,
      });
    });

    it('should return null for NQ manual result', () => {
      const result: ManualResult = {
        id: 'mr1',
        dog_id: 'd1',
        owner_id: 'u1',
        organization: 'AKC',
        sport_template_id: TEMPLATE_ID,
        show_name: 'Club Trial',
        trial_date: '2025-02-10',
        judge: null,
        location: null,
        element: 'Container',
        level: 'Novice',
        section: null,
        result_status: 'nq',
        search_time_seconds: null,
        placement: null,
        points_earned: 0,
        notes: null,
        source: 'manual',
        created_at: '2025-02-10',
        updated_at: '2025-02-10',
      };
      expect(mapManualResultToLeg(result)).toBeNull();
    });
  });

  describe('computeTitleProgress', () => {
    it('should compute 3 Qs → element title earned', () => {
      const titles = [AKC_ELEMENT_TITLES[0]]; // SCN
      const legs = [
        makeLeg('Container', 'Novice', '2025-01-10'),
        makeLeg('Container', 'Novice', '2025-01-20'),
        makeLeg('Container', 'Novice', '2025-02-05'),
      ];

      const results = computeTitleProgress(legs, titles, AKC_LEVELS);
      expect(results).toHaveLength(1);
      expect(results[0].abbreviation).toBe('SCN');
      expect(results[0].isEarned).toBe(true);
      expect(results[0].earnedLegs).toBe(3);
      expect(results[0].percentage).toBe(100);
      expect(results[0].earnedDate).toBe('2025-02-05');
    });

    it('should compute 2 Qs → 67% progress', () => {
      const titles = [AKC_ELEMENT_TITLES[0]]; // SCN
      const legs = [
        makeLeg('Container', 'Novice', '2025-01-10'),
        makeLeg('Container', 'Novice', '2025-01-20'),
      ];

      const results = computeTitleProgress(legs, titles, AKC_LEVELS);
      expect(results).toHaveLength(1);
      expect(results[0].isEarned).toBe(false);
      expect(results[0].earnedLegs).toBe(2);
      expect(results[0].percentage).toBe(67);
      expect(results[0].earnedDate).toBeNull();
    });

    it('should compute level title when all element titles earned', () => {
      const titles = [
        ...AKC_ELEMENT_TITLES.filter(t => t.full_name.includes('Novice')),
        makeTitle({
          abbreviation: 'SWN',
          full_name: 'Scent Work Novice',
          title_type: 'level',
          required_legs: 0,
          required_elements: ['Container', 'Interior', 'Exterior', 'Buried'],
          sort_order: 300,
        }),
      ];

      // 3 Qs per element = all 4 element titles earned
      const legs = [
        ...['Container', 'Interior', 'Exterior', 'Buried'].flatMap(element => [
          makeLeg(element, 'Novice', '2025-01-10'),
          makeLeg(element, 'Novice', '2025-01-20'),
          makeLeg(element, 'Novice', '2025-02-05'),
        ]),
      ];

      const results = computeTitleProgress(legs, titles, AKC_LEVELS);
      const swn = results.find(r => r.abbreviation === 'SWN');
      expect(swn).toBeDefined();
      expect(swn!.isEarned).toBe(true);
      expect(swn!.earnedDate).toBe('2025-02-05');
      expect(swn!.earnedElementTitles).toHaveLength(4);
    });

    it('should not earn level title when one element is missing', () => {
      const titles = [
        ...AKC_ELEMENT_TITLES.filter(t => t.full_name.includes('Novice')),
        makeTitle({
          abbreviation: 'SWN',
          full_name: 'Scent Work Novice',
          title_type: 'level',
          required_legs: 0,
          required_elements: ['Container', 'Interior', 'Exterior', 'Buried'],
          sort_order: 300,
        }),
      ];

      // 3 Qs for 3 elements, 0 for Buried
      const legs = [
        ...['Container', 'Interior', 'Exterior'].flatMap(element => [
          makeLeg(element, 'Novice', '2025-01-10'),
          makeLeg(element, 'Novice', '2025-01-20'),
          makeLeg(element, 'Novice', '2025-02-05'),
        ]),
      ];

      const results = computeTitleProgress(legs, titles, AKC_LEVELS);
      const swn = results.find(r => r.abbreviation === 'SWN');
      expect(swn!.isEarned).toBe(false);
      expect(swn!.percentage).toBe(75);
      expect(swn!.earnedElementTitles).toHaveLength(3);
      expect(swn!.requiredElementTitles).toHaveLength(4);
    });

    it('should handle UKC prerequisite chain: AN locked without NN', () => {
      const UKC_TEMPLATE_ID = 'tmpl-ukc';
      const UKC_LEVELS = ['Novice', 'Advanced', 'Superior', 'Master', 'Elite'];

      const nn = makeTitle({
        abbreviation: 'NN',
        full_name: 'Novice Nosework',
        title_type: 'level',
        required_legs: 0,
        required_elements: ['Container', 'Interior', 'Exterior', 'Vehicle'],
        sort_order: 200,
        id: 'title-NN',
        sport_template_id: UKC_TEMPLATE_ID,
      });

      const an = makeTitle({
        abbreviation: 'AN',
        full_name: 'Advanced Nosework',
        title_type: 'level',
        required_legs: 0,
        required_elements: ['Container', 'Interior', 'Exterior', 'Vehicle'],
        sort_order: 201,
        id: 'title-AN',
        sport_template_id: UKC_TEMPLATE_ID,
        prerequisite_title_id: 'title-NN',
      });

      // UKC element titles for Novice (required for NN)
      const ncTitle = makeTitle({
        abbreviation: 'NC',
        full_name: 'Novice Container',
        required_legs: 2,
        required_elements: ['Container'],
        sort_order: 100,
        id: 'title-NC',
        sport_template_id: UKC_TEMPLATE_ID,
      });
      const niTitle = makeTitle({
        abbreviation: 'NI',
        full_name: 'Novice Interior',
        required_legs: 2,
        required_elements: ['Interior'],
        sort_order: 110,
        id: 'title-NI',
        sport_template_id: UKC_TEMPLATE_ID,
      });
      const neTitle = makeTitle({
        abbreviation: 'NE',
        full_name: 'Novice Exterior',
        required_legs: 2,
        required_elements: ['Exterior'],
        sort_order: 120,
        id: 'title-NE',
        sport_template_id: UKC_TEMPLATE_ID,
      });
      const nvTitle = makeTitle({
        abbreviation: 'NV',
        full_name: 'Novice Vehicle',
        required_legs: 2,
        required_elements: ['Vehicle'],
        sort_order: 130,
        id: 'title-NV',
        sport_template_id: UKC_TEMPLATE_ID,
      });

      const titles = [ncTitle, niTitle, neTitle, nvTitle, nn, an];

      // Only 2 Qs in Container = NN not earned → AN locked
      const legs = [
        makeLeg('Container', 'Novice', '2025-01-10'),
        makeLeg('Container', 'Novice', '2025-01-20'),
      ];

      const results = computeTitleProgress(legs, titles, UKC_LEVELS);
      const anResult = results.find(r => r.abbreviation === 'AN');
      expect(anResult!.prerequisiteMet).toBe(false);
    });

    it('should apply supersession: SWN marks element titles as superseded', () => {
      const scn = makeTitle({
        abbreviation: 'SCN',
        full_name: 'Scent Work Container Novice',
        required_elements: ['Container'],
        sort_order: 100,
      });
      const sin = makeTitle({
        abbreviation: 'SIN',
        full_name: 'Scent Work Interior Novice',
        required_elements: ['Interior'],
        sort_order: 110,
      });
      const sen = makeTitle({
        abbreviation: 'SEN',
        full_name: 'Scent Work Exterior Novice',
        required_elements: ['Exterior'],
        sort_order: 120,
      });
      const sbn = makeTitle({
        abbreviation: 'SBN',
        full_name: 'Scent Work Buried Novice',
        required_elements: ['Buried'],
        sort_order: 130,
      });
      const swn = makeTitle({
        abbreviation: 'SWN',
        full_name: 'Scent Work Novice',
        title_type: 'level',
        required_legs: 0,
        required_elements: ['Container', 'Interior', 'Exterior', 'Buried'],
        supersedes_title_ids: ['title-SCN', 'title-SIN', 'title-SEN', 'title-SBN'],
        sort_order: 300,
      });

      const titles = [scn, sin, sen, sbn, swn];
      const legs = ['Container', 'Interior', 'Exterior', 'Buried'].flatMap(element => [
        makeLeg(element, 'Novice', '2025-01-10'),
        makeLeg(element, 'Novice', '2025-01-20'),
        makeLeg(element, 'Novice', '2025-02-05'),
      ]);

      const results = computeTitleProgress(legs, titles, AKC_LEVELS);
      const swnResult = results.find(r => r.abbreviation === 'SWN');
      expect(swnResult!.isEarned).toBe(true);

      // All element titles should be superseded
      for (const abbr of ['SCN', 'SIN', 'SEN', 'SBN']) {
        const r = results.find(p => p.abbreviation === abbr);
        expect(r!.isSuperseded).toBe(true);
      }
    });

    it('should handle mixed sources (platform + manual)', () => {
      const titles = [AKC_ELEMENT_TITLES[0]]; // SCN: 3 legs required
      const legs = [
        makeLeg('Container', 'Novice', '2025-01-10', 'platform'),
        makeLeg('Container', 'Novice', '2025-01-20', 'manual'),
        makeLeg('Container', 'Novice', '2025-02-05', 'platform'),
      ];

      const results = computeTitleProgress(legs, titles, AKC_LEVELS);
      expect(results[0].isEarned).toBe(true);
      expect(results[0].legs).toHaveLength(3);
      expect(results[0].legs.map(l => l.source)).toContain('platform');
      expect(results[0].legs.map(l => l.source)).toContain('manual');
    });

    it('should return 0% for empty data', () => {
      const titles = [AKC_ELEMENT_TITLES[0]]; // SCN
      const results = computeTitleProgress([], titles, AKC_LEVELS);
      expect(results).toHaveLength(1);
      expect(results[0].isEarned).toBe(false);
      expect(results[0].earnedLegs).toBe(0);
      expect(results[0].percentage).toBe(0);
    });

    it('should compute correct earned date (date of Nth qualifying leg)', () => {
      const titles = [AKC_ELEMENT_TITLES[0]]; // SCN: 3 legs
      const legs = [
        makeLeg('Container', 'Novice', '2025-03-01'),
        makeLeg('Container', 'Novice', '2025-01-15'),
        makeLeg('Container', 'Novice', '2025-02-10'),
        makeLeg('Container', 'Novice', '2025-04-01'), // extra leg beyond 3
      ];

      const results = computeTitleProgress(legs, titles, AKC_LEVELS);
      // Legs sorted by date: Jan 15, Feb 10, Mar 01, Apr 01
      // 3rd leg (Nth) = Mar 01
      expect(results[0].earnedDate).toBe('2025-03-01');
    });

    it('should handle UKC champion: 12 legs across 4 elements', () => {
      const UKC_TEMPLATE_ID = 'tmpl-ukc';
      const UKC_LEVELS = ['Novice', 'Advanced', 'Superior', 'Master', 'Elite'];

      const nnch = makeTitle({
        abbreviation: 'NNCH',
        full_name: 'Novice Champion',
        title_type: 'champion',
        required_legs: 12,
        required_elements: ['Container', 'Interior', 'Exterior', 'Vehicle'],
        sort_order: 300,
        id: 'title-NNCH',
        sport_template_id: UKC_TEMPLATE_ID,
      });

      // 3 Qs per element × 4 elements = 12 total
      const legs = ['Container', 'Interior', 'Exterior', 'Vehicle'].flatMap(element => [
        makeLeg(element, 'Novice', '2025-01-10'),
        makeLeg(element, 'Novice', '2025-01-20'),
        makeLeg(element, 'Novice', '2025-02-05'),
      ]);

      const results = computeTitleProgress(legs, [nnch], UKC_LEVELS);
      const nnchResult = results.find(r => r.abbreviation === 'NNCH');
      expect(nnchResult!.isEarned).toBe(true);
      expect(nnchResult!.earnedLegs).toBe(12);
      expect(nnchResult!.percentage).toBe(100);
    });

    it('should not earn UKC champion with 11 legs', () => {
      const UKC_TEMPLATE_ID = 'tmpl-ukc';
      const UKC_LEVELS = ['Novice', 'Advanced', 'Superior', 'Master', 'Elite'];

      const nnch = makeTitle({
        abbreviation: 'NNCH',
        full_name: 'Novice Champion',
        title_type: 'champion',
        required_legs: 12,
        required_elements: ['Container', 'Interior', 'Exterior', 'Vehicle'],
        sort_order: 300,
        id: 'title-NNCH',
        sport_template_id: UKC_TEMPLATE_ID,
      });

      // 3 Qs for 3 elements + 2 for Vehicle = 11 total
      const legs = [
        ...['Container', 'Interior', 'Exterior'].flatMap(element => [
          makeLeg(element, 'Novice', '2025-01-10'),
          makeLeg(element, 'Novice', '2025-01-20'),
          makeLeg(element, 'Novice', '2025-02-05'),
        ]),
        makeLeg('Vehicle', 'Novice', '2025-01-10'),
        makeLeg('Vehicle', 'Novice', '2025-01-20'),
      ];

      const results = computeTitleProgress(legs, [nnch], UKC_LEVELS);
      const nnchResult = results.find(r => r.abbreviation === 'NNCH');
      expect(nnchResult!.isEarned).toBe(false);
      expect(nnchResult!.earnedLegs).toBe(11);
      expect(nnchResult!.percentage).toBe(92);
    });

    it('should handle ASCA cumulative counting: 10 total Qs earns Level C', () => {
      const ASCA_LEVELS = ['Novice', 'Open', 'Advanced', 'Excellent'];

      const scncC = makeTitle({
        abbreviation: 'SCNc-C',
        full_name: 'Scent Detection Novice Containers Level C',
        title_type: 'elite',
        required_legs: 10,
        required_elements: ['Container'],
        sort_order: 300,
        id: 'title-SCNc-C',
        sport_template_id: 'tmpl-asca',
      });

      // 10 Qs total at Container Novice
      const legs = Array.from({ length: 10 }, (_, i) =>
        makeLeg('Container', 'Novice', `2025-0${Math.floor(i / 3) + 1}-${(i % 28) + 10}`)
      );

      const results = computeTitleProgress(legs, [scncC], ASCA_LEVELS);
      const levelC = results.find(r => r.abbreviation === 'SCNc-C');
      expect(levelC!.isEarned).toBe(true);
      expect(levelC!.earnedLegs).toBe(10);
    });

    it('should sort: in-progress first, then next-eligible, earned, locked', () => {
      const UKC_TEMPLATE_ID = 'tmpl-ukc';
      const UKC_LEVELS = ['Novice', 'Advanced', 'Superior', 'Master', 'Elite'];

      // Element titles for Novice
      const nc = makeTitle({
        abbreviation: 'NC',
        full_name: 'Novice Container',
        required_legs: 2,
        required_elements: ['Container'],
        sort_order: 100,
        id: 'title-NC',
        sport_template_id: UKC_TEMPLATE_ID,
      });
      const ni = makeTitle({
        abbreviation: 'NI',
        full_name: 'Novice Interior',
        required_legs: 2,
        required_elements: ['Interior'],
        sort_order: 110,
        id: 'title-NI',
        sport_template_id: UKC_TEMPLATE_ID,
      });
      const neTitle = makeTitle({
        abbreviation: 'NE',
        full_name: 'Novice Exterior',
        required_legs: 2,
        required_elements: ['Exterior'],
        sort_order: 120,
        id: 'title-NE',
        sport_template_id: UKC_TEMPLATE_ID,
      });
      const nv = makeTitle({
        abbreviation: 'NV',
        full_name: 'Novice Vehicle',
        required_legs: 2,
        required_elements: ['Vehicle'],
        sort_order: 130,
        id: 'title-NV',
        sport_template_id: UKC_TEMPLATE_ID,
      });
      const nn = makeTitle({
        abbreviation: 'NN',
        full_name: 'Novice Nosework',
        title_type: 'level',
        required_legs: 0,
        required_elements: ['Container', 'Interior', 'Exterior', 'Vehicle'],
        sort_order: 200,
        id: 'title-NN',
        sport_template_id: UKC_TEMPLATE_ID,
      });
      const an = makeTitle({
        abbreviation: 'AN',
        full_name: 'Advanced Nosework',
        title_type: 'level',
        required_legs: 0,
        required_elements: ['Container', 'Interior', 'Exterior', 'Vehicle'],
        sort_order: 201,
        id: 'title-AN',
        sport_template_id: UKC_TEMPLATE_ID,
        prerequisite_title_id: 'title-NN',
      });

      const titles = [nc, ni, neTitle, nv, nn, an];

      // NC earned (2 Qs), NI in progress (1 Q), NE/NV no legs
      const legs = [
        makeLeg('Container', 'Novice', '2025-01-10'),
        makeLeg('Container', 'Novice', '2025-01-20'),
        makeLeg('Interior', 'Novice', '2025-01-15'),
      ];

      const results = computeTitleProgress(legs, titles, UKC_LEVELS);
      const abbreviations = results.map(r => r.abbreviation);

      // NI is in-progress (has 1 leg) → first
      // NE, NV are next-eligible (0 legs, prereq met) → next
      // NC is earned → next
      // NN is partially earned (1/4 element titles) → next-eligible since it's a level title with 0 legs
      // AN is locked (NN not earned) → last
      expect(abbreviations.indexOf('NI')).toBeLessThan(abbreviations.indexOf('NC'));
      expect(abbreviations.indexOf('AN')).toBe(abbreviations.length - 1);
    });
  });
});
