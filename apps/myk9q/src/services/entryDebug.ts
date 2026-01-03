/* eslint-disable no-console */
// Debug utility - console.log is intentional for browser console debugging
import { supabase } from '../lib/supabase';
import { updateEntryCheckinStatus } from './entryService';

/**
 * Entry Service Debug Utilities
 *
 * Debug and testing functions for entry service operations.
 * These functions are exposed to the browser console for debugging.
 */

/** Window with entry debug functions attached */
interface EntryDebugWindow extends Window {
  debugMarkInRing?: typeof debugMarkInRing;
  testSupabaseConnection?: typeof testSupabaseConnection;
  testRealTimeEvents?: typeof testRealTimeEvents;
  testUnfilteredRealTime?: typeof testUnfilteredRealTime;
  debugMonitorEntry?: typeof debugMonitorEntry;
  debugStopwatchIssue?: typeof debugStopwatchIssue;
  debugTestCheckinUpdate?: typeof debugTestCheckinUpdate;
  testSupabaseRealTime?: typeof testSupabaseRealTime;
  unsubscribeUnfiltered?: () => void;
  stopMonitoring?: () => void;
}

/**
 * Test function to manually update in_ring status for debugging subscriptions
 * This function can be called from browser console: window.debugMarkInRing(entryId, true/false)
 */
export async function debugMarkInRing(entryId: number, inRing: boolean = true): Promise<void> {
  console.log(`🧪 Debug: Manually updating entry ${entryId} is_in_ring to:`, inRing);

  try {
    // Direct update to entries table (results table no longer exists)
    const { data, error } = await supabase
      .from('entries')
      .update({ is_in_ring: inRing })
      .eq('id', entryId)
      .select('id, is_in_ring');

    if (error) {
      console.error('🧪 Debug update error:', error);
      throw error;
    }

    console.log('🧪 Debug update successful:', data);
    console.log('🧪 Updated entry details:', {
      entryId: data?.[0]?.id,
      inRing: data?.[0]?.is_in_ring
    });
    console.log('🧪 Now watch for real-time subscription payload in other tabs...');

    return;
  } catch (error) {
    console.error('🧪 Debug function failed:', error);
    throw error;
  }
}

/**
 * Test Supabase connection and real-time setup
 */
export async function testSupabaseConnection(): Promise<void> {
  console.log('🧪 Testing Supabase connection and real-time setup...');

  try {
    // Test 1: Basic connection
    const { data, error: connectionError } = await supabase
      .from('entries')
      .select('count', { count: 'exact', head: true });

    if (connectionError) {
      console.error('❌ Basic connection failed:', connectionError);
      return;
    }

    console.log('✅ Basic connection successful, total entries:', data);

    // Test 2: Real-time setup
    console.log('🧪 Testing real-time subscription setup...');

    const testChannel = supabase
      .channel('connection_test')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'entries' },
        (payload) => {
          console.log('🧪 Test subscription received payload:', payload);
        }
      )
      .subscribe((status) => {
        console.log('🧪 Test subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription test successful!');
          setTimeout(() => {
            console.log('🧪 Cleaning up test subscription...');
            testChannel.unsubscribe();
          }, 2000);
        }
      });

  } catch (error) {
    console.error('❌ Supabase connection test failed:', error);
  }
}

/**
 * Test real-time events by making a harmless database change
 */
export async function testRealTimeEvents(classId: number): Promise<void> {
  console.log('🧪 Testing real-time events for class:', classId);

  try {
    // Get a random entry from the class to test with
    const { data: entries, error } = await supabase
      .from('entries')
      .select('id, armband, in_ring, class_id')
      .eq('class_id', classId)
      .limit(1);

    if (error || !entries || entries.length === 0) {
      console.error('❌ No entries found for class', classId);
      return;
    }

    const testEntry = entries[0];
    console.log('🧪 Using test entry:', testEntry);

    // Toggle the in_ring status and toggle it back
    console.log('🧪 Step 1: Setting in_ring to TRUE...');
    await debugMarkInRing(testEntry.id, true);

    setTimeout(async () => {
      console.log('🧪 Step 2: Setting in_ring to FALSE...');
      await debugMarkInRing(testEntry.id, false);
    }, 2000);

    console.log('🧪 Real-time test initiated. Watch for subscription payloads in other tabs!');

  } catch (error) {
    console.error('❌ Real-time test failed:', error);
  }
}

/**
 * Test unfiltered real-time subscription to see if the issue is with our filter
 */
export async function testUnfilteredRealTime(): Promise<void> {
  console.log('🧪 Testing UNFILTERED real-time subscription...');

  const testSub = supabase
    .channel('unfiltered_test')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'entries' },
      (payload) => {
        console.log('🚨🚨🚨 UNFILTERED REAL-TIME PAYLOAD RECEIVED 🚨🚨🚨');
        console.log('📦 Payload:', JSON.stringify(payload, null, 2));
      }
    )
    .subscribe((status) => {
      console.log('📡 Unfiltered subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('✅ Unfiltered subscription active. Now try updating any entry...');
      }
    });

  // Return unsubscribe function
  const debugWindow = window as EntryDebugWindow;
  debugWindow.unsubscribeUnfiltered = () => {
    console.log('🔌 Unsubscribing from unfiltered test...');
    testSub.unsubscribe();
  };

  console.log('🧪 Unfiltered subscription created. Use window.unsubscribeUnfiltered() to stop.');
}

/**
 * Debug function to monitor database changes and find what's setting in_ring to false
 */
export async function debugMonitorEntry(entryId: number): Promise<void> {
  console.log(`🥰 MONITORING ENTRY ${entryId} FOR DATABASE CHANGES...`);

  // First, get current state
  const { data: currentState, error } = await supabase
    .from('entries')
    .select('id, armband, in_ring, is_scored, result_text')
    .eq('id', entryId)
    .single();

  if (error) {
    console.error('❌ Failed to get current state:', error);
    return;
  }

  console.log('🔍 CURRENT STATE:', currentState);

  // Set up real-time monitoring for JUST this entry
  const monitor = supabase
    .channel(`monitor_entry_${entryId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'entries',
        filter: `id=eq.${entryId}`
      },
      (payload) => {
        console.log('🚨🚨🚨 ENTRY DATABASE CHANGE DETECTED 🚨🚨🚨');
        console.log('Entry ID:', entryId);
        console.log('Event type:', payload.eventType);
        console.log('Timestamp:', new Date().toISOString());

        const oldData = payload.old as Record<string, unknown>;
        const newData = payload.new as Record<string, unknown>;

        if (oldData && newData) {
          console.log('🔄 FIELD CHANGES:');
          Object.keys(newData).forEach(key => {
            if (oldData[key] !== newData[key]) {
              console.log(`  ${key}: ${oldData[key]} -> ${newData[key]}`);

              if (key === 'in_ring' && newData[key] === false) {
                console.log('🚨🚨 FOUND THE CULPRIT! in_ring was set to FALSE 🚨🚨');
                console.log('Stack trace:');
                console.trace('in_ring set to false');
              }
            }
          });
        }

        console.log('Full payload:', JSON.stringify(payload, null, 2));
        console.log('🚨🚨🚨 END DATABASE CHANGE 🚨🚨🚨');
      }
    )
    .subscribe((status) => {
      console.log(`📍 Monitor status for entry ${entryId}:`, status);
      if (status === 'SUBSCRIBED') {
        console.log(`✅ Now monitoring entry ${entryId} for database changes`);
        console.log('To stop monitoring, call window.stopMonitoring()');
      }
    });

  // Store unsubscribe function globally
  const debugWindow = window as EntryDebugWindow;
  debugWindow.stopMonitoring = () => {
    console.log(`🔌 Stopping monitor for entry ${entryId}`);
    monitor.unsubscribe();
  };
}

/**
 * STOPWATCH ISSUE DEBUGGING - Track exactly when in_ring gets set to false
 */
export function debugStopwatchIssue(entryId: number): void {
  console.log(`🚨 DEBUGGING STOPWATCH ISSUE FOR ENTRY ${entryId} 🚨`);
  console.log('📋 SETUP INSTRUCTIONS:');
  console.log('1. Open your entry list page (Tab 2)');
  console.log('2. Open browser console (F12) in Tab 2');
  console.log('3. Run this function in Tab 2 console');
  console.log('4. Go to Tab 1 and start the stopwatch');
  console.log('5. Watch Tab 2 console for the exact moment in_ring changes');
  console.log('');

  // Monitor this specific entry
  debugMonitorEntry(entryId);

  console.log('🎯 SPECIFIC THINGS TO WATCH FOR:');
  console.log('- submitScore() calls (sets in_ring to false)');
  console.log('- updateEntryCheckinStatus() calls (sets in_ring to false)');
  console.log('- resetEntryScore() calls (sets in_ring to false)');
  console.log('- Any other database updates to this entry');
  console.log('');
  console.log('✅ Monitoring is now active. Start your stopwatch in the other tab!');
}

/**
 * Debug function to test check-in status updates
 */
export async function debugTestCheckinUpdate(
  entryId: number,
  status: 'no-status' | 'checked-in' | 'conflict' | 'pulled' | 'at-gate'
): Promise<unknown> {
  console.log('🧪 Testing check-in update for entry:', entryId, 'to status:', status);

  try {
    const result = await updateEntryCheckinStatus(entryId, status);
    console.log('✅ Check-in status update successful:', result);
    return result;
  } catch (error) {
    console.error('❌ Check-in status update failed:', error);
    throw error;
  }
}

/**
 * Simple test to verify Supabase real-time is working
 */
export async function testSupabaseRealTime(): Promise<() => void> {
  console.log('🧪 Testing basic Supabase real-time functionality...');

  // Create a simple subscription to the entries table
  const testSubscription = supabase
    .channel('test-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'entries'
      },
      (payload) => {
        console.log('🎉 REAL-TIME EVENT RECEIVED!', payload);
        console.log('Event:', payload.eventType);
        console.log('Table:', payload.table);
        console.log('New data:', payload.new);
        console.log('Old data:', payload.old);
      }
    )
    .subscribe((status, err) => {
      console.log('📡 Test subscription status:', status);
      if (err) {
        console.error('📡 Test subscription error:', err);
      }
      if (status === 'SUBSCRIBED') {
        console.log('✅ Real-time test subscription is active');
        console.log('Now try changing a check-in status in another tab...');
      }
    });

  // Return unsubscribe function
  return () => {
    console.log('🧪 Unsubscribing test real-time...');
    testSubscription.unsubscribe();
  };
}

/**
 * Initialize debug functions on window object for browser console access
 */
export function initializeDebugFunctions(): void {
  // Only register debug functions in development mode
  if (!import.meta.env.DEV) {
    return;
  }

  if (typeof window !== 'undefined') {
    const debugWindow = window as EntryDebugWindow;
    debugWindow.debugMarkInRing = debugMarkInRing;
    debugWindow.testSupabaseConnection = testSupabaseConnection;
    debugWindow.testRealTimeEvents = testRealTimeEvents;
    debugWindow.testUnfilteredRealTime = testUnfilteredRealTime;
    debugWindow.debugMonitorEntry = debugMonitorEntry;
    debugWindow.debugStopwatchIssue = debugStopwatchIssue;
    debugWindow.debugTestCheckinUpdate = debugTestCheckinUpdate;
    debugWindow.testSupabaseRealTime = testSupabaseRealTime;

    console.log('🧪 Debug functions available:');
    console.log('  - window.debugMarkInRing(entryId, true/false)');
    console.log('  - window.testSupabaseConnection()');
    console.log('  - window.testRealTimeEvents(classId)');
    console.log('  - window.testUnfilteredRealTime()');
    console.log('  - window.debugMonitorEntry(entryId) // Monitor specific entry for changes');
    console.log('  - window.debugStopwatchIssue(entryId) // 🚨 Debug stopwatch issue');
    console.log('  - window.debugTestCheckinUpdate(entryId, "checked-in") // Test check-in status updates');
    console.log('  - window.testSupabaseRealTime() // Test basic real-time functionality');
    console.log('  - window.stopMonitoring() // Stop monitoring');
  }
}
