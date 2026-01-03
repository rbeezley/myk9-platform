/**
 * Real Audit Trail Integration Test
 * 
 * This test verifies that the audit trail system actually works by:
 * 1. Creating database records
 * 2. Verifying audit entries are created in audit_entry table
 * 3. Testing that triggers fire correctly
 * 4. Validating audit data integrity
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

describe('Real Audit Trail System Integration', () => {
  let testClubId: string;
  let testPersonId: string;
  let testDogId: string;
  const auditEntriesCreated: string[] = [];

  beforeAll(async () => {
    console.log('🔍 Setting up audit trail test data...');
    
    // Clear any existing audit entries from previous tests
    await supabase.from('audit_entry').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  });

  afterAll(async () => {
    console.log('📋 Test data preserved for inspection...');
    console.log('🔍 You can examine the following test data:');
    if (testClubId) console.log(`   - Club ID: ${testClubId}`);
    if (testPersonId) console.log(`   - Person ID: ${testPersonId}`);  
    if (testDogId) console.log(`   - Dog ID: ${testDogId}`);
    console.log(`   - Audit entries created: ${auditEntriesCreated.length}`);
    console.log('   - Check your Supabase dashboard to see the audit trail!');
    
    // COMMENTED OUT: Clean up test records so you can examine them
    // if (testDogId) {
    //   await supabase.from('dog').delete().eq('id', testDogId);
    // }
    // if (testPersonId) {
    //   await supabase.from('user').delete().eq('id', testPersonId);
    // }
    // if (testClubId) {
    //   await supabase.from('club').delete().eq('id', testClubId);
    // }
    // 
    // // Clean up audit entries
    // for (const auditId of auditEntriesCreated) {
    //   await supabase.from('audit_entry').delete().eq('id', auditId);
    // }
  });

  it('should create audit entries when inserting records', async () => {
    console.log('📝 Testing INSERT audit trail...');
    
    // Get initial audit count
    const { count: initialCount } = await supabase
      .from('audit_entry')
      .select('*', { count: 'exact', head: true });
    
    console.log(`Initial audit entries: ${initialCount}`);
    
    // Create a club (should trigger audit)
    const clubData = {
      name: 'Audit Test Club',
      email: 'audit-test@example.com',
      phone: '555-AUDIT',
      address: 'Audit St, Test City, TS 12345'
    };

    const { data: club, error: clubError } = await supabase
      .from('club')
      .insert(clubData)
      .select()
      .single();

    expect(clubError).toBeNull();
    expect(club).toBeDefined();
    testClubId = club.id;
    console.log(`✅ Created club: ${testClubId}`);

    // Wait a moment for trigger to fire
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if audit entry was created
    const { data: auditEntries, count: newCount } = await supabase
      .from('audit_entry')
      .select('*', { count: 'exact' })
      .eq('entity_type', 'club')
      .eq('entity_id', testClubId);

    console.log(`New audit entries: ${newCount}, found club audits: ${auditEntries?.length}`);
    
    expect(newCount).toBeGreaterThan(initialCount || 0);
    expect(auditEntries).toBeDefined();
    expect(auditEntries!.length).toBeGreaterThan(0);
    
    const clubAudit = auditEntries![0];
    expect(clubAudit.action).toBe('INSERT');
    expect(clubAudit.entity_type).toBe('club');
    expect(clubAudit.entity_id).toBe(testClubId);
    expect(clubAudit.new_values).toBeDefined();
    expect(clubAudit.new_values.name).toBe('Audit Test Club');
    
    auditEntriesCreated.push(clubAudit.id);
    console.log(`✅ Audit entry created for club INSERT: ${clubAudit.id}`);
  });

  it('should create audit entries when updating records', async () => {
    console.log('✏️ Testing UPDATE audit trail...');
    
    // Update the club
    const updateData = {
      name: 'Audit Test Club UPDATED',
      phone: '555-UPDATED'
    };

    const { error: updateError } = await supabase
      .from('club')
      .update(updateData)
      .eq('id', testClubId);

    expect(updateError).toBeNull();
    console.log(`✅ Updated club: ${testClubId}`);

    // Wait for trigger to fire
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check for UPDATE audit entry
    const { data: updateAudits } = await supabase
      .from('audit_entry')
      .select('*')
      .eq('entity_type', 'club')
      .eq('entity_id', testClubId)
      .eq('action', 'UPDATE')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(updateAudits).toBeDefined();
    expect(updateAudits!.length).toBeGreaterThan(0);
    
    const updateAudit = updateAudits![0];
    expect(updateAudit.action).toBe('UPDATE');
    expect(updateAudit.old_values).toBeDefined();
    expect(updateAudit.new_values).toBeDefined();
    expect(updateAudit.old_values.name).toBe('Audit Test Club');
    expect(updateAudit.new_values.name).toBe('Audit Test Club UPDATED');
    
    auditEntriesCreated.push(updateAudit.id);
    console.log(`✅ Audit entry created for club UPDATE: ${updateAudit.id}`);
  });

  it('should create audit entries for related table operations', async () => {
    console.log('👤 Testing audit trail for related tables...');
    
    // Create a person
    const personData = {
      first_name: 'Audit',
      last_name: 'TestPerson',
      email: 'audit-person@example.com',
      phone: '555-PERSON',
      street_address: 'Person St',
      city: 'Test City',
      state: 'TS',
      zip_code: '12345'
    };

    const { data: person, error: personError } = await supabase
      .from('user')
      .insert(personData)
      .select()
      .single();

    expect(personError).toBeNull();
    testPersonId = person.id;
    console.log(`✅ Created person: ${testPersonId}`);

    // Create a dog
    const dogData = {
      name: 'Audit Test Dog',
      call_name: 'Auditor',
      breed: 'Audit Hound',
      sex: 'female',
      date_of_birth: '2020-01-01',
      color: 'Audit Color',
      owner_id: testPersonId
    };

    const { data: dog, error: dogError } = await supabase
      .from('dog')
      .insert(dogData)
      .select()
      .single();

    expect(dogError).toBeNull();
    testDogId = dog.id;
    console.log(`✅ Created dog: ${testDogId}`);

    // Wait for triggers to fire
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check audit entries for person and dog
    const { data: personAudits } = await supabase
      .from('audit_entry')
      .select('*')
      .eq('entity_type', 'user')
      .eq('entity_id', testPersonId)
      .eq('action', 'INSERT');

    const { data: dogAudits } = await supabase
      .from('audit_entry')
      .select('*')
      .eq('entity_type', 'dog')
      .eq('entity_id', testDogId)
      .eq('action', 'INSERT');

    expect(personAudits).toBeDefined();
    expect(personAudits!.length).toBeGreaterThan(0);
    expect(dogAudits).toBeDefined();
    expect(dogAudits!.length).toBeGreaterThan(0);

    // Verify audit data
    const personAudit = personAudits![0];
    const dogAudit = dogAudits![0];

    expect(personAudit.new_values.first_name).toBe('Audit');
    expect(dogAudit.new_values.name).toBe('Audit Test Dog');
    expect(dogAudit.new_values.owner_id).toBe(testPersonId);

    auditEntriesCreated.push(personAudit.id);
    auditEntriesCreated.push(dogAudit.id);
    
    console.log(`✅ Audit entries created for person and dog: ${personAudit.id}, ${dogAudit.id}`);
  });

  it('should create audit entries when deleting records', async () => {
    console.log('🗑️ Testing DELETE audit trail...');
    
    // Delete the dog (should create audit entry)
    const { error: deleteError } = await supabase
      .from('dog')
      .delete()
      .eq('id', testDogId);

    expect(deleteError).toBeNull();
    console.log(`✅ Deleted dog: ${testDogId}`);

    // Wait for trigger to fire
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check for DELETE audit entry
    const { data: deleteAudits } = await supabase
      .from('audit_entry')
      .select('*')
      .eq('entity_type', 'dog')
      .eq('entity_id', testDogId)
      .eq('action', 'DELETE')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(deleteAudits).toBeDefined();
    expect(deleteAudits!.length).toBeGreaterThan(0);
    
    const deleteAudit = deleteAudits![0];
    expect(deleteAudit.action).toBe('DELETE');
    expect(deleteAudit.old_values).toBeDefined();
    expect(deleteAudit.new_values).toBeNull();
    expect(deleteAudit.old_values.name).toBe('Audit Test Dog');
    
    auditEntriesCreated.push(deleteAudit.id);
    testDogId = ''; // Clear since it's deleted
    
    console.log(`✅ Audit entry created for dog DELETE: ${deleteAudit.id}`);
  });

  it('should validate audit trail data integrity', async () => {
    console.log('🔍 Testing audit trail data integrity...');
    
    // Get all audit entries created during this test
    const { data: testAudits } = await supabase
      .from('audit_entry')
      .select('*')
      .in('id', auditEntriesCreated)
      .order('created_at', { ascending: true });

    expect(testAudits).toBeDefined();
    expect(testAudits!.length).toBe(auditEntriesCreated.length);

    for (const audit of testAudits!) {
      // Validate required fields
      expect(audit.id).toBeDefined();
      expect(['INSERT', 'UPDATE', 'DELETE']).toContain(audit.action);
      expect(audit.entity_type).toBeDefined();
      expect(audit.entity_id).toBeDefined();
      expect(audit.created_at).toBeDefined();

      // Validate data consistency based on action
      if (audit.action === 'INSERT') {
        expect(audit.new_values).toBeDefined();
        expect(audit.old_values).toBeNull();
      } else if (audit.action === 'UPDATE') {
        expect(audit.new_values).toBeDefined();
        expect(audit.old_values).toBeDefined();
      } else if (audit.action === 'DELETE') {
        expect(audit.old_values).toBeDefined();
        expect(audit.new_values).toBeNull();
      }

      console.log(`✅ Audit entry ${audit.id}: ${audit.action} on ${audit.entity_type}`);
    }

    console.log(`🎉 All ${testAudits!.length} audit entries passed integrity validation!`);
  });

  it('should demonstrate complete audit trail functionality', async () => {
    console.log('🎯 Testing complete audit trail workflow...');
    
    // Get final audit count
    const { count: finalCount } = await supabase
      .from('audit_entry')
      .select('*', { count: 'exact', head: true });

    console.log(`Final audit entry count: ${finalCount}`);
    console.log(`Audit entries created in this test: ${auditEntriesCreated.length}`);

    // Verify we have audit entries for all operations
    const operationCounts = {
      INSERT: 0,
      UPDATE: 0,
      DELETE: 0
    };

    const { data: allTestAudits } = await supabase
      .from('audit_entry')
      .select('action')
      .in('id', auditEntriesCreated);

    for (const audit of allTestAudits || []) {
      operationCounts[audit.action as keyof typeof operationCounts]++;
    }

    expect(operationCounts.INSERT).toBeGreaterThan(0);
    expect(operationCounts.UPDATE).toBeGreaterThan(0);
    expect(operationCounts.DELETE).toBeGreaterThan(0);

    console.log('🎉 Complete audit trail functionality verified!');
    console.log(`   - INSERT operations: ${operationCounts.INSERT}`);
    console.log(`   - UPDATE operations: ${operationCounts.UPDATE}`);
    console.log(`   - DELETE operations: ${operationCounts.DELETE}`);
    console.log(`   - Total audit entries: ${auditEntriesCreated.length}`);
  });
});