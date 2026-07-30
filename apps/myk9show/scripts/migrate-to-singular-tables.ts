#!/usr/bin/env node

/**
 * Migration script to update TypeScript code for singular table names
 * This script helps automate the refactoring of code after database migration
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

// Configuration
const ROOT_DIR = process.cwd();
const SRC_DIR = join(ROOT_DIR, 'src');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// Table name mappings (plural to singular)
const TABLE_MAPPINGS: Record<string, string> = {
  'people': 'user',
  'dogs': 'dog',
  'shows': 'show',
  'clubs': 'club',
  'show_trials': 'trial',
  'classes': 'class',
  'entries': 'entry',
  'results': 'result',
  'dog_registrations': 'dog_registration',
  'health_records': 'health_record',
  'vaccinations': 'vaccination',
  'medications': 'medication',
  'allergies': 'allergy',
  'vet_visits': 'vet_visit',
  'achievements': 'achievement',
  'judge_qualifications': 'judge_qualification',
  'class_templates': 'class_template',
  'show_templates': 'show_template',
  'template_fields': 'template_field',
  'template_rules': 'template_rule',
  'sync_operations': 'sync_operation',
  'sync_conflicts': 'sync_conflict',
  'sync_logs': 'sync_log',
  'user_preferences': 'user_preference',
  'search_queries': 'search_query',
  'search_results': 'search_result',
  'audit_logs': 'audit_log',
};

// Type and interface mappings
const TYPE_MAPPINGS: Record<string, string> = {
  'Person': 'User',
  'People': 'Users',
  'PersonType': 'UserType',
  'PersonRole': 'UserRole',
};

// Store and hook mappings
const STORE_MAPPINGS: Record<string, string> = {
  'peopleStore': 'userStore',
  'peopleSidebarStore': 'userSidebarStore',
  'usePeopleStore': 'useUserStore',
  'usePeople': 'useUsers',
  'usePerson': 'useUser',
  'usePeopleQuery': 'useUsersQuery',
};

// Component and method mappings
const COMPONENT_MAPPINGS: Record<string, string> = {
  'PeopleTable': 'UserTable',
  'PeopleDetails': 'UserDetails',
  'PeopleListPage': 'UserListPage',
  'PersonCreationPanel': 'UserCreationPanel',
  'AddPersonDialog': 'AddUserDialog',
  'addPerson': 'addUser',
  'updatePerson': 'updateUser',
  'deletePerson': 'deleteUser',
  'findPersonById': 'findUserById',
  'onPersonSelect': 'onUserSelect',
  'selectedPerson': 'selectedUser',
  'people-storage': 'user-storage',
};

// Track changes for reporting
let filesChanged = 0;
let totalReplacements = 0;

/**
 * Replace patterns in a file
 */
function replaceInFile(filePath: string): boolean {
  try {
    let content = readFileSync(filePath, 'utf8');
    const originalContent = content;
    let replacements = 0;

    // Replace Supabase table references
    Object.entries(TABLE_MAPPINGS).forEach(([plural, singular]) => {
      // Match .from('table') or .from("table")
      const fromPattern = new RegExp(`\\.from\\(['"\`]${plural}['"\`]\\)`, 'g');
      content = content.replace(fromPattern, () => {
        replacements++;
        return `.from('${singular}')`;
      });

      // Match JOIN table
      const joinPattern = new RegExp(`\\bJOIN\\s+${plural}\\b`, 'gi');
      content = content.replace(joinPattern, () => {
        replacements++;
        return `JOIN ${singular === 'user' ? '"user"' : singular}`;
      });

      // Match table references in select statements like dogs(*), classes(*)
      const selectPattern = new RegExp(`\\b${plural}\\(\\*\\)`, 'g');
      content = content.replace(selectPattern, () => {
        replacements++;
        return `${singular}(*)`;
      });

      // Match Tables['table'] type references
      const tableTypePattern = new RegExp(`Tables\\[['"\`]${plural}['"\`]\\]`, 'g');
      content = content.replace(tableTypePattern, () => {
        replacements++;
        return `Tables['${singular}']`;
      });
    });

    // Replace type and interface names
    Object.entries(TYPE_MAPPINGS).forEach(([old, newName]) => {
      // Match type definitions and usage
      const typePattern = new RegExp(`\\b${old}\\b(?![\\w])`, 'g');
      content = content.replace(typePattern, (match, offset) => {
        // Check if it's part of a larger identifier
        const before = content[offset - 1];
        const after = content[offset + match.length];
        if ((before && /\w/.test(before)) || (after && /\w/.test(after))) {
          return match;
        }
        replacements++;
        return newName;
      });
    });

    // Replace store and hook references
    Object.entries(STORE_MAPPINGS).forEach(([old, newName]) => {
      const pattern = new RegExp(`\\b${old}\\b`, 'g');
      content = content.replace(pattern, () => {
        replacements++;
        return newName;
      });
    });

    // Replace component and method names
    Object.entries(COMPONENT_MAPPINGS).forEach(([old, newName]) => {
      const pattern = new RegExp(`\\b${old}\\b`, 'g');
      content = content.replace(pattern, () => {
        replacements++;
        return newName;
      });
    });

    // Replace import paths
    content = content.replace(/from\s+['"]@?\/store\/peopleStore['"]/g, () => {
      replacements++;
      return `from '@/store/userStore'`;
    });

    content = content.replace(/from\s+['"]\.\.?\/.*\/peopleStore['"]/g, (match) => {
      replacements++;
      const path = match.match(/['"](.*)['"]/)?.[1] || '';
      return `from '${path.replace('peopleStore', 'userStore')}'`;
    });

    // Update component directory imports
    content = content.replace(/\/components\/people\//g, () => {
      replacements++;
      return '/components/users/';
    });

    // Write file if changes were made
    if (content !== originalContent) {
      writeFileSync(filePath, content, 'utf8');
      filesChanged++;
      totalReplacements += replacements;
      console.log(`✅ Updated ${filePath} (${replacements} replacements)`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error);
    return false;
  }
}

/**
 * Recursively process directory
 */
function processDirectory(dir: string): void {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules and other build directories
      if (!['node_modules', 'dist', 'build', '.git', '.next'].includes(entry)) {
        processDirectory(fullPath);
      }
    } else if (stat.isFile()) {
      const ext = extname(entry);
      if (EXTENSIONS.includes(ext)) {
        replaceInFile(fullPath);
      }
    }
  }
}

/**
 * Main execution
 */
function main(): void {
  console.log('🚀 Starting TypeScript migration for singular table names...\n');
  console.log(`📁 Processing directory: ${SRC_DIR}\n`);

  // Process the source directory
  processDirectory(SRC_DIR);

  // Also process root config files
  const rootFiles = [
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
  ];

  rootFiles.forEach(file => {
    const filePath = join(ROOT_DIR, file);
    try {
      if (statSync(filePath).isFile()) {
        replaceInFile(filePath);
      }
    } catch {
      // File doesn't exist, skip
    }
  });

  console.log('\n📊 Migration Summary:');
  console.log(`Files changed: ${filesChanged}`);
  console.log(`Total replacements: ${totalReplacements}`);
  console.log('\n✅ Migration script completed!');
  console.log('\n⚠️  Next steps:');
  console.log('1. Review the changes using git diff');
  console.log('2. Run: npm run build');
  console.log('3. Fix any TypeScript errors');
  console.log('4. Run: npm run test');
  console.log('5. Manually rename component directories from /people/ to /users/');
  console.log('6. Update route definitions in router configuration');
}

// Run the migration
main();