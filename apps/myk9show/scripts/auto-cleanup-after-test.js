#!/usr/bin/env node

/**
 * Automatic cleanup script that runs after Playwright tests
 * This helps prevent process accumulation that causes high CPU usage
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function autoCleanup() {
  console.log('🧹 Auto-cleanup: Checking for leftover browser processes...');
  
  try {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Check for headless_shell processes
      try {
        const { stdout } = await execAsync('tasklist /fi "imagename eq headless_shell.exe" /fo csv | find /c /v ""');
        const processCount = parseInt(stdout.trim()) - 1; // Subtract 1 for header
        
        if (processCount > 0) {
          console.log(`⚠️  Found ${processCount} leftover headless_shell processes, cleaning up...`);
          await execAsync('taskkill /f /im headless_shell.exe /t 2>nul');
          console.log('✅ Cleaned up headless_shell processes');
        } else {
          console.log('✅ No leftover headless_shell processes found');
        }
      } catch (error) {
        console.log('ℹ️  Could not check headless_shell processes (this is normal)');
      }
      
      // Quick cleanup of other browser processes
      await execAsync('taskkill /f /im chrome.exe /t 2>nul || echo ""').catch(() => {});
      await execAsync('taskkill /f /im msedge.exe /t 2>nul || echo ""').catch(() => {});
      await execAsync('taskkill /f /im firefox.exe /t 2>nul || echo ""').catch(() => {});
      
      // Check and cleanup development processes if excessive
      try {
        const { stdout: gitStdout } = await execAsync('tasklist /fi "imagename eq git.exe" /fo csv | find /c /v ""');
        const gitProcessCount = parseInt(gitStdout.trim()) - 1;
        
        if (gitProcessCount > 10) {
          console.log(`⚠️  Found ${gitProcessCount} git processes, cleaning up...`);
          await execAsync('taskkill /f /im git.exe /t 2>nul');
          console.log('✅ Cleaned up excessive git processes');
        }
      } catch (error) {
        // Ignore git cleanup errors
      }

      try {
        const { stdout: bashStdout } = await execAsync('tasklist /fi "imagename eq bash.exe" /fo csv 2>nul | find /c "bash.exe"');
        const bashProcessCount = parseInt(bashStdout.trim());
        
        if (bashProcessCount > 5) {
          console.log(`⚠️  Found ${bashProcessCount} bash processes, cleaning up...`);
          await execAsync('taskkill /f /im bash.exe /t 2>nul');
          console.log('✅ Cleaned up excessive bash processes');
        }
      } catch (error) {
        // Ignore bash cleanup errors
      }
      
    } else {
      // Linux/Mac cleanup
      await execAsync('pkill -f headless_shell || echo ""').catch(() => {});
      await execAsync('pkill -f chrome || echo ""').catch(() => {});
      await execAsync('pkill -f firefox || echo ""').catch(() => {});
      await execAsync('pkill -f webkit || echo ""').catch(() => {});
      
      // Check and cleanup development processes if excessive
      try {
        const { stdout: gitStdout } = await execAsync('pgrep -c git || echo "0"');
        const gitProcessCount = parseInt(gitStdout.trim());
        
        if (gitProcessCount > 10) {
          console.log(`⚠️  Found ${gitProcessCount} git processes, cleaning up...`);
          await execAsync('pkill -f git || echo ""');
          console.log('✅ Cleaned up excessive git processes');
        }
      } catch (error) {
        // Ignore git cleanup errors
      }

      try {
        const { stdout: bashStdout } = await execAsync('pgrep -c bash || echo "0"');
        const bashProcessCount = parseInt(bashStdout.trim());
        
        if (bashProcessCount > 5) {
          console.log(`⚠️  Found ${bashProcessCount} bash processes, cleaning up...`);
          await execAsync('pkill -f bash || echo ""');
          console.log('✅ Cleaned up excessive bash processes');
        }
      } catch (error) {
        // Ignore bash cleanup errors
      }
    }
    
    console.log('✅ Auto-cleanup completed');
    
  } catch (error) {
    console.log('⚠️  Auto-cleanup had issues (this is usually normal):', error.message);
  }
}

// Run cleanup if called directly
if (require.main === module) {
  autoCleanup().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('❌ Auto-cleanup failed:', error);
    process.exit(1);
  });
}

module.exports = { autoCleanup };