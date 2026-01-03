import { chromium, FullConfig } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

/* eslint-disable @typescript-eslint/no-unused-vars */

const execAsync = promisify(exec);

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test teardown...');
  
  try {
    // Kill any remaining browser processes
    await killRemainingBrowserProcesses();
    
    // Kill any remaining git processes that might be hanging
    await killRemainingGitProcesses();
    // Clean up test artifacts
    console.log('📂 Cleaning up test artifacts...');
    
    const testResultsDir = 'test-results';
    const screenshotsDir = path.join(testResultsDir, 'screenshots');
    
    try {
      // Only clean up if explicitly requested (not in CI)
      if (!process.env.CI && process.env.CLEAN_TEST_ARTIFACTS === 'true') {
        await fs.rmdir(screenshotsDir, { recursive: true });
        console.log('✅ Cleaned up screenshots');
      }
    } catch {
      // Ignore cleanup errors
      console.log('⚠️ Could not clean up artifacts (this is normal)');
    }
    
    // Generate test summary
    console.log('📊 Generating test summary...');
    
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    try {
      // Clear test data from localStorage
      const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:5173';
      await page.goto(baseURL);
      
      await page.evaluate(() => {
        // Remove test-specific data but preserve user preferences
        const keysToRemove = [
          'test_dogs',
          'test_owners', 
          'test_shows',
          'test_classes',
          'e2e_test_mode',
          'registration_errors',
          'search_cache',
          'recent_searches'
        ];
        
        keysToRemove.forEach(key => {
          localStorage.removeItem(key);
        });
        
        sessionStorage.clear();
      });
      
      console.log('✅ Cleaned up test data from browser storage');
      
    } catch (error) {
      console.log('⚠️ Could not clean up browser storage:', error.message);
    } finally {
      await browser.close();
    }
    
    // Log test completion statistics
    console.log('📈 Test run completed');
    
    // Read test results if available
    try {
      const resultsPath = path.join(testResultsDir, 'results.json');
      const results = await fs.readFile(resultsPath, 'utf-8');
      const testData = JSON.parse(results);
      
      interface TestResult {
        status: string;
      }
      
      interface Test {
        results?: TestResult[];
      }
      
      interface TestSpec {
        specs?: {
          tests?: Test[];
        }[];
      }
      
      interface TestData {
        suites?: TestSpec[];
        stats?: {
          duration?: number;
        };
      }
      
      const parsedTestData = testData as TestData;
      
      const summary = {
        total: parsedTestData.suites?.reduce((acc: number, suite: TestSpec) => 
          acc + (suite.specs?.length || 0), 0) || 0,
        passed: parsedTestData.suites?.reduce((acc: number, suite: TestSpec) => 
          acc + (suite.specs?.filter((spec) => 
            spec.tests?.every((test: Test) => test.results?.every((result: TestResult) => 
              result.status === 'passed'))) || []).length, 0) || 0,
        failed: parsedTestData.suites?.reduce((acc: number, suite: TestSpec) => 
          acc + (suite.specs?.filter((spec) => 
            spec.tests?.some((test: Test) => test.results?.some((result: TestResult) => 
              result.status === 'failed'))) || []).length, 0) || 0,
        duration: parsedTestData.stats?.duration || 0
      };
      
      console.log(`📊 Test Summary:`);
      console.log(`   Total: ${summary.total}`);
      console.log(`   Passed: ${summary.passed}`);
      console.log(`   Failed: ${summary.failed}`);
      console.log(`   Duration: ${Math.round(summary.duration / 1000)}s`);
      
      if (summary.failed > 0) {
        console.log('❌ Some tests failed - check the HTML report for details');
      } else {
        console.log('✅ All tests passed!');
      }
      
    } catch {
      console.log('⚠️ Could not read test results for summary');
    }
    
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw - teardown failures shouldn't fail the test run
  }
  
  console.log('🎉 E2E test teardown completed!');
}

async function killRemainingBrowserProcesses() {
  try {
    console.log('🔄 Killing remaining browser processes...');
    
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Kill Chrome processes
      await execAsync('taskkill /f /im chrome.exe /t 2>nul || echo "No Chrome processes found"');
      await execAsync('taskkill /f /im msedge.exe /t 2>nul || echo "No Edge processes found"');
      await execAsync('taskkill /f /im firefox.exe /t 2>nul || echo "No Firefox processes found"');
      
      // Kill headless_shell processes (main culprit for CPU usage)
      await execAsync('taskkill /f /im headless_shell.exe /t 2>nul || echo "No headless_shell processes found"');
      
      // Kill any remaining Playwright browser processes
      await execAsync('taskkill /f /im "Playwright*" /t 2>nul || echo "No Playwright processes found"');
      
      // Kill browser helper processes
      await execAsync('taskkill /f /im "chrome_crashpad_handler.exe" /t 2>nul || echo "No Chrome crash handlers found"');
      await execAsync('taskkill /f /im "msedgewebview2.exe" /t 2>nul || echo "No Edge WebView processes found"');
    } else {
      // Linux/Mac
      await execAsync('pkill -f chrome || echo "No Chrome processes found"');
      await execAsync('pkill -f firefox || echo "No Firefox processes found"');
      await execAsync('pkill -f webkit || echo "No WebKit processes found"');
      await execAsync('pkill -f playwright || echo "No Playwright processes found"');
    }
    
    console.log('✅ Browser processes cleanup completed');
  } catch (error) {
    console.log('⚠️ Browser process cleanup had issues (this is usually normal)');
  }
}

async function killRemainingGitProcesses() {
  try {
    console.log('🔄 Checking for hanging development processes...');
    
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Check if there are many git processes running
      const { stdout: gitStdout } = await execAsync('tasklist /fi "imagename eq git.exe" /fo csv | find /c /v ""');
      const gitProcessCount = parseInt(gitStdout.trim()) - 1; // Subtract 1 for header
      
      if (gitProcessCount > 10) {
        console.log(`⚠️ Found ${gitProcessCount} git processes, cleaning up...`);
        await execAsync('taskkill /f /im git.exe /t 2>nul || echo "Git cleanup completed"');
      } else if (gitProcessCount > 0) {
        console.log(`ℹ️ Git processes: ${gitProcessCount} (normal)`);
      }

      // Check bash processes
      try {
        const { stdout: bashStdout } = await execAsync('tasklist /fi "imagename eq bash.exe" /fo csv 2>nul | find /c "bash.exe"');
        const bashProcessCount = parseInt(bashStdout.trim());
        
        if (bashProcessCount > 5) {
          console.log(`⚠️ Found ${bashProcessCount} bash processes, cleaning up...`);
          await execAsync('taskkill /f /im bash.exe /t 2>nul || echo "Bash cleanup completed"');
        } else if (bashProcessCount > 0) {
          console.log(`ℹ️ Bash processes: ${bashProcessCount} (normal)`);
        }
      } catch (error) {
        // Bash processes might not exist, that's fine
      }

      // Clean up other shell processes that can accumulate
      await execAsync('taskkill /f /im mintty.exe /t 2>nul || echo "No Git Bash terminals found"');
      await execAsync('taskkill /f /im sh.exe /t 2>nul || echo "No shell processes found"');
      
    } else {
      // Linux/Mac - count git processes
      const { stdout: gitStdout } = await execAsync('pgrep -c git || echo "0"');
      const gitProcessCount = parseInt(gitStdout.trim());
      
      if (gitProcessCount > 10) {
        console.log(`⚠️ Found ${gitProcessCount} git processes, cleaning up...`);
        await execAsync('pkill -f git || echo "Git cleanup completed"');
      }

      // Clean up bash processes on Unix systems
      const { stdout: bashStdout } = await execAsync('pgrep -c bash || echo "0"');
      const bashProcessCount = parseInt(bashStdout.trim());
      
      if (bashProcessCount > 5) {
        console.log(`⚠️ Found ${bashProcessCount} bash processes, cleaning up...`);
        await execAsync('pkill -f bash || echo "Bash cleanup completed"');
      }
    }
    
    console.log('✅ Development processes check completed');
  } catch (error) {
    console.log('⚠️ Development process cleanup had issues (this is usually normal)');
  }
}

export default globalTeardown;