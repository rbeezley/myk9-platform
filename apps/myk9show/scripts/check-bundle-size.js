#!/usr/bin/env node

/**
 * Bundle Size Check Script
 * 
 * Checks bundle sizes against performance budgets and fails CI if exceeded.
 * Designed for continuous integration to enforce size budgets.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Performance budgets (in KB)
const BUDGETS = {
  // Individual file budgets
  mainChunk: 500,
  vendorChunk: 800,
  anyChunk: 244,      // Google Lighthouse recommendation
  cssTotal: 100,
  
  // Total budgets
  totalJs: 1200,
  totalCss: 100,
  totalAssets: 1500,
  
  // Compressed budgets (estimated)
  gzipTotal: 500,
  brotliTotal: 400
};

// File patterns for different chunk types
const CHUNK_PATTERNS = {
  main: /index-[a-f0-9]+\.js$/,
  vendor: /(vendor|chunk)-[a-f0-9]+\.js$/,
  lazy: /[a-zA-Z]+-[a-f0-9]+\.js$/
};

class BundleSizeChecker {
  constructor() {
    this.distPath = path.join(__dirname, '..', 'dist');
    this.violations = [];
    this.warnings = [];
    this.stats = {
      chunks: [],
      css: [],
      other: [],
      totals: {
        js: 0,
        css: 0,
        assets: 0
      }
    };
  }

  /**
   * Main check entry point
   */
  async check() {
    console.log('🔍 Checking bundle sizes against performance budgets...\n');

    try {
      await this.analyzeFiles();
      await this.checkBudgets();
      await this.generateReport();
      
      this.printResults();
      
      if (this.violations.length > 0) {
        console.log('\n❌ Bundle size check failed!');
        process.exit(1);
      } else {
        console.log('\n✅ All bundle sizes within budget!');
        process.exit(0);
      }
      
    } catch (error) {
      console.error('❌ Bundle size check failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Analyze all files in the dist directory
   */
  async analyzeFiles() {
    if (!fs.existsSync(this.distPath)) {
      throw new Error('Build directory not found. Run "npm run build" first.');
    }

    const files = this.getFilesRecursively(this.distPath);
    
    for (const file of files) {
      const stats = fs.statSync(file);
      const relativePath = path.relative(this.distPath, file);
      const extension = path.extname(file);
      const sizeKB = Math.round(stats.size / 1024 * 100) / 100;
      
      const fileInfo = {
        name: relativePath,
        path: file,
        size: stats.size,
        sizeKB,
        type: this.getFileType(extension),
        chunkType: this.getChunkType(relativePath)
      };

      // Categorize files
      if (fileInfo.type === 'javascript') {
        this.stats.chunks.push(fileInfo);
        this.stats.totals.js += stats.size;
      } else if (fileInfo.type === 'css') {
        this.stats.css.push(fileInfo);
        this.stats.totals.css += stats.size;
      } else {
        this.stats.other.push(fileInfo);
      }
      
      this.stats.totals.assets += stats.size;
    }

    // Sort by size
    this.stats.chunks.sort((a, b) => b.size - a.size);
    this.stats.css.sort((a, b) => b.size - a.size);
  }

  /**
   * Check all budget constraints
   */
  async checkBudgets() {
    // Check individual JavaScript chunks
    for (const chunk of this.stats.chunks) {
      if (chunk.chunkType === 'main' && chunk.sizeKB > BUDGETS.mainChunk) {
        this.addViolation('Main Chunk', chunk.name, chunk.sizeKB, BUDGETS.mainChunk);
      } else if (chunk.chunkType === 'vendor' && chunk.sizeKB > BUDGETS.vendorChunk) {
        this.addViolation('Vendor Chunk', chunk.name, chunk.sizeKB, BUDGETS.vendorChunk);
      } else if (chunk.sizeKB > BUDGETS.anyChunk) {
        this.addViolation('Chunk Size', chunk.name, chunk.sizeKB, BUDGETS.anyChunk);
      }
    }

    // Check total JavaScript size
    const totalJsKB = Math.round(this.stats.totals.js / 1024);
    if (totalJsKB > BUDGETS.totalJs) {
      this.addViolation('Total JavaScript', 'All JS files', totalJsKB, BUDGETS.totalJs);
    }

    // Check total CSS size
    const totalCssKB = Math.round(this.stats.totals.css / 1024);
    if (totalCssKB > BUDGETS.totalCss) {
      this.addViolation('Total CSS', 'All CSS files', totalCssKB, BUDGETS.totalCss);
    }

    // Check total assets size
    const totalAssetsKB = Math.round(this.stats.totals.assets / 1024);
    if (totalAssetsKB > BUDGETS.totalAssets) {
      this.addViolation('Total Assets', 'All files', totalAssetsKB, BUDGETS.totalAssets);
    }

    // Generate warnings for files approaching limits
    this.generateWarnings();
  }

  /**
   * Generate warnings for files near budget limits
   */
  generateWarnings() {
    const WARNING_THRESHOLD = 0.8; // 80% of budget

    for (const chunk of this.stats.chunks) {
      const budgetLimit = chunk.chunkType === 'main' ? BUDGETS.mainChunk :
                         chunk.chunkType === 'vendor' ? BUDGETS.vendorChunk :
                         BUDGETS.anyChunk;
      
      const warningLimit = budgetLimit * WARNING_THRESHOLD;
      
      if (chunk.sizeKB > warningLimit && chunk.sizeKB <= budgetLimit) {
        this.warnings.push({
          type: 'Approaching Limit',
          file: chunk.name,
          size: chunk.sizeKB,
          limit: budgetLimit,
          percentage: Math.round((chunk.sizeKB / budgetLimit) * 100)
        });
      }
    }
  }

  /**
   * Add a budget violation
   */
  addViolation(type, file, actual, budget) {
    this.violations.push({
      type,
      file,
      actual,
      budget,
      excess: actual - budget,
      percentage: Math.round((actual / budget) * 100)
    });
  }

  /**
   * Generate detailed report
   */
  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      budgets: BUDGETS,
      results: {
        passed: this.violations.length === 0,
        violations: this.violations.length,
        warnings: this.warnings.length
      },
      stats: {
        totalSizeKB: Math.round(this.stats.totals.assets / 1024),
        jsSizeKB: Math.round(this.stats.totals.js / 1024),
        cssSizeKB: Math.round(this.stats.totals.css / 1024),
        chunkCount: this.stats.chunks.length,
        largestChunk: this.stats.chunks[0] || null
      },
      violations: this.violations,
      warnings: this.warnings,
      chunks: this.stats.chunks.slice(0, 10) // Top 10 chunks
    };

    const reportPath = path.join(this.distPath, 'size-check-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  /**
   * Print results to console
   */
  printResults() {
    console.log('📊 Bundle Size Analysis:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Summary stats
    console.log(`📦 Total Size: ${Math.round(this.stats.totals.assets / 1024)}KB (Budget: ${BUDGETS.totalAssets}KB)`);
    console.log(`🟨 JavaScript: ${Math.round(this.stats.totals.js / 1024)}KB (Budget: ${BUDGETS.totalJs}KB)`);
    console.log(`🟦 CSS: ${Math.round(this.stats.totals.css / 1024)}KB (Budget: ${BUDGETS.totalCss}KB)`);
    console.log(`📄 Chunks: ${this.stats.chunks.length}`);

    // Largest chunks
    if (this.stats.chunks.length > 0) {
      console.log('\n🔍 Largest Chunks:');
      this.stats.chunks.slice(0, 5).forEach((chunk, index) => {
        const status = this.isChunkViolation(chunk) ? '❌' : '✅';
        console.log(`   ${status} ${chunk.name}: ${chunk.sizeKB}KB`);
      });
    }

    // Violations
    if (this.violations.length > 0) {
      console.log('\n❌ Budget Violations:');
      this.violations.forEach((violation, index) => {
        console.log(`   ${index + 1}. ${violation.type}: ${violation.file}`);
        console.log(`      Size: ${violation.actual}KB (${violation.percentage}% of budget)`);
        console.log(`      Budget: ${violation.budget}KB`);
        console.log(`      Excess: +${violation.excess}KB`);
      });
    }

    // Warnings
    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      this.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning.file}: ${warning.size}KB (${warning.percentage}% of budget)`);
      });
    }

    console.log('\n💡 Optimization Tips:');
    if (this.violations.length > 0 || this.warnings.length > 0) {
      console.log('   • Use dynamic imports for large features');
      console.log('   • Consider replacing heavy dependencies');
      console.log('   • Enable tree shaking and dead code elimination');
      console.log('   • Use React.lazy() for component code splitting');
      console.log('   • Optimize images and assets');
    } else {
      console.log('   • Bundle sizes are optimal!');
      console.log('   • Continue monitoring with each build');
    }
  }

  /**
   * Check if a chunk violates its budget
   */
  isChunkViolation(chunk) {
    return this.violations.some(v => v.file === chunk.name);
  }

  /**
   * Helper methods
   */
  getFilesRecursively(dir) {
    const files = [];
    
    function readDir(currentDir) {
      const entries = fs.readdirSync(currentDir);
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          readDir(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    }
    
    readDir(dir);
    return files;
  }

  getFileType(extension) {
    const ext = extension.toLowerCase().replace('.', '');
    
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return 'javascript';
    if (['css', 'scss', 'sass', 'less'].includes(ext)) return 'css';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
    if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) return 'font';
    
    return 'other';
  }

  getChunkType(filename) {
    if (CHUNK_PATTERNS.main.test(filename)) return 'main';
    if (CHUNK_PATTERNS.vendor.test(filename)) return 'vendor';
    if (CHUNK_PATTERNS.lazy.test(filename) && filename.includes('assets/scripts/')) return 'lazy';
    return 'unknown';
  }
}

// Run check if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new BundleSizeChecker();
  checker.check();
}

export default BundleSizeChecker;