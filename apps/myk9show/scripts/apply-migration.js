#!/usr/bin/env node

/**
 * Apply migration to remote Supabase instance
 * This script applies the singular table names migration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

console.log('🚀 Starting database migration...\n');
console.log('⚠️  WARNING: This will rename all tables from plural to singular!');
console.log('⚠️  Make sure you have backed up any important data!\n');

// Read migration SQL
const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250126_singular_table_names.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

console.log('📄 Migration file loaded:', migrationPath);
console.log('📊 Migration size:', Math.round(migrationSQL.length / 1024), 'KB\n');

// Since we can't execute raw SQL directly through the client library,
// we'll need to use the Supabase dashboard or CLI
console.log('📋 Next Steps:');
console.log('1. Go to your Supabase dashboard: https://app.supabase.com');
console.log('2. Navigate to SQL Editor');
console.log('3. Copy and paste the migration SQL from:');
console.log('   ', migrationPath);
console.log('4. Review the SQL and click "Run"');
console.log('5. After successful migration, run: npm run migration:migrate-code');
console.log('\n⚡ Quick link to your project:');
console.log(`   ${supabaseUrl}\n`);

console.log('📝 Migration Summary:');
console.log('- Renames 47+ tables from plural to singular');
console.log('- Updates all foreign key constraints');
console.log('- Adds user authentication integration');
console.log('- Fixes boolean column naming');
console.log('- Converts text fields to proper foreign keys\n');

console.log('🔄 If something goes wrong, use the rollback script:');
console.log('   supabase/migrations/rollback_20250126_singular_table_names.sql');