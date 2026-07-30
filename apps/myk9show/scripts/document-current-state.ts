#!/usr/bin/env node

/**
 * Document the current database state before migration
 * This script helps track what tables exist and their basic structure
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Get environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration');
  console.error('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Types for documentation
interface TableInfo {
  name: string;
  exists: boolean;
  row_count: number;
}

interface DocumentationData {
  timestamp: string;
  database_url: string;
  tables_found: TableInfo[];
  sample_data: Record<string, unknown>;
}

// Simple implementation that checks known tables
async function documentCurrentStateSimple(): Promise<void> {
  console.log('📊 Documenting current database state (simplified)...\n');

  const documentation: DocumentationData = {
    timestamp: new Date().toISOString(),
    database_url: supabaseUrl,
    tables_found: [],
    sample_data: {},
  };

  // List of known tables to check
  const knownTables = [
    'people', 'dogs', 'shows', 'clubs', 'show_trials', 'classes', 'entries', 'results',
    'dog_registrations', 'health_records', 'vaccinations', 'medications', 'allergies',
    'vet_visits', 'achievements', 'judge_qualifications', 'class_templates', 'show_templates',
    'template_fields', 'template_rules', 'sync_operations', 'sync_conflicts', 'sync_logs',
    'user_preferences', 'search_queries', 'search_results', 'audit_logs'
  ];

  // Check each table
  for (const table of knownTables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (!error) {
        documentation.tables_found.push({
          name: table,
          exists: true,
          row_count: count || 0
        });

        // Get a sample row
        const { data: sample } = await supabase
          .from(table)
          .select('*')
          .limit(1);

        if (sample && sample.length > 0) {
          documentation.sample_data[table] = sample[0];
        }
      } else {
        documentation.tables_found.push({
          name: table,
          exists: false,
          row_count: 0
        });
      }
    } catch {
      console.log(`⚠️  Could not check table: ${table}`);
      documentation.tables_found.push({
        name: table,
        exists: false,
        row_count: 0
      });
    }
  }

  // Write documentation to file
  const outputPath = join(process.cwd(), 'docs', 'database-state-before-migration.json');
  writeFileSync(outputPath, JSON.stringify(documentation, null, 2));

  console.log('📄 Documentation written to:', outputPath);
  console.log('\n📊 Tables found:');
  documentation.tables_found
    .filter((t: TableInfo) => t.exists)
    .forEach((t: TableInfo) => {
      console.log(`  ✅ ${t.name} (${t.row_count} rows)`);
    });
}

// Run the documentation
documentCurrentStateSimple().catch(console.error);