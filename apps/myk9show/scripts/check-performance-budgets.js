#!/usr/bin/env node

/**
 * Performance Budget Check Script
 * 
 * Runs after the build process to check bundle sizes and other
 * build-time metrics against performance budgets.
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// Performance budgets (should match TypeScript definitions)
const PERFORMANCE_BUDGETS = {
  bundle_size_total: { threshold: 5000, unit: 'KB', severity: 'error' },
  bundle_size_js: { threshold: 3000, unit: 'KB', severity: 'error' },
  bundle_size_css: { threshold: 500, unit: 'KB', severity: 'warning' },
  chunk_size_max: { threshold: 1000, unit: 'KB', severity: 'warning' },
  chunk_count: { threshold: 50, unit: 'count', severity: 'warning' },
};

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

class PerformanceBudgetChecker {
  constructor(distDir = 'dist') {
    this.distDir = distDir;
    this.violations = [];
    this.metrics = {};
  }

  /**
   * Run all performance budget checks
   */
  async run() {
    console.log(`${colors.cyan}🔍 Checking performance budgets...${colors.reset}`);
    
    try {
      // Collect metrics
      await this.collectBundleMetrics();
      
      // Check budgets
      this.checkBudgets();
      
      // Generate report
      this.generateReport();
      
      // Exit with appropriate code
      const hasErrors = this.violations.some(v => v.severity === 'error');
      if (hasErrors) {
        console.log(`${colors.red}❌ Performance budget checks failed${colors.reset}`);
        process.exit(1);
      } else {
        console.log(`${colors.green}✅ All performance budgets passed${colors.reset}`);
        process.exit(0);
      }
      
    } catch (error) {
      console.error(`${colors.red}❌ Error checking performance budgets:${colors.reset}`, error.message);
      process.exit(1);
    }
  }

  /**
   * Collect bundle size and count metrics
   */
  async collectBundleMetrics() {
    if (!fs.existsSync(this.distDir)) {
      throw new Error(`Build directory '${this.distDir}' not found. Run build first.`);
    }

    // Find all asset files
    const assetPattern = path.join(this.distDir, '**/*.{js,css,png,jpg,jpeg,gif,svg,webp,woff,woff2,ttf}');
    const assetFiles = glob.sync(assetPattern);

    let totalSize = 0;
    let jsSize = 0;
    let cssSize = 0;
    let imageSize = 0;
    let maxChunkSize = 0;
    const chunkSizes = [];

    for (const file of assetFiles) {
      const stats = fs.statSync(file);
      const sizeKB = stats.size / 1024;
      const ext = path.extname(file).toLowerCase();
      
      totalSize += sizeKB;
      chunkSizes.push({ file: path.relative(this.distDir, file), size: sizeKB });
      maxChunkSize = Math.max(maxChunkSize, sizeKB);

      if (ext === '.js') {
        jsSize += sizeKB;
      } else if (ext === '.css') {
        cssSize += sizeKB;
      } else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
        imageSize += sizeKB;
      }
    }

    this.metrics = {
      bundle_size_total: totalSize,
      bundle_size_js: jsSize,
      bundle_size_css: cssSize,
      bundle_size_images: imageSize,
      chunk_size_max: maxChunkSize,
      chunk_count: assetFiles.length,
    };

    // Store detailed chunk information
    this.chunkSizes = chunkSizes.sort((a, b) => b.size - a.size);

    console.log(`📊 Bundle metrics collected:`);
    console.log(`  Total size: ${totalSize.toFixed(2)} KB`);
    console.log(`  JS size: ${jsSize.toFixed(2)} KB`);
    console.log(`  CSS size: ${cssSize.toFixed(2)} KB`);
    console.log(`  Image size: ${imageSize.toFixed(2)} KB`);
    console.log(`  Largest chunk: ${maxChunkSize.toFixed(2)} KB`);
    console.log(`  Total chunks: ${assetFiles.length}`);
  }

  /**
   * Check metrics against budgets
   */
  checkBudgets() {
    for (const [metric, budget] of Object.entries(PERFORMANCE_BUDGETS)) {
      const value = this.metrics[metric];
      
      if (value > budget.threshold) {
        this.violations.push({
          metric,
          value: value,
          threshold: budget.threshold,
          unit: budget.unit,
          severity: budget.severity,
          excess: value - budget.threshold,
        });
      }
    }
  }

  /**
   * Generate detailed report
   */
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log(`${colors.cyan}📋 PERFORMANCE BUDGET REPORT${colors.reset}`);
    console.log('='.repeat(60));

    // Summary
    const errorCount = this.violations.filter(v => v.severity === 'error').length;
    const warningCount = this.violations.filter(v => v.severity === 'warning').length;

    console.log(`\n📊 Summary:`);
    console.log(`  Total checks: ${Object.keys(PERFORMANCE_BUDGETS).length}`);
    console.log(`  Violations: ${this.violations.length}`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Warnings: ${warningCount}`);

    // Budget status
    console.log(`\n📏 Budget Status:`);
    for (const [metric, budget] of Object.entries(PERFORMANCE_BUDGETS)) {
      const value = this.metrics[metric];
      const status = value <= budget.threshold ? 'PASS' : 'FAIL';
      const color = value <= budget.threshold ? colors.green : 
                   budget.severity === 'error' ? colors.red : colors.yellow;
      
      console.log(`  ${color}${status}${colors.reset} ${metric}: ${value.toFixed(2)} ${budget.unit} (limit: ${budget.threshold} ${budget.unit})`);
    }

    // Violations details
    if (this.violations.length > 0) {
      console.log(`\n🚨 Violations:`);
      this.violations.forEach((violation, index) => {
        const color = violation.severity === 'error' ? colors.red : colors.yellow;
        const emoji = violation.severity === 'error' ? '❌' : '⚠️';
        
        console.log(`  ${emoji} ${color}[${violation.severity.toUpperCase()}]${colors.reset} ${violation.metric}`);
        console.log(`     Value: ${violation.value.toFixed(2)} ${violation.unit}`);
        console.log(`     Limit: ${violation.threshold} ${violation.unit}`);
        console.log(`     Excess: ${violation.excess.toFixed(2)} ${violation.unit}`);
        
        if (index < this.violations.length - 1) {
          console.log('');
        }
      });
    }

    // Largest chunks (if relevant)
    if (this.chunkSizes.length > 0) {
      console.log(`\n📦 Largest Chunks:`);
      this.chunkSizes.slice(0, 10).forEach((chunk, index) => {
        const sizeColor = chunk.size > 500 ? colors.yellow : colors.reset;
        console.log(`  ${index + 1}. ${sizeColor}${chunk.file} (${chunk.size.toFixed(2)} KB)${colors.reset}`);
      });
    }

    // Recommendations
    if (this.violations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      
      const hasBundleSizeIssues = this.violations.some(v => 
        ['bundle_size_total', 'bundle_size_js', 'chunk_size_max'].includes(v.metric)
      );
      
      if (hasBundleSizeIssues) {
        console.log(`  • Consider code splitting to reduce bundle size`);
        console.log(`  • Use dynamic imports for non-critical features`);
        console.log(`  • Analyze bundle composition with tools like webpack-bundle-analyzer`);
        console.log(`  • Remove unused dependencies and tree-shake effectively`);
      }

      const hasAssetIssues = this.violations.some(v => v.metric === 'bundle_size_images');
      if (hasAssetIssues) {
        console.log(`  • Optimize images (use WebP, reduce sizes, lazy loading)`);
        console.log(`  • Consider using a CDN for static assets`);
      }

      const hasChunkIssues = this.violations.some(v => v.metric === 'chunk_count');
      if (hasChunkIssues) {
        console.log(`  • Review code splitting strategy to reduce chunk count`);
        console.log(`  • Combine smaller chunks where appropriate`);
      }
    }

    // Save report to file
    this.saveReportToFile();
  }

  /**
   * Save detailed report to JSON file
   */
  saveReportToFile() {
    const report = {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      violations: this.violations,
      budgets: PERFORMANCE_BUDGETS,
      summary: {
        total_checks: Object.keys(PERFORMANCE_BUDGETS).length,
        violations: this.violations.length,
        errors: this.violations.filter(v => v.severity === 'error').length,
        warnings: this.violations.filter(v => v.severity === 'warning').length,
      },
      largest_chunks: this.chunkSizes.slice(0, 20),
    };

    const reportPath = path.join(this.distDir, 'performance-budget-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }
}

// Run the checker if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const distDir = process.argv[2] || 'dist';
  const checker = new PerformanceBudgetChecker(distDir);
  checker.run();
}

export default PerformanceBudgetChecker;