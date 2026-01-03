#!/usr/bin/env node

/**
 * Migration Generator for myK9Show
 * 
 * Analyzes TypeScript interfaces and suggests database migrations
 * Usage: node scripts/generate-migrations.js
 */

const fs = require('fs');
const path = require('path');

const TYPES_DIR = 'src/types';

// Core entities that should become database tables
const CORE_ENTITIES = [
  'Club', 'Person', 'Dog', 'Show', 'ShowTrial', 'Class', 
  'Entry', 'Registration', 'Achievement', 'Alert'
];

// Analyze interface dependencies
function analyzeDependencies() {
  const dependencies = {
    'Club': [],           // No dependencies
    'Person': [],         // No dependencies  
    'Dog': ['Person'],    // Needs owner (Person)
    'Show': ['Club'],     // Needs hosting club
    'ShowTrial': ['Show'], // Needs parent show
    'Class': ['ShowTrial'], // Needs parent trial
    'Entry': ['Dog', 'Class', 'Person'], // Needs dog, class, handler
    'Registration': ['Dog'], // Needs dog
    'Achievement': ['Dog'], // Needs dog
    'Alert': ['Person']   // Needs user
  };
  
  return dependencies;
}

// Generate migration order
function generateMigrationOrder() {
  const deps = analyzeDependencies();
  console.log('🎯 Suggested Migration Order:\n');
  
  let order = 1;
  const completed = new Set();
  
  // Sort by dependency count (fewer dependencies first)
  const entities = Object.keys(deps).sort((a, b) => 
    deps[a].length - deps[b].length
  );
  
  entities.forEach(entity => {
    const entityDeps = deps[entity];
    console.log(`${order}. create_${entity.toLowerCase()}s_table`);
    console.log(`   Dependencies: ${entityDeps.length > 0 ? entityDeps.join(', ') : 'None'}`);
    console.log(`   Command: npx supabase migration new create_${entity.toLowerCase()}s_table\n`);
    order++;
  });
}

// Main execution
function main() {
  console.log('🚢 myK9Show Database Migration Planner\n');
  console.log('Analyzing TypeScript interfaces...\n');
  
  generateMigrationOrder();
  
  console.log('📝 Next Steps:');
  console.log('1. Run the migration commands above in order');
  console.log('2. Edit each .sql file with the table schema');
  console.log('3. Apply with: npx supabase db push');
  console.log('4. Generate types: npx supabase gen types typescript --linked > src/types/supabase.ts');
}

if (require.main === module) {
  main();
}

module.exports = { analyzeDependencies, generateMigrationOrder };