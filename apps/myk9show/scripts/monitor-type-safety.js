#!/usr/bin/env node

/**
 * TypeScript Type Safety Monitor
 * Runs periodic checks and generates reports on type safety status
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const MONITORING_LOG = 'logs/type-safety-monitor.log';
const REPORT_FILE = 'reports/type-safety-report.json';

class TypeSafetyMonitor {
  constructor() {
    this.timestamp = new Date().toISOString();
    this.results = {
      timestamp: this.timestamp,
      status: 'unknown',
      errorCount: 0,
      errors: [],
      metrics: {},
      recommendations: []
    };
  }

  async runCheck() {
    console.log('🔍 Running TypeScript type safety check...');
    
    try {
      // Run TypeScript check
      const output = execSync('npm run typecheck', { 
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      this.results.status = 'passing';
      this.results.errorCount = 0;
      console.log('✅ Type safety check passed!');
      
    } catch (error) {
      this.results.status = 'failing';
      const errorOutput = error.stdout || error.stderr || '';
      this.parseErrors(errorOutput);
      console.log(`❌ Found ${this.results.errorCount} type errors`);
    }

    await this.generateMetrics();
    await this.generateRecommendations();
    await this.saveReport();
    await this.logResult();
  }

  parseErrors(output) {
    const lines = output.split('\n').filter(line => line.includes('error TS'));
    this.results.errorCount = lines.length;
    
    this.results.errors = lines.map(line => {
      const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
      if (match) {
        return {
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          code: match[4],
          message: match[5]
        };
      }
      return { raw: line };
    });
  }

  async generateMetrics() {
    try {
      // Count TypeScript files
      const tsFiles = execSync('find src -name "*.ts" -o -name "*.tsx" | wc -l', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();

      // Get bundle size
      let bundleSize = 'unknown';
      try {
        const stats = execSync('npm run analyze:size 2>/dev/null || echo "unknown"', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        bundleSize = stats.includes('unknown') ? 'unknown' : stats.trim();
      } catch (e) {
        // Bundle analysis not available
      }

      this.results.metrics = {
        typeScriptFiles: parseInt(tsFiles) || 0,
        errorDensity: this.results.errorCount / (parseInt(tsFiles) || 1),
        bundleSize,
        timestamp: this.timestamp
      };
    } catch (error) {
      console.warn('⚠️ Could not generate all metrics:', error.message);
    }
  }

  async generateRecommendations() {
    const recommendations = [];

    if (this.results.errorCount > 0) {
      recommendations.push({
        priority: 'high',
        type: 'fix_errors',
        message: `Fix ${this.results.errorCount} TypeScript errors immediately`,
        action: 'npm run typecheck'
      });
    }

    // Check for common error patterns
    const errorCodes = this.results.errors.map(e => e.code).filter(Boolean);
    const commonCodes = [...new Set(errorCodes)];
    
    if (commonCodes.includes('TS2322')) {
      recommendations.push({
        priority: 'medium',
        type: 'type_alignment',
        message: 'Multiple type assignment errors detected - review interface definitions',
        action: 'Review and align TypeScript interfaces with actual data structures'
      });
    }

    if (commonCodes.includes('TS2345')) {
      recommendations.push({
        priority: 'medium',
        type: 'parameter_types',
        message: 'Function parameter type mismatches detected',
        action: 'Review function signatures and parameter types'
      });
    }

    if (this.results.errorCount === 0) {
      recommendations.push({
        priority: 'low',
        type: 'maintenance',
        message: 'Type safety is excellent! Consider upgrading TypeScript for latest features',
        action: 'npm update typescript @types/node'
      });
    }

    this.results.recommendations = recommendations;
  }

  async saveReport() {
    try {
      // Ensure reports directory exists
      execSync('mkdir -p reports', { stdio: 'ignore' });
      
      // Load previous reports
      let history = [];
      if (existsSync(REPORT_FILE)) {
        try {
          const existingData = readFileSync(REPORT_FILE, 'utf8');
          const existingReport = JSON.parse(existingData);
          history = Array.isArray(existingReport) ? existingReport : [existingReport];
        } catch (e) {
          console.warn('⚠️ Could not parse existing report file');
        }
      }

      // Add current result
      history.push(this.results);
      
      // Keep only last 30 days of reports
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      history = history.filter(report => new Date(report.timestamp) > thirtyDaysAgo);

      writeFileSync(REPORT_FILE, JSON.stringify(history, null, 2));
      console.log(`📊 Report saved to ${REPORT_FILE}`);
    } catch (error) {
      console.warn('⚠️ Could not save report:', error.message);
    }
  }

  async logResult() {
    try {
      execSync('mkdir -p logs', { stdio: 'ignore' });
      
      const logEntry = `${this.timestamp} | Status: ${this.results.status} | Errors: ${this.results.errorCount}\n`;
      
      if (existsSync(MONITORING_LOG)) {
        const existingLog = readFileSync(MONITORING_LOG, 'utf8');
        writeFileSync(MONITORING_LOG, existingLog + logEntry);
      } else {
        writeFileSync(MONITORING_LOG, logEntry);
      }
    } catch (error) {
      console.warn('⚠️ Could not write to log file:', error.message);
    }
  }

  printSummary() {
    console.log('\n📋 Type Safety Summary:');
    console.log('========================');
    console.log(`Status: ${this.results.status === 'passing' ? '✅ PASSING' : '❌ FAILING'}`);
    console.log(`Error Count: ${this.results.errorCount}`);
    console.log(`TypeScript Files: ${this.results.metrics.typeScriptFiles}`);
    
    if (this.results.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      this.results.recommendations.forEach((rec, index) => {
        const priorityIcon = rec.priority === 'high' ? '🚨' : rec.priority === 'medium' ? '⚠️' : '💡';
        console.log(`${priorityIcon} ${rec.message}`);
        if (rec.action) {
          console.log(`   Action: ${rec.action}`);
        }
      });
    }
    
    console.log(`\n📊 Full report available in: ${REPORT_FILE}`);
  }
}

// Run the monitor
const monitor = new TypeSafetyMonitor();
monitor.runCheck()
  .then(() => {
    monitor.printSummary();
    process.exit(monitor.results.status === 'passing' ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Monitor failed:', error);
    process.exit(1);
  });