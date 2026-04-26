#!/usr/bin/env node

/**
 * Cross-Browser Test Runner
 * Executes comprehensive cross-browser testing for myK9Show application
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class CrossBrowserTestRunner {
  constructor() {
    this.browsers = ['chromium', 'firefox', 'webkit'];
    this.testSuites = [
      'src/test/e2e/cross-browser/functionality.spec.ts',
      'src/test/e2e/cross-browser/performance.spec.ts',
      'src/test/e2e/cross-browser/quirks.spec.ts',
    ];
    this.resultsDir = 'test-results/cross-browser';
    this.reportDir = 'test-results/reports';

    this.results = {
      browsers: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      },
      startTime: new Date(),
      endTime: null,
    };
  }

  async run() {
    console.log('🚀 Starting Cross-Browser Testing for myK9Show');
    console.log(`📅 Started at: ${this.results.startTime.toISOString()}`);
    console.log(`🌐 Testing browsers: ${this.browsers.join(', ')}`);
    console.log(`📋 Test suites: ${this.testSuites.length}`);
    console.log('─'.repeat(80));

    // Ensure directories exist
    this.ensureDirectories();

    // Run tests for each browser
    for (const browser of this.browsers) {
      await this.runBrowserTests(browser);
    }

    // Generate final report
    this.results.endTime = new Date();
    this.generateReport();
    this.printSummary();
  }

  ensureDirectories() {
    [this.resultsDir, this.reportDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async runBrowserTests(browser) {
    console.log(`\n🔍 Testing in ${browser.toUpperCase()}`);
    console.log('─'.repeat(40));

    this.results.browsers[browser] = {
      suites: {},
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      startTime: new Date(),
      endTime: null,
    };

    for (const suite of this.testSuites) {
      await this.runTestSuite(browser, suite);
    }

    this.results.browsers[browser].endTime = new Date();
    const duration =
      this.results.browsers[browser].endTime - this.results.browsers[browser].startTime;
    console.log(`✅ ${browser} testing completed in ${Math.round(duration / 1000)}s`);
  }

  async runTestSuite(browser, suitePath) {
    const suiteName = path.basename(suitePath, '.spec.ts');
    console.log(`  📝 Running ${suiteName} tests...`);

    try {
      const command = `npx playwright test ${suitePath} --project=${browser} --reporter=json`;
      const output = execSync(command, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const result = this.parseTestResults(output);
      this.results.browsers[browser].suites[suiteName] = result;

      console.log(
        `    ✅ ${result.passed} passed, ❌ ${result.failed} failed, ⏭️ ${result.skipped} skipped`
      );

      // Update browser summary
      this.updateBrowserSummary(browser, result);
    } catch (error) {
      console.log(`    ❌ Suite failed with error: ${error.message}`);
      this.results.browsers[browser].suites[suiteName] = {
        total: 0,
        passed: 0,
        failed: 1,
        skipped: 0,
        error: error.message,
      };
      this.results.browsers[browser].summary.failed += 1;
    }
  }

  parseTestResults(output) {
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { total: 0, passed: 0, failed: 1, skipped: 0, error: 'No JSON output found' };
      }

      const results = JSON.parse(jsonMatch[0]);

      return {
        total: results.stats?.total || 0,
        passed: results.stats?.passed || 0,
        failed: results.stats?.failed || 0,
        skipped: results.stats?.skipped || 0,
        duration: results.stats?.duration || 0,
      };
    } catch (error) {
      return { total: 0, passed: 0, failed: 1, skipped: 0, error: 'Failed to parse results' };
    }
  }

  updateBrowserSummary(browser, result) {
    const summary = this.results.browsers[browser].summary;
    summary.total += result.total;
    summary.passed += result.passed;
    summary.failed += result.failed;
    summary.skipped += result.skipped;
  }

  generateReport() {
    console.log('\n📊 Generating comprehensive test report...');

    // Update global summary
    Object.values(this.results.browsers).forEach(browser => {
      this.results.summary.total += browser.summary.total;
      this.results.summary.passed += browser.summary.passed;
      this.results.summary.failed += browser.summary.failed;
      this.results.summary.skipped += browser.summary.skipped;
    });

    // Generate HTML report
    this.generateHTMLReport();

    // Generate JSON report
    this.generateJSONReport();

    // Generate browser compatibility matrix
    this.generateCompatibilityMatrix();
  }

  generateHTMLReport() {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>myK9Show Cross-Browser Test Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; margin: 20px; }
        .header { background: linear-gradient(135deg, #007AFF, #5856D6); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .stat-card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; text-align: center; }
        .stat-value { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
        .passed { color: #34C759; }
        .failed { color: #FF3B30; }
        .skipped { color: #FF9500; }
        .browser-section { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .browser-header { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
        .browser-icon { width: 24px; height: 24px; }
        .suite-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
        .suite-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; }
        .suite-name { font-weight: 600; margin-bottom: 10px; }
        .test-stats { display: flex; gap: 15px; font-size: 0.9em; }
        .compatibility-matrix { margin-top: 30px; }
        .matrix-table { width: 100%; border-collapse: collapse; }
        .matrix-table th, .matrix-table td { border: 1px solid #e5e7eb; padding: 10px; text-align: center; }
        .matrix-table th { background: #f9fafb; }
        .success { background: #dcfce7; color: #166534; }
        .failure { background: #fef2f2; color: #dc2626; }
        .partial { background: #fef3c7; color: #d97706; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🐕 myK9Show Cross-Browser Test Report</h1>
        <p>Comprehensive testing across Chrome, Firefox, and Safari</p>
        <p>Generated: ${this.results.endTime.toLocaleString()}</p>
    </div>

    <div class="summary">
        <div class="stat-card">
            <div class="stat-value">${this.results.summary.total}</div>
            <div>Total Tests</div>
        </div>
        <div class="stat-card">
            <div class="stat-value passed">${this.results.summary.passed}</div>
            <div>Passed</div>
        </div>
        <div class="stat-card">
            <div class="stat-value failed">${this.results.summary.failed}</div>
            <div>Failed</div>
        </div>
        <div class="stat-card">
            <div class="stat-value skipped">${this.results.summary.skipped}</div>
            <div>Skipped</div>
        </div>
    </div>

    ${this.generateBrowserSections()}

    <div class="compatibility-matrix">
        <h2>🔍 Browser Compatibility Matrix</h2>
        ${this.generateCompatibilityTable()}
    </div>
</body>
</html>`;

    fs.writeFileSync(path.join(this.reportDir, 'cross-browser-report.html'), html);
    console.log(`  ✅ HTML report: ${path.join(this.reportDir, 'cross-browser-report.html')}`);
  }

  generateBrowserSections() {
    const browserIcons = {
      chromium: '🟢',
      firefox: '🟠',
      webkit: '🔵',
    };

    return Object.entries(this.results.browsers)
      .map(
        ([browser, data]) => `
        <div class="browser-section">
            <div class="browser-header">
                <span class="browser-icon">${browserIcons[browser]}</span>
                <h2>${browser.charAt(0).toUpperCase() + browser.slice(1)}</h2>
                <span>(${data.summary.passed}/${data.summary.total} passed)</span>
            </div>
            <div class="suite-grid">
                ${Object.entries(data.suites)
                  .map(
                    ([suite, results]) => `
                    <div class="suite-card">
                        <div class="suite-name">${suite}</div>
                        <div class="test-stats">
                            <span class="passed">✅ ${results.passed}</span>
                            <span class="failed">❌ ${results.failed}</span>
                            <span class="skipped">⏭️ ${results.skipped}</span>
                        </div>
                    </div>
                `
                  )
                  .join('')}
            </div>
        </div>
    `
      )
      .join('');
  }

  generateCompatibilityTable() {
    const suites = [
      ...new Set(Object.values(this.results.browsers).flatMap(b => Object.keys(b.suites))),
    ];

    let table = `
        <table class="matrix-table">
            <thead>
                <tr>
                    <th>Test Suite</th>
                    ${this.browsers.map(b => `<th>${b}</th>`).join('')}
                </tr>
            </thead>
            <tbody>`;

    suites.forEach(suite => {
      table += `<tr><td><strong>${suite}</strong></td>`;
      this.browsers.forEach(browser => {
        const result = this.results.browsers[browser]?.suites[suite];
        if (!result) {
          table += '<td class="failure">❌ Not Run</td>';
        } else if (result.failed > 0) {
          table += `<td class="failure">❌ ${result.failed} Failed</td>`;
        } else if (result.passed === result.total) {
          table += `<td class="success">✅ All Passed</td>`;
        } else {
          table += `<td class="partial">⚠️ Partial</td>`;
        }
      });
      table += '</tr>';
    });

    table += '</tbody></table>';
    return table;
  }

  generateJSONReport() {
    const jsonReport = {
      ...this.results,
      metadata: {
        testRunner: 'myK9Show Cross-Browser Test Runner',
        version: '1.0.0',
        browsers: this.browsers,
        testSuites: this.testSuites,
      },
    };

    fs.writeFileSync(
      path.join(this.reportDir, 'cross-browser-results.json'),
      JSON.stringify(jsonReport, null, 2)
    );
    console.log(`  ✅ JSON report: ${path.join(this.reportDir, 'cross-browser-results.json')}`);
  }

  generateCompatibilityMatrix() {
    const matrix = {};

    // Build compatibility matrix
    Object.entries(this.results.browsers).forEach(([browser, data]) => {
      Object.entries(data.suites).forEach(([suite, results]) => {
        if (!matrix[suite]) matrix[suite] = {};
        matrix[suite][browser] = {
          status: results.failed > 0 ? 'failed' : results.passed > 0 ? 'passed' : 'skipped',
          passed: results.passed,
          failed: results.failed,
          total: results.total,
        };
      });
    });

    fs.writeFileSync(
      path.join(this.reportDir, 'compatibility-matrix.json'),
      JSON.stringify(matrix, null, 2)
    );
    console.log(
      `  ✅ Compatibility matrix: ${path.join(this.reportDir, 'compatibility-matrix.json')}`
    );
  }

  printSummary() {
    const totalDuration = this.results.endTime - this.results.startTime;

    console.log('\n' + '═'.repeat(80));
    console.log('🏆 CROSS-BROWSER TESTING COMPLETE');
    console.log('═'.repeat(80));
    console.log(`⏱️  Total Duration: ${Math.round(totalDuration / 1000)}s`);
    console.log(`📊 Total Tests: ${this.results.summary.total}`);
    console.log(`✅ Passed: ${this.results.summary.passed}`);
    console.log(`❌ Failed: ${this.results.summary.failed}`);
    console.log(`⏭️  Skipped: ${this.results.summary.skipped}`);

    const successRate = Math.round(
      (this.results.summary.passed / this.results.summary.total) * 100
    );
    console.log(`📈 Success Rate: ${successRate}%`);

    console.log('\n🌐 Browser Results:');
    Object.entries(this.results.browsers).forEach(([browser, data]) => {
      const browserSuccess = Math.round((data.summary.passed / data.summary.total) * 100) || 0;
      console.log(
        `  ${browser.padEnd(10)} ${data.summary.passed}/${data.summary.total} (${browserSuccess}%)`
      );
    });

    console.log('\n📋 Reports Generated:');
    console.log(`  📄 HTML Report: test-results/reports/cross-browser-report.html`);
    console.log(`  📊 JSON Results: test-results/reports/cross-browser-results.json`);
    console.log(`  🔍 Compatibility Matrix: test-results/reports/compatibility-matrix.json`);

    if (this.results.summary.failed > 0) {
      console.log('\n⚠️  Some tests failed. Check the detailed reports for more information.');
      process.exit(1);
    } else {
      console.log('\n🎉 All cross-browser tests passed successfully!');
    }
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const runner = new CrossBrowserTestRunner();

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
myK9Show Cross-Browser Test Runner

Usage: node scripts/cross-browser-test-runner.js [options]

Options:
  --help, -h     Show this help message
  
This script runs comprehensive cross-browser tests across:
- Chrome (Chromium)
- Firefox  
- Safari (WebKit)

Test categories:
- Functionality tests
- Performance tests
- Browser quirks and compatibility
- Visual regression tests

Reports are generated in test-results/reports/
  `);
  process.exit(0);
}

// Run the tests
runner.run().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
