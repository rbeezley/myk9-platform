/**
 * Phase 4: Simple Results Test
 * 
 * A minimal test to validate basic result creation functionality
 * for the Results and Scoring System.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

describe('Phase 4: Simple Results Test', () => {
  let testClubId: string;
  let testPersonId: string;
  let testDogId: string;
  let testShowId: string;
  let testTrialId: string;
  let testClassId: string;
  let testEntryId: string;
  let testJudgeId: string;

  beforeAll(async () => {
    console.log('🚀 Setting up simple Phase 4 test...');

    // Create minimal test data
    const { data: club } = await supabase
      .from('club')
      .insert({
        name: 'Phase 4 Simple Test Club',
        email: 'simple-test@example.com',
        phone: '555-0999',
        address: '999 Simple Test St'
      })
      .select()
      .single();

    testClubId = club!.id;

    const { data: person } = await supabase
      .from('user')
      .insert({
        first_name: 'Simple',
        last_name: 'Tester',
        email: 'simple-tester@example.com',
        phone: '555-0998',
        street_address: '998 Test St',
        city: 'Test City',
        state: 'TS',
        zip_code: '12345'
      })
      .select()
      .single();

    testPersonId = person!.id;
    testJudgeId = person!.id; // Use same person as judge for simplicity

    const { data: dog } = await supabase
      .from('dog')
      .insert({
        name: 'Simple Test Dog',
        call_name: 'Simple',
        breed: 'Test Breed',
        sex: 'female',
        date_of_birth: '2020-01-01',
        color: 'Brown',
        owner_id: testPersonId
      })
      .select()
      .single();

    testDogId = dog!.id;

    const { data: show } = await supabase
      .from('show')
      .insert({
        name: 'Simple Test Show',
        type: 'Agility',
        start_date: '2025-10-01',
        end_date: '2025-10-01',
        location: 'Test Location',
        status: 'published',
        entry_open_date: '2025-09-01',
        entry_close_date: '2025-09-25',
        club_id: testClubId
      })
      .select()
      .single();

    testShowId = show!.id;

    const { data: trial } = await supabase
      .from('trial')
      .insert({
        name: 'Simple Test Trial',
        date: '2025-10-01',
        status: 'published',
        show_id: testShowId,
        max_entries_per_dog: 1,
        max_total_entries: 10
      })
      .select()
      .single();

    testTrialId = trial!.id;

    const { data: classRecord } = await supabase
      .from('class')
      .insert({
        name: 'Simple Test Class',
        description: 'Simple Test Class',
        max_entries: 5,
        entry_fee: 25.00,
        allows_waitlist: false,
        level: 'Novice',
        jump_heights: ['16"'],
        trial_id: testTrialId
      })
      .select()
      .single();

    testClassId = classRecord!.id;

    // Create the main entry record
    const { data: entry, error: entryError } = await supabase
      .from('entry')
      .insert({
        dog_id: testDogId,
        show_id: testShowId,
        entry_status: 'submitted',
        handler: 'Simple Handler',
        payment_status: 'paid',
        total_fees: 25.00,
        submitted_at: new Date().toISOString()
      })
      .select()
      .single();

    if (entryError) {
      console.error('❌ Entry creation failed:', entryError);
      throw entryError;
    }

    if (!entry) {
      console.error('❌ Entry creation returned null');
      throw new Error('Entry creation failed - returned null');
    }

    testEntryId = entry.id;
    console.log(`✅ Created entry: ${testEntryId}`);

    // Create the class entry record
    const { data: classEntry, error: classEntryError } = await supabase
      .from('class_entry')
      .insert({
        entry_id: testEntryId,
        class_id: testClassId,
        trial_id: testTrialId,
        jump_height: '16"',
        entry_fee: 25.00,
        status: 'accepted'
      })
      .select()
      .single();

    if (classEntryError) {
      console.error('❌ Class entry creation failed:', classEntryError);
      throw classEntryError;
    }

    if (!classEntry) {
      console.error('❌ Class entry creation returned null');
      throw new Error('Class entry creation failed - returned null');
    }

    console.log(`✅ Created class entry: ${classEntry.id}`);
    console.log('✅ Simple test setup complete');
  }, 15000);

  afterAll(async () => {
    console.log('📊 SKIPPING cleanup - data preserved for Supabase review...');
    console.log('🔍 Review the following simple test data in Supabase:');
    console.log(`   - Club: ${testClubId} (Phase 4 Simple Test Club)`);
    console.log(`   - Person: ${testPersonId} (Simple Tester)`);
    console.log(`   - Dog: ${testDogId} (Simple Test Dog)`);
    console.log(`   - Show: ${testShowId} (Phase 4 Simple Championship)`);
    console.log(`   - Trial: ${testTrialId} (Simple Test Trial)`);
    console.log(`   - Class: ${testClassId} (Simple Test Class)`);
    console.log(`   - Entry: ${testEntryId} (main entry record)`);
    console.log(`   - Class Entry: Check class_entry table for entry_id = ${testEntryId}`);
    console.log('');
    console.log('⚠️  Remember to manually clean up this test data when done reviewing!');
    
    // CLEANUP DISABLED FOR REVIEW
    /*
    // Clean up in reverse order
    if (testEntryId) {
      await supabase.from('entry').delete().eq('id', testEntryId);
    }
    if (testClassId) {
      await supabase.from('class').delete().eq('id', testClassId);
    }
    if (testTrialId) {
      await supabase.from('trial').delete().eq('id', testTrialId);
    }
    if (testShowId) {
      await supabase.from('show').delete().eq('id', testShowId);
    }
    if (testDogId) {
      await supabase.from('dog').delete().eq('id', testDogId);
    }
    if (testPersonId) {
      await supabase.from('user').delete().eq('id', testPersonId);
    }
    if (testClubId) {
      await supabase.from('club').delete().eq('id', testClubId);
    }
    */
  });

  it('should create a basic result successfully', async () => {
    console.log('⏱️ Testing basic result creation...');
    
    const resultData = {
      entry_id: testEntryId,
      recorded_by: testJudgeId,
      start_time: '2025-10-01T10:00:00Z',
      end_time: '2025-10-01T10:00:45Z',
      time_seconds: 45.23,
      faults: 0,
      qualified: true,
      qualification: 'Q',
      score: '100',
      judge_notes: 'Clean run - excellent work',
      recorded_at: new Date().toISOString()
    };

    const { data: result, error: resultError } = await supabase
      .from('result')
      .insert(resultData)
      .select()
      .single();

    console.log('Result creation result:', { result, resultError });
    
    expect(resultError).toBeNull();
    expect(result).toBeDefined();
    expect(result.time_seconds).toBe(45.23);
    expect(result.faults).toBe(0);
    expect(result.qualified).toBe(true);
    expect(result.qualification).toBe('Q');
    expect(result.score).toBe('100');
    
    // CLEANUP DISABLED - result preserved for review
    console.log('📊 Basic result preserved for Supabase review');
    /*
    // Clean up the result
    if (result) {
      await supabase.from('result').delete().eq('id', result.id);
    }
    */
    
    console.log('✅ Basic result creation test passed');
  });

  it('should create a result with faults', async () => {
    console.log('🚧 Testing result with faults...');
    
    const resultData = {
      entry_id: testEntryId,
      recorded_by: testJudgeId,
      start_time: '2025-10-01T10:05:00Z',
      end_time: '2025-10-01T10:05:50Z',
      time_seconds: 50.15,
      faults: 10, // Two jump faults
      qualified: true,
      qualification: 'Q',
      score: '90',
      judge_notes: 'Two bars down but still qualifying',
      recorded_at: new Date().toISOString()
    };

    const { data: result, error: resultError } = await supabase
      .from('result')
      .insert(resultData)
      .select()
      .single();

    expect(resultError).toBeNull();
    expect(result).toBeDefined();
    expect(result.time_seconds).toBe(50.15);
    expect(result.faults).toBe(10);
    expect(result.qualified).toBe(true);
    expect(result.score).toBe('90');
    
    // CLEANUP DISABLED - result preserved for review
    console.log('📊 Faults result preserved for Supabase review');
    /*
    // Clean up the result
    if (result) {
      await supabase.from('result').delete().eq('id', result.id);
    }
    */
    
    console.log('✅ Result with faults test passed');
  });

  it('should create an elimination result', async () => {
    console.log('❌ Testing elimination result...');
    
    const resultData = {
      entry_id: testEntryId,
      recorded_by: testJudgeId,
      start_time: '2025-10-01T10:10:00Z',
      end_time: '2025-10-01T10:10:30Z',
      time_seconds: 30.0,
      faults: 0,
      qualified: false,
      qualification: 'E',
      qualification_reason: 'Off course - wrong obstacle sequence',
      score: '0',
      judge_notes: 'Eliminated for off course',
      recorded_at: new Date().toISOString()
    };

    const { data: result, error: resultError } = await supabase
      .from('result')
      .insert(resultData)
      .select()
      .single();

    expect(resultError).toBeNull();
    expect(result).toBeDefined();
    expect(result.qualified).toBe(false);
    expect(result.qualification).toBe('E');
    expect(result.qualification_reason).toContain('Off course');
    
    // CLEANUP DISABLED - result preserved for review
    console.log('📊 Elimination result preserved for Supabase review');
    /*
    // Clean up the result
    if (result) {
      await supabase.from('result').delete().eq('id', result.id);
    }
    */
    
    console.log('✅ Elimination result test passed');
  });

  it('should verify result relationships', async () => {
    console.log('🔗 Testing result relationships...');
    
    const resultData = {
      entry_id: testEntryId,
      recorded_by: testJudgeId,
      time_seconds: 42.5,
      faults: 5,
      qualified: true,
      qualification: 'Q',
      score: '95',
      judge_notes: 'Relationship test',
      recorded_at: new Date().toISOString()
    };

    const { data: result, error: resultError } = await supabase
      .from('result')
      .insert(resultData)
      .select()
      .single();

    expect(resultError).toBeNull();

    // Test relationships
    const { data: resultWithEntry, error: joinError } = await supabase
      .from('result')
      .select(`
        *,
        entry:entry_id(
          id,
          dog:dog_id(name, call_name),
          class:class_id(name)
        )
      `)
      .eq('id', result!.id)
      .single();

    expect(joinError).toBeNull();
    expect(resultWithEntry?.entry).toBeDefined();
    expect(resultWithEntry?.entry.dog).toBeDefined();
    expect(resultWithEntry?.entry.class).toBeDefined();
    
    // CLEANUP DISABLED - result preserved for review
    console.log('📊 Relationship result preserved for Supabase review');
    /*
    // Clean up the result
    if (result) {
      await supabase.from('result').delete().eq('id', result.id);
    }
    */
    
    console.log('✅ Result relationships test passed');
  });
});