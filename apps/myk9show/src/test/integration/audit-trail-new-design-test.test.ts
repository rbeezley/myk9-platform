/**
 * Audit Trail Test for New Database Design
 * 
 * This test verifies that the audit trail system works with our new
 * Entry + ClassEntry table structure following the e-commerce pattern.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

describe('New Database Design Audit Trail System', () => {
  let testClubId: string;
  let testPersonId: string;
  let testDogId: string;
  let testShowId: string;
  let testTrialId: string;
  let testClassId: string;
  let testEntryId: string;
  let testClassEntryId: string;
  const auditEntriesCreated: string[] = [];

  beforeAll(async () => {
    console.log('🏗️ Setting up test data for new database design...');
    
    // Clear audit entries from previous tests
    await supabase.from('audit_entry').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  });

  afterAll(async () => {
    console.log('📋 Test data preserved for inspection...');
    console.log('🔍 You can examine the following test data in your Supabase dashboard:');
    console.log('');
    console.log('📁 Test Records Created:');
    if (testClubId) console.log(`   - Club: ${testClubId} (name: "New Design Test Club")`);
    if (testShowId) console.log(`   - Show: ${testShowId} (name: "New Design Test Show")`);
    if (testTrialId) console.log(`   - Trial: ${testTrialId} (name: "New Design Test Trial")`);
    if (testClassId) console.log(`   - Class: ${testClassId} (name: "New Design Test Class")`);
    if (testPersonId) console.log(`   - Person: ${testPersonId} (name: "New Design TestPerson")`);
    if (testDogId) console.log(`   - Dog: ${testDogId} (name: "New Design Test Dog")`);
    if (testEntryId) console.log(`   - Entry: ${testEntryId} (order-level record)`);
    if (testClassEntryId) console.log(`   - ClassEntry: ${testClassEntryId} (item-level record)`);
    console.log('');
    console.log('📊 Audit Trail:');
    console.log(`   - Audit entries created: ${auditEntriesCreated.length}`);
    console.log('   - Check audit_entry table for complete trail of all changes');
    console.log('');
    console.log('🔗 Relationships Demonstrated:');
    console.log('   - Club → Show → Trial → Class → ClassEntry');
    console.log('   - Entry (order) → ClassEntry (item)');
    console.log('   - Person → Dog → Entry');
  });

  it('should create the complete test data hierarchy', async () => {
    console.log('🏗️ Creating complete test data hierarchy...');
    
    // 1. Create Club
    const { data: club, error: clubError } = await supabase
      .from('club')
      .insert({
        name: 'New Design Test Club',
        email: 'newdesign-test@example.com',
        phone: '555-NEWDESIGN'
      })
      .select()
      .single();

    expect(clubError).toBeNull();
    testClubId = club.id;
    console.log(`✅ Created club: ${testClubId}`);

    // 2. Create Show
    const { data: show, error: showError } = await supabase
      .from('show')
      .insert({
        name: 'New Design Test Show',
        start_date: '2024-08-01',
        end_date: '2024-08-02',
        club_id: testClubId,
        type: 'Agility'
      })
      .select()
      .single();

    expect(showError).toBeNull();
    testShowId = show.id;
    console.log(`✅ Created show: ${testShowId}`);

    // 3. Create Trial
    const { data: trial, error: trialError } = await supabase
      .from('trial')
      .insert({
        name: 'New Design Test Trial',
        date: '2024-08-01',
        show_id: testShowId
      })
      .select()
      .single();

    expect(trialError).toBeNull();
    testTrialId = trial.id;
    console.log(`✅ Created trial: ${testTrialId}`);

    // 4. Create Class
    const { data: classData, error: classError } = await supabase
      .from('class')
      .insert({
        name: 'New Design Test Class',
        division: 'Novice',
        level: 'A',
        trial_id: testTrialId
      })
      .select()
      .single();

    expect(classError).toBeNull();
    testClassId = classData.id;
    console.log(`✅ Created class: ${testClassId}`);

    // 5. Create Person
    const { data: person, error: personError } = await supabase
      .from('user')
      .insert({
        first_name: 'New Design',
        last_name: 'TestPerson',
        email: 'newdesign-person@example.com'
      })
      .select()
      .single();

    expect(personError).toBeNull();
    testPersonId = person.id;
    console.log(`✅ Created person: ${testPersonId}`);

    // 6. Create Dog
    const { data: dog, error: dogError } = await supabase
      .from('dog')
      .insert({
        name: 'New Design Test Dog',
        call_name: 'NewDesigner',
        breed: 'New Design Test Breed',
        sex: 'female',
        date_of_birth: '2020-01-01',
        owner_id: testPersonId
      })
      .select()
      .single();

    expect(dogError).toBeNull();
    testDogId = dog.id;
    console.log(`✅ Created dog: ${testDogId}`);

    console.log('🎉 Complete test hierarchy created successfully!');
  });

  it('should create Entry (order-level) and track audit trail', async () => {
    console.log('📝 Testing Entry creation with audit trail...');
    
    // Get initial audit count
    const { count: initialCount } = await supabase
      .from('audit_entry')
      .select('*', { count: 'exact', head: true });

    console.log(`Initial audit entries: ${initialCount}`);

    // Create Entry (order-level record)
    const { data: entry, error: entryError } = await supabase
      .from('entry')
      .insert({
        dog_id: testDogId,
        handler_id: testPersonId,
        show_id: testShowId,
        entry_status: 'draft',
        payment_status: 'pending',
        special_requests: 'This is a test entry for the new database design',
        move_up_requested: false
      })
      .select()
      .single();

    expect(entryError).toBeNull();
    testEntryId = entry.id;
    console.log(`✅ Created entry (order): ${testEntryId}`);

    // Wait for audit trigger
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check audit trail for entry
    const { data: entryAudits } = await supabase
      .from('audit_entry')
      .select('*')
      .eq('entity_type', 'entry')
      .eq('entity_id', testEntryId)
      .eq('action', 'INSERT');

    expect(entryAudits).toBeDefined();
    expect(entryAudits!.length).toBeGreaterThan(0);

    const entryAudit = entryAudits![0];
    expect(entryAudit.action).toBe('INSERT');
    expect(entryAudit.new_values.entry_status).toBe('draft');
    expect(entryAudit.new_values.payment_status).toBe('pending');
    expect(entryAudit.new_values.total_fees).toBe('0.00');

    auditEntriesCreated.push(entryAudit.id);
    console.log(`✅ Entry audit trail verified: ${entryAudit.id}`);
  });

  it('should create ClassEntry (item-level) and track audit trail', async () => {
    console.log('📝 Testing ClassEntry creation with audit trail...');

    // Create ClassEntry (item-level record) - provide trial_id explicitly
    const { data: classEntry, error: classEntryError } = await supabase
      .from('class_entry')
      .insert({
        entry_id: testEntryId,
        class_id: testClassId,
        trial_id: testTrialId,
        jump_height: '16"',
        entry_fee: 25.00,
        preferred_judge: 'Judge NewDesign',
        status: 'accepted',
        notes: 'Test class entry for new database design'
      })
      .select()
      .single();

    expect(classEntryError).toBeNull();
    testClassEntryId = classEntry.id;
    console.log(`✅ Created class entry (item): ${testClassEntryId}`);

    // Wait for audit trigger
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check audit trail for class entry
    const { data: classEntryAudits } = await supabase
      .from('audit_entry')
      .select('*')
      .eq('entity_type', 'class_entry')
      .eq('entity_id', testClassEntryId)
      .eq('action', 'INSERT');

    expect(classEntryAudits).toBeDefined();
    expect(classEntryAudits!.length).toBeGreaterThan(0);

    const classEntryAudit = classEntryAudits![0];
    expect(classEntryAudit.action).toBe('INSERT');
    expect(classEntryAudit.new_values.status).toBe('accepted');
    expect(classEntryAudit.new_values.entry_fee).toBe('25.00');
    expect(classEntryAudit.new_values.jump_height).toBe('16"');

    auditEntriesCreated.push(classEntryAudit.id);
    console.log(`✅ ClassEntry audit trail verified: ${classEntryAudit.id}`);
  });

  it('should verify automatic total_fees calculation and audit trail', async () => {
    console.log('💰 Testing automatic total_fees calculation...');

    // Check that entry total_fees was automatically updated
    const { data: updatedEntry } = await supabase
      .from('entry')
      .select('total_fees')
      .eq('id', testEntryId)
      .single();

    expect(updatedEntry).toBeDefined();
    expect(Number(updatedEntry!.total_fees)).toBe(25.00);
    console.log(`✅ Entry total_fees automatically calculated: $${updatedEntry!.total_fees}`);

    // Wait for potential audit trigger from total_fees update
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if there's an audit entry for the total_fees update
    const { data: updateAudits } = await supabase
      .from('audit_entry')
      .select('*')
      .eq('entity_type', 'entry')
      .eq('entity_id', testEntryId)
      .eq('action', 'UPDATE')
      .order('created_at', { ascending: false });

    if (updateAudits && updateAudits.length > 0) {
      const updateAudit = updateAudits[0];
      console.log(`✅ Total fees update audit trail: ${updateAudit.id}`);
      auditEntriesCreated.push(updateAudit.id);
    }
  });

  it('should test ClassEntry updates and audit trail', async () => {
    console.log('✏️ Testing ClassEntry updates with audit trail...');

    // Update class entry status (simulating competition state)
    const { error: updateError } = await supabase
      .from('class_entry')
      .update({
        status: 'competing',
        armband: 'A-123',
        run_order: 15,
        notes: 'Updated: Entry ready for competition'
      })
      .eq('id', testClassEntryId);

    expect(updateError).toBeNull();
    console.log(`✅ Updated class entry: ${testClassEntryId}`);

    // Wait for audit trigger
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check audit trail for update
    const { data: updateAudits } = await supabase
      .from('audit_entry')
      .select('*')
      .eq('entity_type', 'class_entry')
      .eq('entity_id', testClassEntryId)
      .eq('action', 'UPDATE')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(updateAudits).toBeDefined();
    expect(updateAudits!.length).toBeGreaterThan(0);

    const updateAudit = updateAudits![0];
    expect(updateAudit.action).toBe('UPDATE');
    expect(updateAudit.old_values.status).toBe('accepted');
    expect(updateAudit.new_values.status).toBe('competing');
    expect(updateAudit.new_values.armband).toBe('A-123');

    auditEntriesCreated.push(updateAudit.id);
    console.log(`✅ ClassEntry update audit trail verified: ${updateAudit.id}`);
  });

  it('should validate complete audit trail integrity', async () => {
    console.log('🔍 Validating complete audit trail integrity...');

    // Get all audit entries created during this test
    const { data: allTestAudits } = await supabase
      .from('audit_entry')
      .select('*')
      .in('id', auditEntriesCreated)
      .order('created_at', { ascending: true });

    expect(allTestAudits).toBeDefined();
    expect(allTestAudits!.length).toBe(auditEntriesCreated.length);

    console.log('📋 Audit Trail Summary:');
    console.log('─'.repeat(60));

    const auditSummary = {
      INSERT: 0,
      UPDATE: 0,
      DELETE: 0,
      tables: new Set<string>()
    };

    for (const audit of allTestAudits!) {
      auditSummary[audit.action as keyof typeof auditSummary]++;
      auditSummary.tables.add(audit.entity_type);

      console.log(`📝 ${audit.action} on ${audit.entity_type} (${audit.entity_id.substring(0, 8)}...)`);
      console.log(`   Created: ${new Date(audit.created_at).toLocaleString()}`);
      
      if (audit.action === 'INSERT' && audit.new_values) {
        const keys = Object.keys(audit.new_values).slice(0, 3);
        console.log(`   New data: ${keys.join(', ')}...`);
      }
      
      if (audit.action === 'UPDATE' && audit.old_values && audit.new_values) {
        const changedFields = [];
        for (const key in audit.new_values) {
          if (audit.old_values[key] !== audit.new_values[key]) {
            changedFields.push(key);
          }
        }
        console.log(`   Changed: ${changedFields.slice(0, 3).join(', ')}`);
      }
      console.log('');
    }

    console.log('📊 Final Statistics:');
    console.log(`   - INSERT operations: ${auditSummary.INSERT}`);
    console.log(`   - UPDATE operations: ${auditSummary.UPDATE}`);
    console.log(`   - DELETE operations: ${auditSummary.DELETE}`);
    console.log(`   - Tables audited: ${Array.from(auditSummary.tables).join(', ')}`);
    console.log(`   - Total audit entries: ${allTestAudits!.length}`);

    // Validate we have operations on both entry and class_entry tables
    expect(auditSummary.tables.has('entry')).toBe(true);
    expect(auditSummary.tables.has('class_entry')).toBe(true);
    expect(auditSummary.INSERT).toBeGreaterThan(0);

    console.log('🎉 New database design audit trail validation complete!');
  });
});