#!/usr/bin/env node

/**
 * Visual Test Management Script
 * 
 * This script helps manage visual regression test baselines and provides
 * utilities for reviewing, approving, and updating visual test screenshots.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class VisualTestManager {
  constructor() {
    this.testResultsDir = path.join(process.cwd(), 'test-results');
    this.baselineDir = path.join(this.testResultsDir, 'visual-baselines');
    this.actualDir = path.join(this.testResultsDir, 'visual-actual');
    this.diffDir = path.join(this.testResultsDir, 'visual-diffs');
    this.reportDir = path.join(this.testResultsDir, 'visual-reports');
    
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.baselineDir, this.actualDir, this.diffDir, this.reportDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Generate a visual test report
   */
  generateReport() {
    console.log('📊 Generating visual test report...');
    
    const actualFiles = this.getFiles(this.actualDir);
    const diffFiles = this.getFiles(this.diffDir);
    const baselineFiles = this.getFiles(this.baselineDir);
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: baselineFiles.length,
        passed: actualFiles.length - diffFiles.length,
        failed: diffFiles.length,
        new: actualFiles.filter(f => !baselineFiles.includes(f)).length
      },
      details: {
        passed: actualFiles.filter(f => !diffFiles.includes(f)),
        failed: diffFiles,
        new: actualFiles.filter(f => !baselineFiles.includes(f))
      }
    };

    // Generate HTML report
    const htmlReport = this.generateHTMLReport(report);
    const reportPath = path.join(this.reportDir, `visual-report-${Date.now()}.html`);
    fs.writeFileSync(reportPath, htmlReport);
    
    // Generate JSON report
    const jsonReportPath = path.join(this.reportDir, 'latest-report.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));
    
    console.log(`✅ Report generated: ${reportPath}`);
    console.log(`📋 Summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.new} new`);
    
    return reportPath;
  }

  generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Visual Regression Test Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f7;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
            background: white;
            padding: 30px;
            border-radius: 12px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .stat-number { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
        .stat-label { color: #666; font-size: 0.9em; }
        .passed { color: #34c759; }
        .failed { color: #ff3b30; }
        .new { color: #007aff; }
        .section {
            background: white;
            margin-bottom: 20px;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .section-header {
            background: #f8f9fa;
            padding: 20px;
            border-bottom: 1px solid #e9ecef;
            font-weight: 600;
        }
        .section-content { padding: 20px; }
        .test-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }
        .test-item {
            border: 1px solid #e9ecef;
            border-radius: 8px;
            overflow: hidden;
        }
        .test-header {
            padding: 15px;
            background: #f8f9fa;
            font-weight: 500;
            font-size: 0.9em;
        }
        .test-images {
            display: flex;
            justify-content: space-between;
        }
        .test-images img {
            width: 100%;
            height: auto;
            max-width: 100px;
        }
        .commands {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .command {
            background: #2d3748;
            color: white;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            margin: 5px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎨 Visual Regression Test Report</h1>
            <p>Generated on: ${report.timestamp}</p>
            <p>MyK9Show Application - Comprehensive Visual Testing</p>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${report.summary.total}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat-card">
                <div class="stat-number passed">${report.summary.passed}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number failed">${report.summary.failed}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number new">${report.summary.new}</div>
                <div class="stat-label">New</div>
            </div>
        </div>

        ${report.summary.failed > 0 ? `
        <div class="section">
            <div class="section-header failed">❌ Failed Tests (${report.summary.failed})</div>
            <div class="section-content">
                <div class="test-grid">
                    ${report.details.failed.map(test => `
                        <div class="test-item">
                            <div class="test-header">${test}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        ` : ''}

        <div class="commands">
            <h3>🛠️ Management Commands</h3>
            <div class="command">npm run test:visual</div>
            <p>Run all visual regression tests</p>
            
            <div class="command">npm run test:visual:update</div>
            <p>Update all baselines with current screenshots</p>
            
            <div class="command">npm run test:visual:report</div>
            <p>Generate this visual test report</p>
            
            <div class="command">npm run test:visual:clean</div>
            <p>Clean up test artifacts</p>
            
            <div class="command">playwright test --project=visual-chromium</div>
            <p>Run visual tests on Chromium only</p>
            
            <div class="command">playwright test --update-snapshots</div>
            <p>Update specific failing snapshots</p>
        </div>

        <div class="section">
            <div class="section-header">📝 Test Coverage</div>
            <div class="section-content">
                <ul>
                    <li><strong>Core Components:</strong> Dog registration, show management, user interfaces</li>
                    <li><strong>Responsive Design:</strong> Mobile (320px-768px), Tablet (768px-1024px), Desktop (1024px+)</li>
                    <li><strong>Cross-Browser:</strong> Chrome, Firefox, Safari, Edge</li>
                    <li><strong>Theme Variations:</strong> Light and dark modes</li>
                    <li><strong>Component States:</strong> Loading, error, empty, success, interactive</li>
                    <li><strong>Integration Flows:</strong> Complete user workflows and form submissions</li>
                </ul>
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Update baselines with current screenshots
   */
  updateBaselines(testNames = null) {
    console.log('🔄 Updating visual test baselines...');
    
    if (!fs.existsSync(this.actualDir)) {
      console.log('❌ No actual screenshots found. Run tests first.');
      return;
    }

    const actualFiles = this.getFiles(this.actualDir);
    let updated = 0;

    for (const file of actualFiles) {
      if (!testNames || testNames.some(name => file.includes(name))) {
        const actualPath = path.join(this.actualDir, file);
        const baselinePath = path.join(this.baselineDir, file);
        
        fs.copyFileSync(actualPath, baselinePath);
        updated++;
        
        // Remove diff if it exists
        const diffPath = path.join(this.diffDir, file);
        if (fs.existsSync(diffPath)) {
          fs.unlinkSync(diffPath);
        }
      }
    }

    console.log(`✅ Updated ${updated} baseline images`);
  }

  /**
   * Clean up test artifacts
   */
  cleanup() {
    console.log('🧹 Cleaning up visual test artifacts...');
    
    [this.actualDir, this.diffDir].forEach(dir => {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          fs.unlinkSync(path.join(dir, file));
        });
        console.log(`🗑️  Cleaned ${files.length} files from ${path.basename(dir)}`);
      }
    });
  }

  /**
   * List all visual tests
   */
  listTests() {
    console.log('📝 Visual Test Inventory:');
    
    const baselineFiles = this.getFiles(this.baselineDir);
    const actualFiles = this.getFiles(this.actualDir);
    const diffFiles = this.getFiles(this.diffDir);
    
    console.log(`\n📊 Statistics:`);
    console.log(`   Baseline images: ${baselineFiles.length}`);
    console.log(`   Recent test runs: ${actualFiles.length}`);
    console.log(`   Failed comparisons: ${diffFiles.length}`);
    
    if (diffFiles.length > 0) {
      console.log(`\n❌ Failed Tests:`);
      diffFiles.forEach(file => console.log(`   - ${file}`));
    }
  }

  /**
   * Get all PNG files from a directory
   */
  getFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.png'));
  }

  /**
   * Run specific visual test suites
   */
  runTests(suite = 'all') {
    console.log(`🧪 Running visual tests: ${suite}`);
    
    const commands = {
      all: 'playwright test src/test/e2e/visual/',
      comprehensive: 'playwright test src/test/e2e/visual/comprehensive-visual-regression.spec.ts',
      responsive: 'playwright test src/test/e2e/visual/responsive-design.spec.ts',
      'cross-browser': 'playwright test src/test/e2e/visual/cross-browser.spec.ts',
      themes: 'playwright test src/test/e2e/visual/theme-variations.spec.ts',
      flows: 'playwright test src/test/e2e/visual/integration-flows.spec.ts'
    };

    const command = commands[suite] || commands.all;
    
    try {
      execSync(command, { stdio: 'inherit' });
      console.log('✅ Visual tests completed');
    } catch (error) {
      console.log('❌ Some visual tests failed');
      console.log('📊 Run "npm run test:visual:report" to see details');
    }
  }
}

// CLI interface
const manager = new VisualTestManager();
const command = process.argv[2];

switch (command) {
  case 'report':
    manager.generateReport();
    break;
    
  case 'update':
    manager.updateBaselines();
    break;
    
  case 'clean':
    manager.cleanup();
    break;
    
  case 'list':
    manager.listTests();
    break;
    
  case 'run':
    const suite = process.argv[3] || 'all';
    manager.runTests(suite);
    break;
    
  default:
    console.log('🎨 Visual Test Manager');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/visual-test-manager.js report    # Generate test report');
    console.log('  node scripts/visual-test-manager.js update    # Update baselines');
    console.log('  node scripts/visual-test-manager.js clean     # Clean artifacts');
    console.log('  node scripts/visual-test-manager.js list      # List all tests');
    console.log('  node scripts/visual-test-manager.js run [suite] # Run tests');
    console.log('');
    console.log('Test suites: all, comprehensive, responsive, cross-browser, themes, flows');
}

module.exports = VisualTestManager;