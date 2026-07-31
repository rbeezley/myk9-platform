import { describe, it, expect } from 'vitest';
import {
  computeTitleProgress,
  inferLevelFromTitle,
  mapExhibitorResultToLeg,
  mapManualResultToLeg,
  type QualifyingLeg,
} from '../titleEngine';
import { levelResolverForTemplate } from '@/features/registries/elementLevels';
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

    it('keys a standalone class by its element when the class has no level', () => {
      // AKC Detective is the only class seeded with `sport_class_rules.level = NULL` — the
      // registry names a standalone class after its element. These used to be dropped, which
      // made SWD unearnable from platform scoring however many Detective legs a dog had.
      const result: ExhibitorResult = {
        id: 'r1',
        dogId: 'd1',
        dogName: 'Rex',
        dogCallName: 'Rex',
        showId: 's1',
        classId: 'c1',
        className: 'Detective',
        classLevel: null,
        classElement: 'Detective',
        resultText: 'Q',
        resultStatus: 'qualified',
        searchTimeSeconds: 400,
        totalFaults: 0,
        finalPlacement: 1,
        scoringCompletedAt: '2026-05-01',
        showName: 'May Trial',
        showDate: '2026-05-01',
      };

      expect(mapExhibitorResultToLeg(result)).toEqual({
        id: 'r1',
        source: 'platform',
        element: 'Detective',
        level: 'Detective',
        trial_date: '2026-05-01',
        show_name: 'May Trial',
      });
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

  // ========================================
  // PER-ELEMENT LEVELS
  // ========================================

  /**
   * Everything above passes a flat level array — the degenerate case where a sport's elements
   * happen to share one level set — and must keep working unchanged. These cover the elements
   * where a flat array is simply wrong. Source: UKC rulebook Ch. 11 §2.
   */
  describe('per-element levels', () => {
    // What `sport_templates.levels` holds — the GRID elements' set, by contract
    // (src/test/database/registryDbParityContract.test.ts). Note: no 'Excellent'.
    const UKC_FLAT_LEVELS = ['Novice', 'Advanced', 'Superior', 'Master', 'Elite'];
    const AKC_FLAT_LEVELS = ['Novice', 'Advanced', 'Excellent', 'Master'];

    const ukcLevels = levelResolverForTemplate({ sport_code: 'ukc-nosework' }, UKC_FLAT_LEVELS);
    const akcLevels = levelResolverForTemplate({ sport_code: 'akc-scent-work' }, AKC_FLAT_LEVELS);

    const EHD = makeTitle({
      abbreviation: 'EHD',
      full_name: 'Excellent Handler Discrimination',
      required_legs: 3,
      required_elements: ['Handler Discrimination'],
      sport_template_id: 'tmpl-ukc',
    });

    describe('UKC Excellent Handler Discrimination', () => {
      it('infers the Excellent level the flat list cannot see', () => {
        expect(inferLevelFromTitle(EHD, UKC_FLAT_LEVELS)).toBe(null); // the bug
        expect(inferLevelFromTitle(EHD, ukcLevels)).toBe('Excellent');
      });

      it('counts Handler Discrimination::Excellent legs toward EHD', () => {
        const legs = [
          makeLeg('Handler Discrimination', 'Excellent', '2026-03-01'),
          makeLeg('Handler Discrimination', 'Excellent', '2026-03-02'),
          makeLeg('Handler Discrimination', 'Excellent', '2026-03-03'),
        ];

        const earned = computeTitleProgress(legs, [EHD], ukcLevels)[0];
        expect(earned.earnedLegs).toBe(3);
        expect(earned.isEarned).toBe(true);
        expect(earned.earnedDate).toBe('2026-03-03');
      });

      it('counted nothing before the fix — the flat list is the regression guard', () => {
        const legs = [
          makeLeg('Handler Discrimination', 'Excellent', '2026-03-01'),
          makeLeg('Handler Discrimination', 'Excellent', '2026-03-02'),
          makeLeg('Handler Discrimination', 'Excellent', '2026-03-03'),
        ];

        const stale = computeTitleProgress(legs, [EHD], UKC_FLAT_LEVELS)[0];
        expect(stale.earnedLegs).toBe(0);
        expect(stale.isEarned).toBe(false);
      });

      it('will not resolve an HD title to Superior or Elite', () => {
        // Those levels exist for the grid elements but UKC does not run them for HD, so a
        // title scoped to HD must never key legs at them.
        const hdSuperior = makeTitle({
          abbreviation: 'SHD?',
          full_name: 'Superior Handler Discrimination',
          required_elements: ['Handler Discrimination'],
          sport_template_id: 'tmpl-ukc',
        });
        expect(inferLevelFromTitle(hdSuperior, ukcLevels)).toBe(null);
      });

      it('leaves the grid elements on Superior — Excellent is HD-only', () => {
        const superiorContainer = makeTitle({
          abbreviation: 'SC',
          full_name: 'Superior Container',
          required_legs: 2,
          required_elements: ['Container'],
          sport_template_id: 'tmpl-ukc',
        });
        expect(inferLevelFromTitle(superiorContainer, ukcLevels)).toBe('Superior');

        const legs = [
          makeLeg('Container', 'Superior', '2026-04-01'),
          makeLeg('Container', 'Superior', '2026-04-02'),
        ];
        expect(computeTitleProgress(legs, [superiorContainer], ukcLevels)[0].isEarned).toBe(true);
      });
    });

    describe('trailing level words are grades, not levels', () => {
      it('reads MHDX as Master, not Excellent', () => {
        // 'Master Handler Discrimination Excellent' is the Excellent-GRADE continuation of
        // MHD — a Master-level title. Now that Excellent is a candidate for this element, a
        // longest-label-first scan would misread it; earliest-match keeps it at Master.
        const mhdx = makeTitle({
          abbreviation: 'MHDX',
          full_name: 'Master Handler Discrimination Excellent',
          title_type: 'continuation',
          required_legs: 10,
          required_elements: ['Handler Discrimination'],
          sport_template_id: 'tmpl-ukc',
        });
        expect(inferLevelFromTitle(mhdx, ukcLevels)).toBe('Master');
      });

      it('reads EHDS as Excellent', () => {
        const ehds = makeTitle({
          abbreviation: 'EHDS',
          full_name: 'Excellent Handler Discrimination Supreme',
          title_type: 'continuation',
          required_legs: 10,
          required_elements: ['Handler Discrimination'],
          sport_template_id: 'tmpl-ukc',
        });
        expect(inferLevelFromTitle(ehds, ukcLevels)).toBe('Excellent');
      });
    });

    describe('AKC Detective — a standalone element whose only level is its own name', () => {
      const SWD = makeTitle({
        abbreviation: 'SWD',
        full_name: 'Scent Work Detective',
        title_type: 'elite',
        required_legs: 2,
        required_elements: ['Detective'],
      });

      it('infers Detective, where the flat list infers nothing', () => {
        expect(inferLevelFromTitle(SWD, AKC_FLAT_LEVELS)).toBe(null); // the bug
        expect(inferLevelFromTitle(SWD, akcLevels)).toBe('Detective');
      });

      it('counts Detective::Detective legs toward SWD', () => {
        const legs = [
          makeLeg('Detective', 'Detective', '2026-05-01'),
          makeLeg('Detective', 'Detective', '2026-05-02'),
        ];
        const result = computeTitleProgress(legs, [SWD], akcLevels)[0];
        expect(result.earnedLegs).toBe(2);
        expect(result.isEarned).toBe(true);
      });

      it('closes the loop: a platform-scored Detective run counts toward SWD', () => {
        // The leg shape here comes from `mapExhibitorResultToLeg`, not hand-built — a
        // Detective class carries no level, so this is the only way the two halves agree.
        const platformLeg = mapExhibitorResultToLeg({
          id: 'r1',
          dogId: 'd1',
          dogName: 'Rex',
          dogCallName: 'Rex',
          showId: 's1',
          classId: 'c1',
          className: 'Detective',
          classLevel: null,
          classElement: 'Detective',
          resultText: 'Q',
          resultStatus: 'qualified',
          searchTimeSeconds: 400,
          totalFaults: 0,
          finalPlacement: 1,
          scoringCompletedAt: '2026-05-01',
          showName: 'May Trial',
          showDate: '2026-05-01',
        });

        expect(platformLeg).not.toBeNull();
        const result = computeTitleProgress(
          [platformLeg!, makeLeg('Detective', 'Detective', '2026-05-02')],
          [SWD],
          akcLevels
        )[0];
        expect(result.earnedLegs).toBe(2);
        expect(result.isEarned).toBe(true);
      });
    });

    describe('registries whose elements do share one level set are unaffected', () => {
      it('AKC element titles resolve identically flat and element-scoped', () => {
        for (const title of AKC_ELEMENT_TITLES) {
          expect(inferLevelFromTitle(title, akcLevels)).toBe(
            inferLevelFromTitle(title, AKC_FLAT_LEVELS)
          );
        }
      });

      it('AKC progress is byte-for-byte unchanged', () => {
        const legs = [
          makeLeg('Container', 'Novice', '2025-01-01'),
          makeLeg('Container', 'Novice', '2025-01-02'),
          makeLeg('Container', 'Novice', '2025-01-03'),
          makeLeg('Interior', 'Novice', '2025-02-01'),
        ];
        expect(computeTitleProgress(legs, AKC_ELEMENT_TITLES, akcLevels)).toEqual(
          computeTitleProgress(legs, AKC_ELEMENT_TITLES, AKC_FLAT_LEVELS)
        );
      });

      it('ASCA element titles resolve identically flat and element-scoped', () => {
        const ASCA_FLAT_LEVELS = ['Novice', 'Open', 'Advanced', 'Excellent'];
        const ascaLevels = levelResolverForTemplate(
          { sport_code: 'asca-scent-detection' },
          ASCA_FLAT_LEVELS
        );
        const titles = [
          makeTitle({
            abbreviation: 'SCOc',
            full_name: 'Scent Detection Open Containers',
            required_elements: ['Container'],
          }),
          makeTitle({
            abbreviation: 'SCEv',
            full_name: 'Scent Detection Excellent Vehicles',
            required_elements: ['Vehicle'],
          }),
        ];
        for (const title of titles) {
          expect(inferLevelFromTitle(title, ascaLevels)).toBe(
            inferLevelFromTitle(title, ASCA_FLAT_LEVELS)
          );
        }
        expect(inferLevelFromTitle(titles[0], ascaLevels)).toBe('Open');
        expect(inferLevelFromTitle(titles[1], ascaLevels)).toBe('Excellent');
      });
    });

    it('matches whole words only', () => {
      // 'Open' must not match inside 'Opening'; a partial hit would key legs at a level no
      // class uses, which reads as "0 legs" rather than as an error.
      const title = makeTitle({
        abbreviation: 'X',
        full_name: 'Scent Detection Opening Containers',
        required_elements: ['Container'],
      });
      expect(inferLevelFromTitle(title, ['Novice', 'Open', 'Advanced'])).toBe(null);
    });
  });
});
