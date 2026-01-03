#!/usr/bin/env node
/**
 * Install Git hooks for the project
 * This script copies pre-commit hook to .git/hooks/
 */

const fs = require('fs');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..', '.git', 'hooks');
const PRE_COMMIT_SOURCE = path.join(__dirname, 'pre-commit');
const PRE_COMMIT_DEST = path.join(HOOKS_DIR, 'pre-commit');

function installHook() {
  // Check if .git directory exists
  if (!fs.existsSync(HOOKS_DIR)) {
    console.log('❌ .git/hooks directory not found. Is this a git repository?');
    process.exit(1);
  }

  // Check if source hook exists
  if (!fs.existsSync(PRE_COMMIT_SOURCE)) {
    console.log('❌ Pre-commit hook script not found at:', PRE_COMMIT_SOURCE);
    process.exit(1);
  }

  // Copy the hook
  try {
    fs.copyFileSync(PRE_COMMIT_SOURCE, PRE_COMMIT_DEST);

    // Make it executable (Unix/Mac only, Windows doesn't need this)
    if (process.platform !== 'win32') {
      fs.chmodSync(PRE_COMMIT_DEST, 0o755);
    }

    console.log('✅ Pre-commit hook installed successfully!');
    console.log('   Hook will run typecheck, lint, and tests before each commit.');
  } catch (error) {
    console.error('❌ Failed to install pre-commit hook:', error.message);
    process.exit(1);
  }
}

installHook();
