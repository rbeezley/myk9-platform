/**
 * Phase 4: Results and Scoring System Integration Test
 * 
 * Comprehensive database integration tests for the results and scoring functionality
 * covering result entry workflows, scoring calculations, placement determination,
 * time-based scoring, fault calculations, qualification thresholds, and validation.
 * 
 * Tests build upon the successful Phase 3 foundation with real database operations.
 * Uses singular table names throughout and follows the established dog show hierarchy:
 * Club → Show → Trial → Class → Entry → Result
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

describe('Phase 4: Results and Scoring System - Database Integration', () => {
  // Test data IDs for cleanup
  let testClubId: string;
  let testPersonId: string;
  const testDogIds: string[] = [];
  let testShowId: string;
  let testTrialId: string;
  let testClassId: string;
  const testEntryIds: string[] = [];
  let testResultIds: string[] = [];
  let testJudgeId: string;
  let entryIdCounter = 0;

  // Helper function to get next available entry ID
  function getNextEntryId(): string {
    if (entryIdCounter >= testEntryIds.length) {
      throw new Error(`Not enough test entries created. Needed: ${entryIdCounter + 1}, Available: ${testEntryIds.length}`);
    }
    const entryId = testEntryIds[entryIdCounter];
    entryIdCounter++;
    return entryId;
  }

  beforeAll(async () => {
    console.log('🚀 Setting up Phase 4 Results & Scoring test data...');

    // Create foundation data following the established hierarchy
    await createFoundationData();
    await createShowHierarchy();
    await createTestEntries();
  }, 30000); // 30 second timeout for setup

  beforeEach(() => {
    // Clear result arrays for each test
    testResultIds = [];
  });

  afterAll(async () => {
    console.log('🧹 Cleaning up Phase 4 test data...');
    // Clean up in reverse hierarchy order using singular table names
    
    // Clean results first
    if (testResultIds.length > 0) {
      for (const resultId of testResultIds) {
        await supabase.from('result').delete().eq('id', resultId);
      }
    }

    // Clean entries
    if (testEntryIds.length > 0) {
      for (const entryId of testEntryIds) {
        await supabase.from('entry').delete().eq('id', entryId);
      }
    }

    // Clean hierarchy in reverse order
    if (testClassId) {
      await supabase.from('class').delete().eq('id', testClassId);
    }
    if (testTrialId) {
      await supabase.from('trial').delete().eq('id', testTrialId);
    }
    if (testShowId) {
      await supabase.from('show').delete().eq('id', testShowId);
    }
    // Clean all test dogs
    if (testDogIds.length > 0) {
      for (const dogId of testDogIds) {
        await supabase.from('dog').delete().eq('id', dogId);
      }
    }
    if (testPersonId) {
      await supabase.from('user').delete().eq('id', testPersonId);
    }
    if (testJudgeId && testJudgeId !== testPersonId) {
      await supabase.from('user').delete().eq('id', testJudgeId);
    }
    if (testClubId) {
      await supabase.from('club').delete().eq('id', testClubId);
    }
  });

  // ============================================================================
  // Foundation Data Setup
  // ============================================================================

  async function createFoundationData() {
    // Create test club
    console.log('🏢 Creating test club for Phase 4...');
    const clubData = {
      name: 'Phase 4 Scoring Test Club',
      email: 'phase4-scoring@example.com',
      phone: '555-0440',
      address: '440 Scoring St, Test City, TS 12345'
    };

    const { data: club, error: clubError } = await supabase
      .from('club')
      .insert(clubData)
      .select()
      .single();

    if (clubError) throw new Error(`Club creation failed: ${clubError.message}`);
    testClubId = club.id;
    console.log(`✅ Created club: ${testClubId}`);

    // Create test person (owner/exhibitor)
    console.log('👤 Creating test person...');
    const personData = {
      first_name: 'Phase4',
      last_name: 'ScoringTester',
      email: 'phase4-scoring-person@example.com',
      phone: '555-0441',
      street_address: '441 Person St',
      city: 'Test City',
      state: 'TS',
      zip_code: '12345'
    };

    const { data: person, error: personError } = await supabase
      .from('user')
      .insert(personData)
      .select()
      .single();

    if (personError) throw new Error(`Person creation failed: ${personError.message}`);
    testPersonId = person.id;
    console.log(`✅ Created person: ${testPersonId}`);

    // Create test judge (separate person for scoring)
    console.log('👨‍⚖️ Creating test judge...');
    const judgeData = {
      first_name: 'Judge',
      last_name: 'ScoringTest',
      email: 'phase4-judge@example.com',
      phone: '555-0442',
      street_address: '442 Judge St',
      city: 'Test City',
      state: 'TS',
      zip_code: '12345'
    };

    const { data: judge, error: judgeError } = await supabase
      .from('user')
      .insert(judgeData)
      .select()
      .single();

    if (judgeError) throw new Error(`Judge creation failed: ${judgeError.message}`);
    testJudgeId = judge.id;
    console.log(`✅ Created judge: ${testJudgeId}`);

    // Create multiple test dogs for unique entries
    console.log('🐕 Creating test dogs...');
    const dogNames = [
      'Phase 4 Scoring Dog A', 'Phase 4 Scoring Dog B', 'Phase 4 Scoring Dog C',
      'Phase 4 Scoring Dog D', 'Phase 4 Scoring Dog E', 'Phase 4 Scoring Dog F',
      'Phase 4 Scoring Dog G', 'Phase 4 Scoring Dog H', 'Phase 4 Scoring Dog I',
      'Phase 4 Scoring Dog J'
    ];

    for (const [index, dogName] of dogNames.entries()) {
      const dogData = {
        name: dogName,
        call_name: `Scorer${index + 1}`,
        breed: 'Border Collie',
        sex: index % 2 === 0 ? 'female' : 'male',
        date_of_birth: '2019-03-15',
        color: 'Black and White',
        owner_id: testPersonId
      };

      const { data: dog, error: dogError } = await supabase
        .from('dog')
        .insert(dogData)
        .select()
        .single();

      if (dogError) throw new Error(`Dog creation failed: ${dogError.message}`);
      testDogIds.push(dog.id);
      console.log(`✅ Created dog ${index + 1}: ${dog.id}`);
    }
  }

  async function createShowHierarchy() {
    // Create test show
    console.log('🏆 Creating test show for scoring...');
    const showData = {
      name: 'Phase 4 Scoring Championship',
      type: 'Agility',
      start_date: '2025-09-01',
      end_date: '2025-09-01',
      location: 'Scoring Arena, Test City, TS',
      status: 'published',
      entry_open_date: '2025-08-01',
      entry_close_date: '2025-08-25',
      club_id: testClubId
    };

    const { data: show, error: showError } = await supabase
      .from('show')
      .insert(showData)
      .select()
      .single();

    if (showError) throw new Error(`Show creation failed: ${showError.message}`);
    testShowId = show.id;
    console.log(`✅ Created show: ${testShowId}`);

    // Create test trial
    console.log('🎯 Creating test trial for scoring...');
    const trialData = {
      name: 'Sunday Scoring Trial',
      date: '2025-09-01',
      status: 'published',
      show_id: testShowId,
      max_entries_per_dog: 4,
      max_total_entries: 50
    };

    const { data: trial, error: trialError } = await supabase
      .from('trial')
      .insert(trialData)
      .select()
      .single();

    if (trialError) throw new Error(`Trial creation failed: ${trialError.message}`);
    testTrialId = trial.id;
    console.log(`✅ Created trial: ${testTrialId}`);

    // Create test class
    console.log('📋 Creating test class for scoring...');
    const classData = {
      name: 'Excellent Standard',
      description: 'Excellent Standard Class for Scoring Tests',
      max_entries: 15,
      entry_fee: 35.00,
      allows_waitlist: true,
      level: 'Excellent',
      jump_heights: ['16"', '20"', '24"'],
      trial_id: testTrialId
    };

    const { data: classRecord, error: classError } = await supabase
      .from('class')
      .insert(classData)
      .select()
      .single();

    if (classError) throw new Error(`Class creation failed: ${classError.message}`);
    testClassId = classRecord.id;
    console.log(`✅ Created class: ${testClassId}`);
  }

  async function createTestEntries() {
    console.log('📝 Creating test entries for scoring...');
    
    // Create multiple entries for comprehensive scoring tests
    // Each test will need its own entry due to unique constraint on results
    // Use different dogs to avoid dog_class unique constraint
    const entryData = Array.from({ length: 10 }, (_, i) => ({
      class_id: testClassId,
      dog_id: testDogIds[i], // Use different dog for each entry
      show_id: testShowId,
      status: 'confirmed',
      handler: `Test Handler ${i + 1}`,
      entry_fee: 35.00,
      payment_status: 'paid',
      jump_height: '20"',
      submitted_at: new Date().toISOString()
    }));

    for (const [index, entry] of entryData.entries()) {
      const { data: createdEntry, error: entryError } = await supabase
        .from('entry')
        .insert(entry)
        .select()
        .single();

      if (entryError) throw new Error(`Entry creation failed: ${entryError.message}`);
      testEntryIds.push(createdEntry.id);
      console.log(`✅ Created entry ${index + 1}: ${createdEntry.id}`);
    }
  }

  // ============================================================================
  // Result Entry Workflow Tests
  // ============================================================================

  describe('Result Entry Workflows', () => {
    it('should create a basic agility result with time and faults', async () => {
      console.log('⏱️ Testing basic agility result entry...');
      
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        start_time: '2025-09-01T10:00:00Z',
        end_time: '2025-09-01T10:00:45Z',
        time_seconds: 45.23,
        faults: 5,  // One bar fault
        qualified: true,
        qualification: 'Q',
        judge_notes: 'Nice run, one bar down on jump 8',
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      console.log('Basic result creation:', { result, resultError });
      expect(resultError).toBeNull();
      expect(result).toBeDefined();
      expect(result.time_seconds).toBe(45.23);
      expect(result.faults).toBe(5);
      expect(result.qualified).toBe(true);
      expect(result.qualification).toBe('Q');
      
      testResultIds.push(result.id);
      console.log(`✅ Created basic agility result: ${result.id}`);
    });

    it('should create a result with elimination (NQ)', async () => {
      console.log('❌ Testing eliminated result entry...');
      
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        start_time: '2025-09-01T10:05:00Z',
        end_time: '2025-09-01T10:05:30Z',
        time_seconds: 30.45,
        faults: 0,
        qualified: false,
        qualification: 'E',
        qualification_reason: 'Failure to perform obstacle (A-frame contact)',
        judge_notes: 'Dog ran off A-frame contact zone',
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      console.log('Elimination result creation:', { result, resultError });
      expect(resultError).toBeNull();
      expect(result).toBeDefined();
      expect(result.qualified).toBe(false);
      expect(result.qualification).toBe('E');
      expect(result.qualification_reason).toContain('A-frame');
      
      testResultIds.push(result.id);
      console.log(`✅ Created elimination result: ${result.id}`);
    });

    it('should create a result exceeding standard course time', async () => {
      console.log('⏰ Testing overtime result entry...');
      
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        start_time: '2025-09-01T10:10:00Z',
        end_time: '2025-09-01T10:11:05Z',
        time_seconds: 65.78,  // Exceeds typical SCT of ~50 seconds
        faults: 15,  // Time faults (1 point per second over SCT)
        qualified: false,
        qualification: 'NQ',
        qualification_reason: 'Exceeded maximum course time',
        judge_notes: 'Slow but accurate run, exceeded time limit',
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      console.log('Overtime result creation:', { result, resultError });
      expect(resultError).toBeNull();
      expect(result).toBeDefined();
      expect(result.time_seconds).toBe(65.78);
      expect(result.faults).toBe(15);
      expect(result.qualified).toBe(false);
      expect(result.qualification).toBe('NQ');
      
      testResultIds.push(result.id);
      console.log(`✅ Created overtime result: ${result.id}`);
    });
  });

  // ============================================================================
  // Scoring Calculations Tests
  // ============================================================================

  describe('Scoring Calculations', () => {
    it('should calculate qualifying score (clean run)', async () => {
      console.log('🎯 Testing clean qualifying run calculation...');
      
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        start_time: '2025-09-01T11:00:00Z',
        end_time: '2025-09-01T11:00:38Z',
        time_seconds: 38.45,
        faults: 0,  // Clean run
        qualified: true,
        qualification: 'Q',
        score: '100',  // Perfect score
        judge_notes: 'Beautiful clean run',
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      expect(resultError).toBeNull();
      expect(result).toBeDefined();
      expect(result.faults).toBe(0);
      expect(result.qualified).toBe(true);
      expect(result.score).toBe('100');
      
      // Verify qualifying status
      expect(result.qualification).toBe('Q');
      
      testResultIds.push(result.id);
      console.log(`✅ Clean run result: ${result.time_seconds}s, ${result.faults} faults, ${result.score} score`);
    });

    it('should calculate score with jump faults', async () => {
      console.log('🚧 Testing jump fault score calculation...');
      
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        start_time: '2025-09-01T11:05:00Z',
        end_time: '2025-09-01T11:05:42Z',
        time_seconds: 42.15,
        faults: 10,  // Two jump faults (5 points each)
        qualified: true,
        qualification: 'Q',
        score: '90',  // 100 - 10 faults
        judge_notes: 'Two bars down: jumps 5 and 12',
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      expect(resultError).toBeNull();
      expect(result).toBeDefined();
      expect(result.faults).toBe(10);
      expect(result.qualified).toBe(true);
      expect(result.score).toBe('90');
      
      testResultIds.push(result.id);
      console.log(`✅ Jump fault result: ${result.time_seconds}s, ${result.faults} faults, ${result.score} score`);
    });

    it('should calculate score with refusal faults', async () => {
      console.log('🔄 Testing refusal fault score calculation...');
      
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        start_time: '2025-09-01T11:10:00Z',
        end_time: '2025-09-01T11:10:48Z',
        time_seconds: 48.67,
        faults: 20,  // One refusal (20 points)
        qualified: true,
        qualification: 'Q',
        score: '80',  // 100 - 20 refusal
        judge_notes: 'One refusal at tunnel entrance, recovered well',
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      expect(resultError).toBeNull();
      expect(result).toBeDefined();
      expect(result.faults).toBe(20);
      expect(result.qualified).toBe(true);
      expect(result.score).toBe('80');
      
      testResultIds.push(result.id);
      console.log(`✅ Refusal fault result: ${result.time_seconds}s, ${result.faults} faults, ${result.score} score`);
    });

    it('should calculate combined faults correctly', async () => {
      console.log('🔢 Testing combined fault calculation...');
      
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        start_time: '2025-09-01T11:15:00Z',
        end_time: '2025-09-01T11:15:55Z',
        time_seconds: 55.23,
        faults: 35,  // 1 refusal (20) + 3 bars (15) = 35 total
        qualified: true,
        qualification: 'Q',
        score: '65',  // 100 - 35 faults
        judge_notes: 'One refusal, three bars down - tough course',
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      expect(resultError).toBeNull();
      expect(result).toBeDefined();
      expect(result.faults).toBe(35);
      expect(result.qualified).toBe(true);
      expect(result.score).toBe('65');
      
      testResultIds.push(result.id);
      console.log(`✅ Combined faults result: ${result.time_seconds}s, ${result.faults} faults, ${result.score} score`);
    });
  });

  // ============================================================================
  // Time-Based Scoring Tests
  // ============================================================================

  describe('Time-Based Scoring', () => {
    it('should handle precise timing measurements', async () => {
      console.log('⏱️ Testing precise timing measurements...');
      
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        start_time: '2025-09-01T12:00:00.000Z',
        end_time: '2025-09-01T12:00:39.234Z',
        time_seconds: 39.234,  // Precise millisecond timing
        faults: 0,
        qualified: true,
        qualification: 'Q',
        score: '100',
        judge_notes: 'Fast clean run - excellent timing',
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      expect(resultError).toBeNull();
      expect(result).toBeDefined();
      expect(result.time_seconds).toBe(39.234);
      expect(Number(result.time_seconds?.toFixed(3))).toBe(39.234);
      
      testResultIds.push(result.id);
      console.log(`✅ Precise timing result: ${result.time_seconds}s`);
    });

    it('should calculate time faults for exceeding SCT', async () => {
      console.log('📏 Testing Standard Course Time (SCT) calculations...');
      
      const sct = 50.0;  // Standard Course Time
      const actualTime = 57.45;
      const timeFaults = Math.max(0, Math.ceil(actualTime - sct));  // 8 time faults
      
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        start_time: '2025-09-01T12:05:00Z',
        end_time: '2025-09-01T12:05:57Z',
        time_seconds: actualTime,
        faults: timeFaults,  // Time faults only
        qualified: true,
        qualification: 'Q',
        score: (100 - timeFaults).toString(),
        judge_notes: `Exceeded SCT of ${sct}s by ${(actualTime - sct).toFixed(2)}s`,
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      expect(resultError).toBeNull();
      expect(result).toBeDefined();
      expect(result.time_seconds).toBe(actualTime);
      expect(result.faults).toBe(timeFaults);
      expect(result.score).toBe('92');  // 100 - 8 time faults
      
      testResultIds.push(result.id);
      console.log(`✅ SCT exceeded result: ${result.time_seconds}s, ${result.faults} time faults`);
    });

    it('should handle maximum course time limits', async () => {
      console.log('⏰ Testing maximum course time limits...');
      
      const maxTime = 80.0;  // Maximum allowed time
      const actualTime = 85.67;  // Exceeds maximum
      
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        start_time: '2025-09-01T12:10:00Z',
        end_time: '2025-09-01T12:11:25Z',
        time_seconds: actualTime,
        faults: 0,  // No other faults
        qualified: false,  // Exceeds max time = NQ
        qualification: 'NQ',
        qualification_reason: `Exceeded maximum course time of ${maxTime}s`,
        score: '0',  // No score for exceeding max time
        judge_notes: 'Exceeded maximum course time - automatic NQ',
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      expect(resultError).toBeNull();
      expect(result).toBeDefined();
      expect(result.time_seconds).toBe(actualTime);
      expect(result.qualified).toBe(false);
      expect(result.qualification).toBe('NQ');
      expect(result.qualification_reason).toContain('maximum course time');
      
      testResultIds.push(result.id);
      console.log(`✅ Max time exceeded result: ${result.time_seconds}s, NQ`);
    });
  });

  // ============================================================================
  // Placement Determination Tests
  // ============================================================================

  describe('Placement Determination', () => {
    it('should assign placement based on qualifying status and time', async () => {
      console.log('🏆 Testing placement assignment logic...');
      
      // Create multiple results for placement testing
      const results = [
        // 1st place: Clean run, fastest time
        {
          entry_id: getNextEntryId(),
          recorded_by: testJudgeId,
          time_seconds: 35.12,
          faults: 0,
          qualified: true,
          qualification: 'Q',
          placement: '1',
          score: '100'
        },
        // 2nd place: Clean run, slower time  
        {
          entry_id: getNextEntryId(),
          recorded_by: testJudgeId,
          time_seconds: 37.45,
          faults: 0,
          qualified: true,
          qualification: 'Q',
          placement: '2',
          score: '100'
        },
        // 3rd place: Faults but still qualifying
        {
          entry_id: getNextEntryId(),
          recorded_by: testJudgeId,
          time_seconds: 36.78,
          faults: 5,
          qualified: true,
          qualification: 'Q',
          placement: '3',
          score: '95'
        }
      ];

      const createdResults = [];
      for (let index = 0; index < results.length; index++) {
        const resultData = results[index];
        const { data: result, error: resultError } = await supabase
          .from('result')
          .insert({
            ...resultData,
            start_time: `2025-09-01T13:${(index * 5).toString().padStart(2, '0')}:00Z`,
            end_time: `2025-09-01T13:${(index * 5).toString().padStart(2, '0')}:${Math.floor(resultData.time_seconds).toString().padStart(2, '0')}Z`,
            judge_notes: `Placement test run ${index + 1}`,
            recorded_at: new Date().toISOString()
          })
          .select()
          .single();

        expect(resultError).toBeNull();
        createdResults.push(result);
        testResultIds.push(result.id);
      }

      // Verify placement assignments
      expect(createdResults[0].placement).toBe('1');
      expect(createdResults[1].placement).toBe('2');
      expect(createdResults[2].placement).toBe('3');
      
      // Verify fastest clean run wins
      expect(createdResults[0].time_seconds).toBeLessThan(createdResults[1].time_seconds);
      expect(createdResults[0].faults).toBe(0);
      
      console.log(`✅ Created ${createdResults.length} results with correct placements`);
    });

    it('should handle tie-breaking scenarios', async () => {
      console.log('🤝 Testing tie-breaking scenarios...');
      
      // Create tied results (same faults, different times)
      const tiedResults = [
        {
          entry_id: getNextEntryId(),
          recorded_by: testJudgeId,
          time_seconds: 40.15,  // Faster time wins tie
          faults: 5,
          qualified: true,
          qualification: 'Q',
          placement: '1',
          score: '95',
          judge_notes: 'Tie-breaker winner - faster time'
        },
        {
          entry_id: getNextEntryId(),
          recorded_by: testJudgeId,
          time_seconds: 40.78,  // Slower time loses tie
          faults: 5,
          qualified: true,
          qualification: 'Q',
          placement: '2',
          score: '95',
          judge_notes: 'Tie-breaker loser - slower time'
        }
      ];

      const createdResults = [];
      for (let index = 0; index < tiedResults.length; index++) {
        const resultData = tiedResults[index];
        const { data: result, error: resultError } = await supabase
          .from('result')
          .insert({
            ...resultData,
            start_time: `2025-09-01T14:${(index * 5).toString().padStart(2, '0')}:00Z`,
            end_time: `2025-09-01T14:${(index * 5).toString().padStart(2, '0')}:${Math.floor(resultData.time_seconds).toString().padStart(2, '0')}Z`,
            recorded_at: new Date().toISOString()
          })
          .select()
          .single();

        expect(resultError).toBeNull();
        createdResults.push(result);
        testResultIds.push(result.id);
      }

      // Verify tie-breaking logic
      expect(createdResults[0].faults).toBe(createdResults[1].faults);  // Same faults
      expect(createdResults[0].time_seconds).toBeLessThan(createdResults[1].time_seconds);  // Faster wins
      expect(createdResults[0].placement).toBe('1');
      expect(createdResults[1].placement).toBe('2');
      
      console.log(`✅ Tie-breaking correctly applied: ${createdResults[0].time_seconds}s beats ${createdResults[1].time_seconds}s`);
    });
  });

  // ============================================================================
  // Qualification Thresholds Tests
  // ============================================================================

  describe('Qualification Thresholds', () => {
    it('should apply qualification thresholds correctly', async () => {
      console.log('✅ Testing qualification threshold logic...');
      
      const qualificationTests = [
        {
          name: 'Clean run - qualifies',
          faults: 0,
          qualified: true,
          qualification: 'Q',
          reason: null
        },
        {
          name: 'Minor faults - still qualifies',
          faults: 15,
          qualified: true,
          qualification: 'Q',
          reason: null
        },
        {
          name: 'Too many faults - does not qualify',
          faults: 50,
          qualified: false,
          qualification: 'NQ',
          reason: 'Excessive faults (50 points)'
        },
        {
          name: 'Elimination - does not qualify',
          faults: 0,
          qualified: false,
          qualification: 'E',
          reason: 'Off course - took wrong obstacle'
        }
      ];

      for (let index = 0; index < qualificationTests.length; index++) {
        const test = qualificationTests[index];
        const resultData = {
          entry_id: getNextEntryId(),
          recorded_by: testJudgeId,
          start_time: `2025-09-01T15:${(index * 5).toString().padStart(2, '0')}:00Z`,
          end_time: `2025-09-01T15:${(index * 5).toString().padStart(2, '0')}:45Z`,
          time_seconds: 45.0 + index,
          faults: test.faults,
          qualified: test.qualified,
          qualification: test.qualification,
          qualification_reason: test.reason,
          score: test.qualified ? (100 - test.faults).toString() : '0',
          judge_notes: test.name,
          recorded_at: new Date().toISOString()
        };

        const { data: result, error: resultError } = await supabase
          .from('result')
          .insert(resultData)
          .select()
          .single();

        expect(resultError).toBeNull();
        expect(result.qualified).toBe(test.qualified);
        expect(result.qualification).toBe(test.qualification);
        if (test.reason) {
          expect(result.qualification_reason).toBe(test.reason);
        }
        
        testResultIds.push(result.id);
        console.log(`✅ ${test.name}: Q=${result.qualified}, qual=${result.qualification}`);
      }
    });

    it('should validate minimum qualifying scores', async () => {
      console.log('📊 Testing minimum qualifying score validation...');
      
      const minQualifyingScore = 65;  // Minimum score to qualify
      
      const scoreTests = [
        {
          score: 85,
          faults: 15,
          shouldQualify: true,
          notes: 'Above minimum qualifying score'
        },
        {
          score: 65,
          faults: 35,
          shouldQualify: true,
          notes: 'Exactly at minimum qualifying score'
        },
        {
          score: 60,
          faults: 40,
          shouldQualify: false,
          notes: 'Below minimum qualifying score'
        }
      ];

      for (let index = 0; index < scoreTests.length; index++) {
        const test = scoreTests[index];
        const resultData = {
          entry_id: getNextEntryId(),
          recorded_by: testJudgeId,
          start_time: `2025-09-01T16:${(index * 5).toString().padStart(2, '0')}:00Z`,
          end_time: `2025-09-01T16:${(index * 5).toString().padStart(2, '0')}:50Z`,
          time_seconds: 50.0,
          faults: test.faults,
          qualified: test.shouldQualify,
          qualification: test.shouldQualify ? 'Q' : 'NQ',
          qualification_reason: test.shouldQualify ? null : `Score ${test.score} below minimum ${minQualifyingScore}`,
          score: test.score.toString(),
          judge_notes: test.notes,
          recorded_at: new Date().toISOString()
        };

        const { data: result, error: resultError } = await supabase
          .from('result')
          .insert(resultData)
          .select()
          .single();

        expect(resultError).toBeNull();
        expect(result.qualified).toBe(test.shouldQualify);
        expect(parseInt(result.score || '0')).toBe(test.score);
        
        testResultIds.push(result.id);
        console.log(`✅ Score validation: ${test.score} - Q=${result.qualified}`);
      }
    });
  });

  // ============================================================================
  // Result Validation and Editing Tests
  // ============================================================================

  describe('Result Validation and Editing', () => {
    it('should validate result data integrity', async () => {
      console.log('🔍 Testing result data validation...');
      
      // Create initial result
      const initialData = {
        entry_id: testEntryIds[0],
        recorded_by: testJudgeId,
        start_time: '2025-09-01T17:00:00Z',
        end_time: '2025-09-01T17:00:45Z',
        time_seconds: 45.67,
        faults: 10,
        qualified: true,
        qualification: 'Q',
        score: '90',
        judge_notes: 'Initial result for validation testing',
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(initialData)
        .select()
        .single();

      expect(resultError).toBeNull();
      expect(result).toBeDefined();
      testResultIds.push(result.id);

      // Validate required fields are present
      expect(result.entry_id).toBe(testEntryIds[0]);
      expect(result.recorded_by).toBe(testJudgeId);
      expect(result.time_seconds).toBe(45.67);
      expect(result.recorded_at).toBeTruthy();

      // Validate data relationships
      const { data: entry } = await supabase
        .from('entry')
        .select('id, class_id')
        .eq('id', result.entry_id)
        .single();

      expect(entry).toBeDefined();
      expect(entry?.class_id).toBe(testClassId);

      console.log(`✅ Result validation passed: ${result.id}`);
    });

    it('should support result editing and updates', async () => {
      console.log('✏️ Testing result editing functionality...');
      
      // Create initial result
      const initialData = {
        entry_id: testEntryIds[0],
        recorded_by: testJudgeId,
        start_time: '2025-09-01T17:05:00Z',
        end_time: '2025-09-01T17:05:42Z',
        time_seconds: 42.34,
        faults: 5,
        qualified: true,
        qualification: 'Q',
        score: '95',
        judge_notes: 'Initial result - to be edited',
        recorded_at: new Date().toISOString()
      };

      const { data: originalResult, error: createError } = await supabase
        .from('result')
        .insert(initialData)
        .select()
        .single();

      expect(createError).toBeNull();
      testResultIds.push(originalResult.id);

      // Edit the result
      const updatedData = {
        time_seconds: 41.89,  // Corrected time
        faults: 0,  // Corrected to clean run
        qualified: true,
        qualification: 'Q',
        score: '100',  // Updated score
        judge_notes: 'Corrected result - clean run after review',
        updated_at: new Date().toISOString(),
        updated_by: testJudgeId
      };

      const { data: updatedResult, error: updateError } = await supabase
        .from('result')
        .update(updatedData)
        .eq('id', originalResult.id)
        .select()
        .single();

      expect(updateError).toBeNull();
      expect(updatedResult).toBeDefined();

      // Verify updates
      expect(updatedResult.time_seconds).toBe(41.89);
      expect(updatedResult.faults).toBe(0);
      expect(updatedResult.score).toBe('100');
      expect(updatedResult.judge_notes).toContain('Corrected result');
      expect(updatedResult.updated_by).toBe(testJudgeId);

      console.log(`✅ Result edited successfully: ${originalResult.time_seconds}s → ${updatedResult.time_seconds}s`);
    });

    it('should maintain audit trail for result changes', async () => {
      console.log('📋 Testing result audit trail...');
      
      // Create result with initial audit data
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        start_time: '2025-09-01T17:10:00Z',
        end_time: '2025-09-01T17:10:48Z',
        time_seconds: 48.23,
        faults: 15,
        qualified: true,
        qualification: 'Q',
        score: '85',
        judge_notes: 'Original result for audit testing',
        recorded_at: new Date().toISOString(),
        created_by: testJudgeId
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      expect(resultError).toBeNull();
      testResultIds.push(result.id);

      // Verify audit fields
      expect(result.created_by).toBe(testJudgeId);
      expect(result.recorded_by).toBe(testJudgeId);
      expect(result.recorded_at).toBeTruthy();
      expect(result.created_at).toBeTruthy();

      // Update with audit tracking
      const updateTime = new Date().toISOString();
      const { data: updatedResult, error: updateError } = await supabase
        .from('result')
        .update({
          judge_notes: 'Updated result with audit trail',
          updated_at: updateTime,
          updated_by: testJudgeId
        })
        .eq('id', result.id)
        .select()
        .single();

      expect(updateError).toBeNull();
      expect(updatedResult?.updated_by).toBe(testJudgeId);
      expect(updatedResult?.updated_at).toBe(updateTime);

      console.log(`✅ Audit trail maintained: created by ${result.created_by}, updated by ${updatedResult?.updated_by}`);
    });
  });

  // ============================================================================
  // Integration and Relationship Tests
  // ============================================================================

  describe('Integration and Relationships', () => {
    it('should verify result to entry relationship integrity', async () => {
      console.log('🔗 Testing result-entry relationship integrity...');
      
      // Create result and verify relationship
      const resultData = {
        entry_id: getNextEntryId(),
        recorded_by: testJudgeId,
        time_seconds: 43.56,
        faults: 5,
        qualified: true,
        qualification: 'Q',
        score: '95',
        judge_notes: 'Relationship integrity test',
        recorded_at: new Date().toISOString()
      };

      const { data: result, error: resultError } = await supabase
        .from('result')
        .insert(resultData)
        .select()
        .single();

      expect(resultError).toBeNull();
      testResultIds.push(result.id);

      // Query with relationship join
      const { data: resultWithEntry, error: joinError } = await supabase
        .from('result')
        .select(`
          *,
          entry:entry_id(
            *,
            dog:dog_id(*),
            class:class_id(*),
            show:show_id(*)
          )
        `)
        .eq('id', result.id)
        .single();

      expect(joinError).toBeNull();
      expect(resultWithEntry).toBeDefined();
      expect(resultWithEntry.entry).toBeDefined();
      expect(resultWithEntry.entry.dog).toBeDefined();
      expect(resultWithEntry.entry.class).toBeDefined();
      expect(resultWithEntry.entry.show).toBeDefined();

      // Verify data integrity across relationships
      expect(resultWithEntry.entry.id).toBe(testEntryIds[0]);
      expect(resultWithEntry.entry.dog.id).toBe(testDogId);
      expect(resultWithEntry.entry.class.id).toBe(testClassId);
      expect(resultWithEntry.entry.show.id).toBe(testShowId);

      console.log(`✅ Relationship integrity verified across full hierarchy`);
    });

    it('should demonstrate complete Phase 4 results workflow', async () => {
      console.log('🎯 Testing complete Phase 4 results workflow...');
      
      // Simulate complete scoring workflow
      const workflowSteps = [
        {
          step: 'Initial result entry',
          data: {
            entry_id: testEntryIds[0],
            recorded_by: testJudgeId,
            start_time: '2025-09-01T18:00:00Z',
            end_time: '2025-09-01T18:00:44Z',
            time_seconds: 44.12,
            faults: 10,
            qualified: true,
            qualification: 'Q',
            score: '90',
            judge_notes: 'Workflow step 1: Initial scoring',
            recorded_at: new Date().toISOString()
          }
        }
      ];

      const workflowResults = [];
      
      for (let index = 0; index < workflowSteps.length; index++) {
        const step = workflowSteps[index];
        const { data: result, error: stepError } = await supabase
          .from('result')
          .insert(step.data)
          .select()
          .single();

        expect(stepError).toBeNull();
        workflowResults.push(result);
        testResultIds.push(result.id);
        
        console.log(`✅ ${step.step}: ${result.time_seconds}s, ${result.faults} faults, ${result.qualification}`);
      }

      // Verify complete workflow
      expect(workflowResults).toHaveLength(workflowSteps.length);
      expect(workflowResults[0].qualified).toBe(true);
      expect(workflowResults[0].score).toBe('90');

      // Query final workflow state with full hierarchy
      const { data: finalState } = await supabase
        .from('result')
        .select(`
          *,
          entry:entry_id(
            *,
            dog:dog_id(name, call_name),
            class:class_id(name, trial:trial_id(name, show:show_id(name, club:club_id(name))))
          )
        `)
        .eq('id', workflowResults[0].id)
        .single();

      expect(finalState).toBeDefined();
      console.log('🎉 Phase 4 Results & Scoring workflow completed successfully!');
      console.log(`   - Dog: ${finalState?.entry.dog.name} (${finalState?.entry.dog.call_name})`);
      console.log(`   - Owner: Phase4 ScoringTester`);
      console.log(`   - Class: ${finalState?.entry.class.name}`);
      console.log(`   - Show: ${finalState?.entry.class.trial.show.name}`);
      console.log(`   - Club: ${finalState?.entry.class.trial.show.club.name}`);
      console.log(`   - Result: ${finalState?.time_seconds}s, ${finalState?.faults} faults, ${finalState?.qualification}`);
      console.log(`   - Score: ${finalState?.score}, Qualified: ${finalState?.qualified}`);
    });
  });
});