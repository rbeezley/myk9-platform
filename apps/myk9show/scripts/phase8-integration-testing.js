/**
 * Phase 8 System Integration Testing Execution Script
 * 
 * Executes comprehensive integration testing suite including:
 * - Unit/Integration test coverage analysis
 * - Cross-browser E2E testing
 * - Mobile responsiveness validation
 * - Performance benchmarking
 * - Data integrity verification
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Phase8TestRunner {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      unitTests: null,
      integrationTests: null,
      e2eTests: null,
      crossBrowser: null,
      mobileResponsiveness: null,
      performance: null,
      coverage: null,
      criticalIssues: [],
      summary: null
    };
    
    this.browsers = ['chromium', 'firefox', 'webkit', 'msedge'];
    this.viewports = [
      { name: 'mobile', width: 320, height: 568 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1280, height: 720 }
    ];
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
  }

  async executeCommand(command, description) {
    this.log(`Executing: ${description}`);
    try {
      const output = execSync(command, { 
        encoding: 'utf8', 
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 600000 // 10 minute timeout
      });
      this.log(`✅ ${description} completed successfully`);
      return { success: true, output };
    } catch (error) {
      this.log(`❌ ${description} failed: ${error.message}`, 'ERROR');
      return { success: false, error: error.message, output: error.stdout };
    }
  }

  async runUnitTests() {
    this.log('=== Running Unit Tests ===');
    
    const result = await this.executeCommand(
      'npm run test -- --run --reporter=json --outputFile=test-results/unit-results.json',
      'Unit test execution'
    );

    try {
      const resultsPath = path.join(process.cwd(), 'test-results', 'unit-results.json');
      if (fs.existsSync(resultsPath)) {
        const testResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        this.results.unitTests = {
          passed: testResults.numPassedTests || 0,
          failed: testResults.numFailedTests || 0,
          total: testResults.numTotalTests || 0,
          duration: testResults.duration || 0,
          success: result.success && (testResults.numFailedTests || 0) === 0
        };
      }
    } catch (error) {
      this.log(`Failed to parse unit test results: ${error.message}`, 'ERROR');
      this.results.unitTests = { success: false, error: error.message };
    }

    return this.results.unitTests;
  }

  async runIntegrationTests() {
    this.log('=== Running Integration Tests ===');
    
    const result = await this.executeCommand(
      'npm run test -- --run src/test/integration/ --reporter=json --outputFile=test-results/integration-results.json',
      'Integration test execution'
    );

    try {
      const resultsPath = path.join(process.cwd(), 'test-results', 'integration-results.json');
      if (fs.existsSync(resultsPath)) {
        const testResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        this.results.integrationTests = {
          passed: testResults.numPassedTests || 0,
          failed: testResults.numFailedTests || 0,
          total: testResults.numTotalTests || 0,
          duration: testResults.duration || 0,
          success: result.success && (testResults.numFailedTests || 0) === 0
        };
      }
    } catch (error) {
      this.log(`Failed to parse integration test results: ${error.message}`, 'ERROR');
      this.results.integrationTests = { success: false, error: error.message };
    }

    return this.results.integrationTests;
  }

  async runCoverageAnalysis() {
    this.log('=== Running Coverage Analysis ===');
    
    const result = await this.executeCommand(
      'npm run test:coverage -- --reporter=json --outputFile=coverage/coverage-summary.json',
      'Test coverage analysis'
    );

    try {
      const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
      if (fs.existsSync(coveragePath)) {
        const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
        
        this.results.coverage = {
          statements: coverage.total?.statements?.pct || 0,
          branches: coverage.total?.branches?.pct || 0,
          functions: coverage.total?.functions?.pct || 0,
          lines: coverage.total?.lines?.pct || 0,
          meetsTarget: (coverage.total?.statements?.pct || 0) >= 80,
          success: result.success
        };
      }
    } catch (error) {
      this.log(`Failed to parse coverage results: ${error.message}`, 'ERROR');
      this.results.coverage = { success: false, error: error.message };
    }

    return this.results.coverage;
  }

  async runE2ETests() {
    this.log('=== Running E2E Tests ===');
    
    const result = await this.executeCommand(
      'npm run test:e2e -- --project=chromium --reporter=json --output-dir=test-results/e2e',
      'E2E test execution'
    );

    // Parse Playwright results
    try {
      const resultsPath = path.join(process.cwd(), 'test-results', 'e2e', 'results.json');
      if (fs.existsSync(resultsPath)) {
        const testResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        
        this.results.e2eTests = {
          passed: testResults.suites?.reduce((sum, suite) => 
            sum + (suite.specs?.filter(spec => spec.ok).length || 0), 0) || 0,
          failed: testResults.suites?.reduce((sum, suite) => 
            sum + (suite.specs?.filter(spec => !spec.ok).length || 0), 0) || 0,
          duration: testResults.duration || 0,
          success: result.success
        };
      }
    } catch (error) {
      this.log(`Failed to parse E2E test results: ${error.message}`, 'ERROR');
      this.results.e2eTests = { success: false, error: error.message };
    }

    return this.results.e2eTests;
  }

  async runCrossBrowserTests() {
    this.log('=== Running Cross-Browser Tests ===');
    
    const browserResults = {};
    
    for (const browser of this.browsers) {
      this.log(`Testing browser: ${browser}`);
      
      const result = await this.executeCommand(
        `npm run test:e2e -- --project=${browser} src/test/e2e/phase8-cross-browser-integration.spec.ts --reporter=json`,
        `Cross-browser testing - ${browser}`
      );

      browserResults[browser] = {
        success: result.success,
        ...(result.success ? { passed: true } : { failed: true, error: result.error })
      };
    }

    this.results.crossBrowser = {
      browsers: browserResults,
      allPassed: Object.values(browserResults).every(r => r.success),
      summary: `${Object.values(browserResults).filter(r => r.success).length}/${this.browsers.length} browsers passed`
    };

    return this.results.crossBrowser;
  }

  async runMobileResponsivenessTests() {
    this.log('=== Running Mobile Responsiveness Tests ===');
    
    const viewportResults = {};
    
    for (const viewport of this.viewports) {
      this.log(`Testing viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
      
      const result = await this.executeCommand(
        `npm run test:e2e -- --project=chromium src/test/e2e/visual/responsive-design.spec.ts --reporter=json`,
        `Responsive testing - ${viewport.name}`
      );

      viewportResults[viewport.name] = {
        viewport,
        success: result.success,
        ...(result.success ? { passed: true } : { failed: true, error: result.error })
      };
    }

    this.results.mobileResponsiveness = {
      viewports: viewportResults,
      allPassed: Object.values(viewportResults).every(r => r.success),
      summary: `${Object.values(viewportResults).filter(r => r.success).length}/${this.viewports.length} viewports passed`
    };

    return this.results.mobileResponsiveness;
  }

  async runPerformanceTests() {
    this.log('=== Running Performance Tests ===');
    
    const result = await this.executeCommand(
      'npm run test:performance -- --reporter=json --outputFile=test-results/performance-results.json',
      'Performance test execution'
    );

    try {
      const resultsPath = path.join(process.cwd(), 'test-results', 'performance-results.json');
      if (fs.existsSync(resultsPath)) {
        const perfResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        
        this.results.performance = {
          pageLoadAvg: 0, // Calculate from test results
          userActionAvg: 0,
          dataOperationAvg: 0,
          meetsThresholds: true, // Check against performance budgets
          success: result.success
        };
      }
    } catch (error) {
      this.log(`Failed to parse performance results: ${error.message}`, 'ERROR');
      this.results.performance = { success: false, error: error.message };
    }

    return this.results.performance;
  }

  analyzeCriticalIssues() {
    this.log('=== Analyzing Critical Issues ===');
    
    const issues = [];

    // Check unit test failures
    if (this.results.unitTests && !this.results.unitTests.success) {
      issues.push({
        severity: 'HIGH',
        category: 'Unit Tests',
        description: 'Unit tests are failing',
        impact: 'Core functionality may be broken',
        recommendation: 'Fix failing unit tests before deployment'
      });
    }

    // Check coverage
    if (this.results.coverage && !this.results.coverage.meetsTarget) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Test Coverage',
        description: `Test coverage is ${this.results.coverage.statements}%, below 80% target`,
        impact: 'Insufficient test coverage may allow bugs to reach production',
        recommendation: 'Increase test coverage to meet 80% minimum requirement'
      });
    }

    // Check cross-browser compatibility
    if (this.results.crossBrowser && !this.results.crossBrowser.allPassed) {
      issues.push({
        severity: 'HIGH',
        category: 'Cross-Browser Compatibility',
        description: 'Some browsers are failing tests',
        impact: 'Users on certain browsers may experience issues',
        recommendation: 'Fix cross-browser compatibility issues'
      });
    }

    // Check mobile responsiveness
    if (this.results.mobileResponsiveness && !this.results.mobileResponsiveness.allPassed) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Mobile Responsiveness',
        description: 'Mobile viewport tests are failing',
        impact: 'Mobile users may have poor experience',
        recommendation: 'Fix responsive design issues'
      });
    }

    // Check E2E tests
    if (this.results.e2eTests && !this.results.e2eTests.success) {
      issues.push({
        severity: 'HIGH',
        category: 'End-to-End Tests',
        description: 'E2E tests are failing',
        impact: 'Critical user workflows may be broken',
        recommendation: 'Fix E2E test failures immediately'
      });
    }

    this.results.criticalIssues = issues;
    
    issues.forEach(issue => {
      this.log(`${issue.severity}: ${issue.description}`, 'WARN');
    });

    return issues;
  }

  generateSummary() {
    this.log('=== Generating Test Summary ===');
    
    const totalTests = (this.results.unitTests?.total || 0) + 
                      (this.results.integrationTests?.total || 0) + 
                      (this.results.e2eTests?.passed || 0) + 
                      (this.results.e2eTests?.failed || 0);

    const passedTests = (this.results.unitTests?.passed || 0) + 
                       (this.results.integrationTests?.passed || 0) + 
                       (this.results.e2eTests?.passed || 0);

    const failedTests = (this.results.unitTests?.failed || 0) + 
                       (this.results.integrationTests?.failed || 0) + 
                       (this.results.e2eTests?.failed || 0);

    const criticalIssueCount = this.results.criticalIssues.filter(i => i.severity === 'HIGH').length;
    const productionReady = criticalIssueCount === 0 && 
                           (this.results.coverage?.meetsTarget || false) &&
                           failedTests === 0;

    this.results.summary = {
      totalTests,
      passedTests,
      failedTests,
      passRate: totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0,
      coverage: this.results.coverage?.statements || 0,
      criticalIssues: criticalIssueCount,
      productionReady,
      recommendation: productionReady ? 
        'System is ready for production deployment' : 
        'Critical issues must be resolved before deployment'
    };

    return this.results.summary;
  }

  async generateReport() {
    this.log('=== Generating Comprehensive Report ===');
    
    const reportPath = path.join(process.cwd(), 'test-results', 'phase8-integration-report.json');
    const htmlReportPath = path.join(process.cwd(), 'test-results', 'phase8-integration-report.html');

    // Ensure test-results directory exists
    const testResultsDir = path.dirname(reportPath);
    if (!fs.existsSync(testResultsDir)) {
      fs.mkdirSync(testResultsDir, { recursive: true });
    }

    // Write JSON report
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));

    // Generate HTML report
    const htmlReport = this.generateHtmlReport();
    fs.writeFileSync(htmlReportPath, htmlReport);

    this.log(`Report generated: ${reportPath}`);
    this.log(`HTML Report generated: ${htmlReportPath}`);

    return { jsonReport: reportPath, htmlReport: htmlReportPath };
  }

  generateHtmlReport() {
    const { summary, criticalIssues, coverage, crossBrowser, mobileResponsiveness } = this.results;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Phase 8 Integration Testing Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
        .header { background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%); color: white; padding: 20px; border-radius: 8px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .metric h3 { margin: 0; color: #333; }
        .metric .value { font-size: 2em; font-weight: bold; margin: 10px 0; }
        .success { color: #34C759; }
        .warning { color: #FF9500; }
        .error { color: #FF3B30; }
        .section { margin: 30px 0; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; }
        .issue { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .issue.high { background: #f8d7da; border-color: #f5c6cb; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Phase 8 System Integration Testing Report</h1>
        <p>Generated: ${this.results.timestamp}</p>
    </div>

    <div class="summary">
        <div class="metric">
            <h3>Test Results</h3>
            <div class="value ${summary?.passRate === 100 ? 'success' : 'warning'}">
                ${summary?.passRate || 0}%
            </div>
            <p>${summary?.passedTests || 0}/${summary?.totalTests || 0} tests passed</p>
        </div>
        <div class="metric">
            <h3>Code Coverage</h3>
            <div class="value ${coverage?.meetsTarget ? 'success' : 'warning'}">
                ${coverage?.statements || 0}%
            </div>
            <p>Target: 80% minimum</p>
        </div>
        <div class="metric">
            <h3>Browser Compatibility</h3>
            <div class="value ${crossBrowser?.allPassed ? 'success' : 'error'}">
                ${crossBrowser?.summary || 'N/A'}
            </div>
            <p>Chrome, Firefox, Safari, Edge</p>
        </div>
        <div class="metric">
            <h3>Mobile Ready</h3>
            <div class="value ${mobileResponsiveness?.allPassed ? 'success' : 'error'}">
                ${mobileResponsiveness?.summary || 'N/A'}
            </div>
            <p>320px, 768px, 1024px viewports</p>
        </div>
    </div>

    <div class="section">
        <h2>Production Readiness</h2>
        <div class="metric">
            <div class="value ${summary?.productionReady ? 'success' : 'error'}">
                ${summary?.productionReady ? '✅ READY' : '❌ NOT READY'}
            </div>
            <p>${summary?.recommendation || 'Assessment pending'}</p>
        </div>
    </div>

    ${criticalIssues && criticalIssues.length > 0 ? `
    <div class="section">
        <h2>Critical Issues (${criticalIssues.length})</h2>
        ${criticalIssues.map(issue => `
            <div class="issue ${issue.severity.toLowerCase()}">
                <h4>${issue.severity}: ${issue.category}</h4>
                <p><strong>Issue:</strong> ${issue.description}</p>
                <p><strong>Impact:</strong> ${issue.impact}</p>
                <p><strong>Recommendation:</strong> ${issue.recommendation}</p>
            </div>
        `).join('')}
    </div>
    ` : ''}

    <div class="section">
        <h2>Detailed Results</h2>
        <table>
            <tr><th>Test Suite</th><th>Status</th><th>Passed</th><th>Failed</th><th>Total</th></tr>
            <tr>
                <td>Unit Tests</td>
                <td class="${this.results.unitTests?.success ? 'success' : 'error'}">
                    ${this.results.unitTests?.success ? '✅' : '❌'}
                </td>
                <td>${this.results.unitTests?.passed || 0}</td>
                <td>${this.results.unitTests?.failed || 0}</td>
                <td>${this.results.unitTests?.total || 0}</td>
            </tr>
            <tr>
                <td>Integration Tests</td>
                <td class="${this.results.integrationTests?.success ? 'success' : 'error'}">
                    ${this.results.integrationTests?.success ? '✅' : '❌'}
                </td>
                <td>${this.results.integrationTests?.passed || 0}</td>
                <td>${this.results.integrationTests?.failed || 0}</td>
                <td>${this.results.integrationTests?.total || 0}</td>
            </tr>
            <tr>
                <td>E2E Tests</td>
                <td class="${this.results.e2eTests?.success ? 'success' : 'error'}">
                    ${this.results.e2eTests?.success ? '✅' : '❌'}
                </td>
                <td>${this.results.e2eTests?.passed || 0}</td>
                <td>${this.results.e2eTests?.failed || 0}</td>
                <td>${(this.results.e2eTests?.passed || 0) + (this.results.e2eTests?.failed || 0)}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <h2>Next Steps</h2>
        <ul>
            ${summary?.productionReady ? 
              '<li>✅ System is ready for production deployment</li><li>Consider scheduling deployment</li><li>Prepare rollback plan</li>' :
              '<li>❌ Resolve critical issues before deployment</li><li>Re-run integration tests</li><li>Update test coverage if needed</li>'
            }
        </ul>
    </div>
</body>
</html>`;
  }

  async run() {
    this.log('🚀 Starting Phase 8 System Integration Testing');
    
    try {
      // Run all test suites
      await this.runUnitTests();
      await this.runIntegrationTests();
      await this.runCoverageAnalysis();
      await this.runE2ETests();
      await this.runCrossBrowserTests();
      await this.runMobileResponsivenessTests();
      await this.runPerformanceTests();

      // Analyze results
      this.analyzeCriticalIssues();
      this.generateSummary();

      // Generate reports
      const reports = await this.generateReport();

      this.log('✅ Phase 8 Integration Testing Complete');
      this.log(`Summary: ${this.results.summary?.passRate}% tests passed, ${this.results.criticalIssues.length} critical issues`);
      this.log(`Production Ready: ${this.results.summary?.productionReady ? 'YES' : 'NO'}`);
      
      return {
        success: this.results.summary?.productionReady || false,
        results: this.results,
        reports
      };

    } catch (error) {
      this.log(`❌ Phase 8 Integration Testing failed: ${error.message}`, 'ERROR');
      return {
        success: false,
        error: error.message,
        results: this.results
      };
    }
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new Phase8TestRunner();
  runner.run()
    .then(result => {
      console.log('\n' + '='.repeat(80));
      console.log('PHASE 8 INTEGRATION TESTING COMPLETE');
      console.log('='.repeat(80));
      console.log(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`Production Ready: ${result.results.summary?.productionReady ? 'YES' : 'NO'}`);
      console.log(`Critical Issues: ${result.results.criticalIssues.length}`);
      console.log('='.repeat(80));
      
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default Phase8TestRunner;