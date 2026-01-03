import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// ES module equivalents for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local (project standard)
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

/**
 * AKC Scent Work Rules Seeder
 * Populates the Supabase database with parsed rules from JSON
 */

interface ParsedRule {
  section: string;
  title: string;
  content: string;
  level: string | null;
  element: string | null;
  category: string;
  keywords: string[];
  measurements: Record<string, any>;
}

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in environment variables');
  console.error('   Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Get or create the AKC organization
 */
async function getOrCreateOrganization(): Promise<string> {
  console.log('🏛️  Finding AKC organization...');

  // Check if AKC exists
  const { data: existingOrg } = await supabase
    .from('rule_organizations')
    .select('id')
    .eq('code', 'AKC')
    .single();

  if (existingOrg) {
    console.log(`   ✓ Found AKC organization (ID: ${existingOrg.id})`);
    return existingOrg.id;
  }

  // Create AKC organization if it doesn't exist
  console.log('   ⚠️  AKC not found, creating...');
  const { data: newOrg, error: createError } = await supabase
    .from('rule_organizations')
    .insert({
      name: 'American Kennel Club',
      code: 'AKC',
      country: 'United States',
      website: 'https://www.akc.org',
      description: 'The American Kennel Club is a registry of purebred dog pedigrees in the United States.',
    })
    .select('id')
    .single();

  if (createError || !newOrg) {
    console.error('❌ Could not create AKC organization:', createError);
    throw new Error('Failed to create AKC organization');
  }

  console.log(`   ✓ Created AKC organization (ID: ${newOrg.id})`);
  return newOrg.id;
}

/**
 * Get the Scent Work sport (should exist from migration)
 */
async function getScentWorkSport(): Promise<string> {
  console.log('🐕 Finding Scent Work sport...');

  // Check if Scent Work sport exists (code='scent-work' from migration)
  const { data: existingSport } = await supabase
    .from('rule_sports')
    .select('id')
    .eq('code', 'scent-work')
    .single();

  if (existingSport) {
    console.log(`   ✓ Found Scent Work sport (ID: ${existingSport.id})`);
    return existingSport.id;
  }

  // Create Scent Work sport if it doesn't exist (shouldn't happen after migration)
  console.log('   ⚠️  Scent Work sport not found, creating...');
  const { data: newSport, error: createError } = await supabase
    .from('rule_sports')
    .insert({
      code: 'scent-work',
      name: 'Scent Work',
      description: 'AKC Scent Work detection sport',
      active: true,
    })
    .select('id')
    .single();

  if (createError || !newSport) {
    console.error('❌ Could not create Scent Work sport:', createError);
    throw new Error('Failed to create Scent Work sport');
  }

  console.log(`   ✓ Created Scent Work sport (ID: ${newSport.id})`);
  return newSport.id;
}

/**
 * Get or create the AKC rulebook entry
 */
async function getOrCreateRulebook(): Promise<string> {
  console.log('📚 Finding/creating AKC Scent Work rulebook...\n');

  // Get or create AKC organization
  const organizationId = await getOrCreateOrganization();

  // Get Scent Work sport
  const sportId = await getScentWorkSport();

  console.log('\n📖 Finding rulebook...');

  // Check if rulebook exists
  const { data: existingRulebook } = await supabase
    .from('rulebooks')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('sport_id', sportId)
    .eq('version', '2024')
    .single();

  if (existingRulebook) {
    console.log(`   ✓ Found existing rulebook (ID: ${existingRulebook.id})`);
    return existingRulebook.id;
  }

  // Create rulebook if it doesn't exist (shouldn't happen if migration ran)
  console.log('   ⚠️  Rulebook not found, creating...');
  const { data: newRulebook, error: createError } = await supabase
    .from('rulebooks')
    .insert({
      organization_id: organizationId,
      sport_id: sportId,
      version: '2024',
      effective_date: '2024-01-01',
      pdf_url: null,
      active: true,
    })
    .select('id')
    .single();

  if (createError || !newRulebook) {
    console.error('❌ Could not create rulebook:', createError);
    throw new Error('Failed to create rulebook');
  }

  console.log(`   ✓ Created rulebook (ID: ${newRulebook.id})`);
  return newRulebook.id;
}

/**
 * Clear existing rules (optional - for development)
 */
async function clearExistingRules(rulebookId: string): Promise<void> {
  console.log('\n🗑️  Clearing existing rules...');

  const { error } = await supabase
    .from('rules')
    .delete()
    .eq('rulebook_id', rulebookId);

  if (error) {
    console.error('❌ Error clearing rules:', error);
    throw new Error('Failed to clear existing rules');
  }

  console.log('   ✓ Existing rules cleared');
}

/**
 * Insert rules into database
 */
async function insertRules(rulebookId: string, rules: ParsedRule[]): Promise<void> {
  console.log(`\n📝 Inserting ${rules.length} rules...`);

  const rulesToInsert = rules.map(rule => ({
    rulebook_id: rulebookId,
    section: rule.section,
    title: rule.title,
    content: rule.content,
    categories: rule.level && rule.element ? { level: rule.level, element: rule.element } : {},
    keywords: rule.keywords,
    measurements: rule.measurements,
  }));

  // Insert in batches of 10 to avoid overwhelming the database
  const batchSize = 10;
  for (let i = 0; i < rulesToInsert.length; i += batchSize) {
    const batch = rulesToInsert.slice(i, i + batchSize);

    const { error } = await supabase
      .from('rules')
      .insert(batch)
      .select('id, title');

    if (error) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error);
      throw new Error('Failed to insert rules');
    }

    console.log(`   ✓ Inserted batch ${i / batchSize + 1}/${Math.ceil(rulesToInsert.length / batchSize)} (${batch.length} rules)`);
    batch.forEach((_, idx) => {
      const rule = rules[i + idx];
      console.log(`      - ${rule.title}`);
    });
  }

  console.log(`\n✅ Successfully inserted all ${rules.length} rules`);
}

/**
 * Verify the rules were inserted correctly
 */
async function verifyInsertion(rulebookId: string): Promise<void> {
  console.log('\n🔍 Verifying insertion...');

  const { error, count } = await supabase
    .from('rules')
    .select('*', { count: 'exact' })
    .eq('rulebook_id', rulebookId);

  if (error) {
    console.error('❌ Error verifying:', error);
    return;
  }

  console.log(`   ✓ Found ${count} rules in database`);

  // Test search vector
  console.log('\n🔎 Testing full-text search...');

  const testQueries = [
    'area size exterior advanced',
    'container novice',
    'buried master hides',
  ];

  for (const query of testQueries) {
    const { data: results, error: searchError } = await supabase
      .from('rules')
      .select('title, section')
      .eq('rulebook_id', rulebookId)
      .textSearch('search_vector', query, {
        type: 'websearch',
        config: 'english',
      })
      .limit(3);

    if (searchError) {
      console.error(`   ❌ Search error for "${query}":`, searchError);
    } else {
      console.log(`   ✓ Query: "${query}" - Found ${results.length} results`);
      results.forEach(r => console.log(`      - ${r.title}`));
    }
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 AKC Scent Work Rules Seeder\n');

    // Load parsed rules from JSON
    const rulesPath = path.join(__dirname, '../data/parsed-rules.json');

    if (!fs.existsSync(rulesPath)) {
      console.error(`❌ Rules file not found: ${rulesPath}`);
      console.error('   Please run "npm run parse:rules" first to generate the rules JSON');
      process.exit(1);
    }

    const rulesJson = fs.readFileSync(rulesPath, 'utf-8');
    const rules: ParsedRule[] = JSON.parse(rulesJson);

    console.log(`📄 Loaded ${rules.length} rules from JSON\n`);

    // Get or create rulebook
    const rulebookId = await getOrCreateRulebook();

    // Clear existing rules (optional - comment out to keep existing rules)
    await clearExistingRules(rulebookId);

    // Insert rules
    await insertRules(rulebookId, rules);

    // Verify insertion
    await verifyInsertion(rulebookId);

    console.log('\n✅ Seeding complete!');

  } catch (error) {
    console.error('❌ Error seeding rules:', error);
    process.exit(1);
  }
}

// Run main function
main();
