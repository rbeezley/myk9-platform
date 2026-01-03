#!/usr/bin/env node

/**
 * Phase 8 Performance Testing Runner
 * 
 * Orchestrates comprehensive performance testing and optimization:
 * - Pre-test system validation
 * - Bundle analysis and optimization
 * - Load testing with 100+ concurrent users
 * - Memory leak detection
 * - Core Web Vitals validation
 * - Performance report generation
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

class Phase8PerformanceRunner {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.distPath = path.join(this.projectRoot, 'dist');
    this.results = {
      systemValidation: false,
      bundleOptimization: false,
      loadTesting: false,
      memoryTesting: false,
      webVitalsTesting: false,
      errors: [],
      metrics: {}
    };
    this.startTime = Date.now();
  }

  /**
   * Run complete Phase 8 performance testing suite
   */
  async run(options = {}) {
    console.log(`${colors.cyan}${colors.bold}🚀 Phase 8 Performance Testing Suite${colors.reset}`);
    console.log(`${colors.cyan}════════════════════════════════════════${colors.reset}\n`);

    try {
      // Step 1: System validation
      await this.validateSystem();

      // Step 2: Bundle optimization
      await this.runBundleOptimization();

      // Step 3: Start development server
      const serverProcess = await this.startDevServer();

      try {
        // Step 4: Core Web Vitals testing
        await this.runWebVitalsTesting();

        // Step 5: Load testing
        await this.runLoadTesting();

        // Step 6: Memory testing
        await this.runMemoryTesting();

        // Step 7: Generate comprehensive report
        await this.generateFinalReport();

      } finally {
        // Clean up server
        if (serverProcess) {
          serverProcess.kill('SIGTERM');
          console.log(`${colors.yellow}🔄 Development server stopped${colors.reset}`);
        }
      }

      console.log(`${colors.green}${colors.bold}✅ Phase 8 Performance Testing Complete!${colors.reset}`);
      console.log(`${colors.green}Total time: ${this.formatDuration(Date.now() - this.startTime)}${colors.reset}\n`);

      // Exit with appropriate code
      const hasErrors = this.results.errors.length > 0;
      process.exit(hasErrors ? 1 : 0);

    } catch (error) {
      console.error(`${colors.red}${colors.bold}❌ Phase 8 Performance Testing Failed:${colors.reset}`);
      console.error(`${colors.red}${error.message}${colors.reset}`);
      process.exit(1);
    }
  }

  /**
   * Validate system prerequisites
   */
  async validateSystem() {
    console.log(`${colors.blue}🔍 Step 1: System Validation${colors.reset}`);
    console.log('─'.repeat(50));

    try {
      // Check Node.js version
      const nodeVersion = process.version;
      console.log(`✓ Node.js version: ${nodeVersion}`);

      // Check npm version
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      console.log(`✓ npm version: ${npmVersion}`);

      // Check TypeScript compilation
      console.log('🔄 Checking TypeScript compilation...');
      execSync('npm run typecheck', { 
        cwd: this.projectRoot,
        stdio: 'pipe'
      });
      console.log('✓ TypeScript compilation successful');

      // Check available memory
      const totalMemory = process.memoryUsage();
      console.log(`✓ Available memory: ${Math.round(totalMemory.heapTotal / 1024 / 1024)}MB`);

      // Check disk space
      const stats = fs.statSync(this.projectRoot);
      console.log(`✓ Project directory accessible`);

      // Validate Playwright installation
      try {
        execSync('npx playwright --version', { 
          cwd: this.projectRoot,
          stdio: 'pipe'
        });
        console.log('✓ Playwright is installed');
      } catch (error) {
        throw new Error('Playwright not found. Run "npx playwright install"');
      }

      this.results.systemValidation = true;
      console.log(`${colors.green}✅ System validation passed${colors.reset}\n`);

    } catch (error) {
      this.results.errors.push(`System validation failed: ${error.message}`);
      throw new Error(`System validation failed: ${error.message}`);
    }
  }

  /**
   * Run bundle optimization
   */
  async runBundleOptimization() {
    console.log(`${colors.blue}📦 Step 2: Bundle Optimization${colors.reset}`);
    console.log('─'.repeat(50));

    try {
      // Run bundle optimizer
      console.log('🔄 Running bundle optimization...');
      execSync('node scripts/phase8-bundle-optimizer.js', {
        cwd: this.projectRoot,
        stdio: 'inherit'
      });

      // Verify reports were generated
      const reportPath = path.join(this.distPath, 'phase8-bundle-optimization-report.json');
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        this.results.metrics.bundle = report.summary;
        console.log(`${colors.green}✅ Bundle optimization completed${colors.reset}`);
        console.log(`   Bundle size: ${report.summary.bundleSizeKB}KB`);
        console.log(`   Recommendations: ${report.summary.recommendationCount}`);
      } else {
        console.warn(`${colors.yellow}⚠️  Bundle optimization report not found${colors.reset}`);
      }

      this.results.bundleOptimization = true;
      console.log();

    } catch (error) {
      this.results.errors.push(`Bundle optimization failed: ${error.message}`);
      console.error(`${colors.red}❌ Bundle optimization failed: ${error.message}${colors.reset}\n`);
    }
  }

  /**
   * Start development server
   */
  async startDevServer() {
    console.log(`${colors.blue}🌐 Starting Development Server${colors.reset}`);
    console.log('─'.repeat(50));

    return new Promise((resolve, reject) => {
      const serverProcess = spawn('npm', ['run', 'dev'], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let serverReady = false;
      let timeout;

      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Local:') && !serverReady) {
          serverReady = true;
          clearTimeout(timeout);
          console.log(`${colors.green}✅ Development server started${colors.reset}\n`);
          resolve(serverProcess);
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.error(`Server error: ${data}`);
      });

      serverProcess.on('error', (error) => {
        reject(new Error(`Failed to start server: ${error.message}`));
      });

      // Timeout after 60 seconds
      timeout = setTimeout(() => {
        if (!serverReady) {
          serverProcess.kill('SIGTERM');
          reject(new Error('Server startup timeout'));
        }
      }, 60000);
    });
  }

  /**
   * Run Core Web Vitals testing
   */
  async runWebVitalsTesting() {
    console.log(`${colors.blue}⚡ Step 3: Core Web Vitals Testing${colors.reset}`);
    console.log('─'.repeat(50));

    try {
      console.log('🔄 Testing Core Web Vitals...');
      execSync('npm run phase8:webvitals', {
        cwd: this.projectRoot,
        stdio: 'inherit'
      });

      this.results.webVitalsTesting = true;
      console.log(`${colors.green}✅ Core Web Vitals testing completed${colors.reset}\n`);

    } catch (error) {
      this.results.errors.push(`Web Vitals testing failed: ${error.message}`);
      console.error(`${colors.red}❌ Core Web Vitals testing failed${colors.reset}\n`);
    }
  }

  /**
   * Run load testing
   */
  async runLoadTesting() {
    console.log(`${colors.blue}👥 Step 4: Load Testing (100+ Concurrent Users)${colors.reset}`);
    console.log('─'.repeat(50));

    try {
      console.log('🔄 Running load tests with 100+ concurrent users...');
      console.log('   This may take 10-15 minutes...');
      
      execSync('npm run phase8:load-test', {
        cwd: this.projectRoot,
        stdio: 'inherit'
      });

      this.results.loadTesting = true;
      console.log(`${colors.green}✅ Load testing completed${colors.reset}\n`);

    } catch (error) {
      this.results.errors.push(`Load testing failed: ${error.message}`);
      console.error(`${colors.red}❌ Load testing failed${colors.reset}\n`);
    }
  }

  /**
   * Run memory testing
   */
  async runMemoryTesting() {
    console.log(`${colors.blue}🧠 Step 5: Memory Leak Detection${colors.reset}`);
    console.log('─'.repeat(50));

    try {
      console.log('🔄 Testing for memory leaks during extended usage...');
      execSync('npm run phase8:memory-test', {
        cwd: this.projectRoot,
        stdio: 'inherit'
      });

      this.results.memoryTesting = true;
      console.log(`${colors.green}✅ Memory testing completed${colors.reset}\n`);

    } catch (error) {
      this.results.errors.push(`Memory testing failed: ${error.message}`);
      console.error(`${colors.red}❌ Memory testing failed${colors.reset}\n`);
    }
  }

  /**
   * Generate final comprehensive report
   */
  async generateFinalReport() {
    console.log(`${colors.blue}📊 Step 6: Generating Final Report${colors.reset}`);
    console.log('─'.repeat(50));

    try {
      const report = {
        timestamp: new Date().toISOString(),
        phase: 'Phase 8 - Production Performance Validation',
        duration: this.formatDuration(Date.now() - this.startTime),
        
        testResults: {
          systemValidation: this.results.systemValidation,
          bundleOptimization: this.results.bundleOptimization,
          webVitalsTesting: this.results.webVitalsTesting,
          loadTesting: this.results.loadTesting,
          memoryTesting: this.results.memoryTesting
        },

        metrics: this.results.metrics,
        
        errors: this.results.errors,
        
        summary: {
          totalTests: 5,
          passedTests: Object.values(this.results).filter(r => r === true).length,
          errorCount: this.results.errors.length,
          overallStatus: this.results.errors.length === 0 ? 'PASSED' : 'FAILED'
        },

        recommendations: this.generateFinalRecommendations(),
        
        nextSteps: [
          'Review detailed performance reports in dist/ directory',
          'Address any high-priority optimization recommendations',
          'Set up continuous performance monitoring in CI/CD',
          'Schedule regular load testing for production readiness',
          'Monitor Core Web Vitals in production'
        ]
      };

      // Save comprehensive report
      const reportPath = path.join(this.distPath, 'phase8-final-performance-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      // Generate executive summary
      this.generateExecutiveSummary(report);

      console.log(`${colors.green}✅ Final report generated${colors.reset}`);
      console.log(`   Report saved to: ${reportPath}`);
      console.log();

    } catch (error) {
      console.error(`${colors.red}❌ Report generation failed: ${error.message}${colors.reset}`);
    }
  }

  /**
   * Generate executive summary
   */
  generateExecutiveSummary(report) {
    console.log(`${colors.magenta}${colors.bold}📋 PHASE 8 EXECUTIVE SUMMARY${colors.reset}`);
    console.log(`${colors.magenta}${'═'.repeat(60)}${colors.reset}`);
    
    const status = report.summary.overallStatus;
    const statusColor = status === 'PASSED' ? colors.green : colors.red;
    const statusIcon = status === 'PASSED' ? '✅' : '❌';
    
    console.log(`${statusIcon} Overall Status: ${statusColor}${status}${colors.reset}`);
    console.log(`📊 Tests Passed: ${report.summary.passedTests}/${report.summary.totalTests}`);
    console.log(`⏱️ Total Duration: ${report.duration}`);
    console.log(`🚨 Error Count: ${report.summary.errorCount}`);
    
    if (this.results.metrics.bundle) {
      console.log(`📦 Bundle Size: ${this.results.metrics.bundle.bundleSizeKB}KB`);
      console.log(`💡 Bundle Recommendations: ${this.results.metrics.bundle.recommendationCount}`);
    }
    
    console.log();
    
    if (report.errors.length > 0) {
      console.log(`${colors.red}🚨 CRITICAL ISSUES:${colors.reset}`);
      report.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
      console.log();
    }
    
    if (report.recommendations.length > 0) {
      console.log(`${colors.yellow}💡 TOP RECOMMENDATIONS:${colors.reset}`);
      report.recommendations.slice(0, 3).forEach((rec, index) => {
        console.log(`   ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
      });
      console.log();
    }
    
    console.log(`${colors.cyan}📄 Detailed reports available in:${colors.reset}`);
    console.log(`   • dist/phase8-final-performance-report.json`);
    console.log(`   • dist/phase8-bundle-optimization-report.json`);
    console.log(`   • dist/phase8-performance-report.json`);
    console.log();
  }

  /**
   * Generate final recommendations
   */
  generateFinalRecommendations() {
    const recommendations = [];

    if (this.results.errors.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'Critical Issues',
        title: 'Resolve failing tests',
        description: `${this.results.errors.length} tests failed and must be addressed before production deployment.`
      });
    }

    if (!this.results.loadTesting) {
      recommendations.push({
        priority: 'high',
        category: 'Load Testing',
        title: 'Complete load testing validation',
        description: 'Load testing with 100+ concurrent users must pass before production release.'
      });
    }

    if (!this.results.webVitalsTesting) {
      recommendations.push({
        priority: 'high',
        category: 'Core Web Vitals',
        title: 'Validate Core Web Vitals compliance',
        description: 'Core Web Vitals must meet production targets for optimal user experience.'
      });
    }

    recommendations.push({
      priority: 'medium',
      category: 'Monitoring',
      title: 'Set up continuous performance monitoring',
      description: 'Implement production monitoring for performance regression detection.'
    });

    recommendations.push({
      priority: 'medium',
      category: 'Optimization',
      title: 'Review bundle optimization recommendations',
      description: 'Address bundle size and code splitting recommendations for optimal performance.'
    });

    return recommendations;
  }

  /**
   * Format duration in human readable format
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

// Parse options
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.substring(2).split('=');
    options[key] = value || true;
  }
});

// Run Phase 8 performance testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new Phase8PerformanceRunner();
  runner.run(options).catch(error => {
    console.error('Performance testing failed:', error);
    process.exit(1);
  });
}

export default Phase8PerformanceRunner;