#!/usr/bin/env node

/**
 * Bundle Analysis Script
 * 
 * Analyzes the built bundle and provides detailed insights about:
 * - Bundle sizes by chunk
 * - Dependency analysis
 * - Performance recommendations
 * - Size budget compliance
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Size budget configuration (in KB)
const SIZE_BUDGETS = {
  main: 500,          // Main application chunk
  vendor: 800,        // Vendor libraries chunk
  chunk: 244,         // Individual chunks (Lighthouse recommendation)
  total: 1500,        // Total bundle size
  css: 100,           // CSS bundle size
  gzip: {
    main: 150,
    vendor: 250,
    chunk: 100,
    total: 500
  }
};

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  firstContentfulPaint: 1.5,  // seconds
  largestContentfulPaint: 2.5, // seconds
  timeToInteractive: 3.0,      // seconds
  cumulativeLayoutShift: 0.1   // score
};

class BundleAnalyzer {
  constructor() {
    this.distPath = path.join(__dirname, '..', 'dist');
    this.statsPath = path.join(this.distPath, 'stats.html');
    this.analysis = {
      chunks: [],
      assets: [],
      dependencies: {},
      recommendations: [],
      budgetViolations: [],
      totalSize: 0,
      gzippedSize: 0
    };
  }

  /**
   * Main analysis entry point
   */
  async analyze() {
    console.log('🔍 Starting bundle analysis...\n');

    try {
      await this.analyzeBundleStructure();
      await this.analyzeDependencies();
      await this.checkSizeBudgets();
      await this.generateRecommendations();
      await this.generateReport();
      
      console.log('✅ Bundle analysis complete!\n');
      
      if (this.analysis.budgetViolations.length > 0) {
        console.log('⚠️  Size budget violations detected:');
        this.analysis.budgetViolations.forEach(violation => {
          console.log(`   ${violation.type}: ${violation.actual}KB > ${violation.budget}KB`);
        });
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Bundle analysis failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Analyze bundle structure and file sizes
   */
  async analyzeBundleStructure() {
    console.log('📊 Analyzing bundle structure...');

    if (!fs.existsSync(this.distPath)) {
      throw new Error('Build directory not found. Run "npm run build" first.');
    }

    const files = this.getFilesRecursively(this.distPath);
    
    for (const file of files) {
      const stats = fs.statSync(file);
      const relativePath = path.relative(this.distPath, file);
      const extension = path.extname(file);
      
      const asset = {
        name: relativePath,
        size: stats.size,
        sizeKB: Math.round(stats.size / 1024 * 100) / 100,
        type: this.getAssetType(extension),
        isChunk: relativePath.includes('assets/scripts/') && extension === '.js',
        isCss: extension === '.css'
      };

      this.analysis.assets.push(asset);
      this.analysis.totalSize += stats.size;

      if (asset.isChunk) {
        this.analysis.chunks.push(asset);
      }
    }

    // Sort by size (largest first)
    this.analysis.chunks.sort((a, b) => b.size - a.size);
    this.analysis.assets.sort((a, b) => b.size - a.size);

    console.log(`   Found ${this.analysis.chunks.length} JavaScript chunks`);
    console.log(`   Found ${this.analysis.assets.filter(a => a.isCss).length} CSS files`);
    console.log(`   Total bundle size: ${Math.round(this.analysis.totalSize / 1024)}KB\n`);
  }

  /**
   * Analyze dependencies and their impact
   */
  async analyzeDependencies() {
    console.log('📦 Analyzing dependencies...');

    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Estimate dependency sizes (would need actual bundle map for precision)
    const heavyDependencies = [
      'react-big-calendar',
      'recharts',
      '@tiptap/react',
      'react-to-print',
      'moment',
      'lodash',
      'framer-motion',
      'xlsx',
      'jspdf'
    ];

    this.analysis.dependencies = {
      total: Object.keys(packageJson.dependencies || {}).length,
      heavy: heavyDependencies.filter(dep => packageJson.dependencies?.[dep]).length,
      list: heavyDependencies.filter(dep => packageJson.dependencies?.[dep])
    };

    console.log(`   Total dependencies: ${this.analysis.dependencies.total}`);
    console.log(`   Heavy dependencies: ${this.analysis.dependencies.heavy}`);
    if (this.analysis.dependencies.list.length > 0) {
      console.log(`   Heavy deps: ${this.analysis.dependencies.list.join(', ')}`);
    }
    console.log();
  }

  /**
   * Check against size budgets
   */
  async checkSizeBudgets() {
    console.log('📏 Checking size budgets...');

    // Check main chunk
    const mainChunk = this.analysis.chunks.find(chunk => 
      chunk.name.includes('index') || chunk.name.includes('main')
    );
    
    if (mainChunk && mainChunk.sizeKB > SIZE_BUDGETS.main) {
      this.analysis.budgetViolations.push({
        type: 'Main chunk',
        actual: mainChunk.sizeKB,
        budget: SIZE_BUDGETS.main,
        file: mainChunk.name
      });
    }

    // Check individual chunks
    this.analysis.chunks.forEach(chunk => {
      if (chunk.sizeKB > SIZE_BUDGETS.chunk) {
        this.analysis.budgetViolations.push({
          type: 'Chunk size',
          actual: chunk.sizeKB,
          budget: SIZE_BUDGETS.chunk,
          file: chunk.name
        });
      }
    });

    // Check total bundle size
    const totalSizeKB = Math.round(this.analysis.totalSize / 1024);
    if (totalSizeKB > SIZE_BUDGETS.total) {
      this.analysis.budgetViolations.push({
        type: 'Total bundle',
        actual: totalSizeKB,
        budget: SIZE_BUDGETS.total,
        file: 'All files'
      });
    }

    // Check CSS size
    const cssSize = this.analysis.assets
      .filter(asset => asset.isCss)
      .reduce((total, asset) => total + asset.sizeKB, 0);
      
    if (cssSize > SIZE_BUDGETS.css) {
      this.analysis.budgetViolations.push({
        type: 'CSS bundle',
        actual: cssSize,
        budget: SIZE_BUDGETS.css,
        file: 'CSS files'
      });
    }

    if (this.analysis.budgetViolations.length === 0) {
      console.log('   ✅ All size budgets within limits\n');
    } else {
      console.log(`   ⚠️  ${this.analysis.budgetViolations.length} budget violations found\n`);
    }
  }

  /**
   * Generate optimization recommendations
   */
  async generateRecommendations() {
    console.log('💡 Generating recommendations...');

    const recommendations = [];

    // Large chunk recommendations
    const largeChunks = this.analysis.chunks.filter(chunk => chunk.sizeKB > 200);
    if (largeChunks.length > 0) {
      recommendations.push({
        type: 'Code Splitting',
        priority: 'High',
        description: `${largeChunks.length} chunks are larger than 200KB. Consider further code splitting.`,
        files: largeChunks.map(c => c.name)
      });
    }

    // Heavy dependency recommendations
    if (this.analysis.dependencies.heavy > 3) {
      recommendations.push({
        type: 'Dependency Optimization',
        priority: 'Medium',
        description: 'Consider lazy loading heavy dependencies or finding lighter alternatives.',
        files: this.analysis.dependencies.list
      });
    }

    // CSS optimization
    const cssFiles = this.analysis.assets.filter(asset => asset.isCss);
    const totalCssSize = cssFiles.reduce((total, file) => total + file.sizeKB, 0);
    if (totalCssSize > 80) {
      recommendations.push({
        type: 'CSS Optimization',
        priority: 'Medium',
        description: 'CSS bundle is large. Consider purging unused styles.',
        files: cssFiles.map(f => f.name)
      });
    }

    // Image optimization
    const images = this.analysis.assets.filter(asset => 
      ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(asset.type)
    );
    const largeImages = images.filter(img => img.sizeKB > 100);
    if (largeImages.length > 0) {
      recommendations.push({
        type: 'Image Optimization',
        priority: 'Medium',
        description: 'Large images found. Consider compression or WebP format.',
        files: largeImages.map(i => i.name)
      });
    }

    this.analysis.recommendations = recommendations;

    console.log(`   Generated ${recommendations.length} recommendations\n`);
  }

  /**
   * Generate analysis report
   */
  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalSize: Math.round(this.analysis.totalSize / 1024),
        chunks: this.analysis.chunks.length,
        budgetViolations: this.analysis.budgetViolations.length,
        recommendations: this.analysis.recommendations.length
      },
      chunks: this.analysis.chunks.slice(0, 10), // Top 10 largest chunks
      budgetViolations: this.analysis.budgetViolations,
      recommendations: this.analysis.recommendations,
      sizeBudgets: SIZE_BUDGETS
    };

    const reportPath = path.join(this.distPath, 'bundle-analysis.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('📄 Analysis report saved to dist/bundle-analysis.json');
    
    // Generate human-readable summary
    this.printSummary();
  }

  /**
   * Print analysis summary to console
   */
  printSummary() {
    console.log('\n📋 Bundle Analysis Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log(`📦 Total Bundle Size: ${Math.round(this.analysis.totalSize / 1024)}KB`);
    console.log(`📊 JavaScript Chunks: ${this.analysis.chunks.length}`);
    
    if (this.analysis.chunks.length > 0) {
      console.log('\n🔍 Largest Chunks:');
      this.analysis.chunks.slice(0, 5).forEach((chunk, index) => {
        console.log(`   ${index + 1}. ${chunk.name} (${chunk.sizeKB}KB)`);
      });
    }

    if (this.analysis.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      this.analysis.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. [${rec.priority}] ${rec.type}: ${rec.description}`);
      });
    }

    if (this.analysis.budgetViolations.length === 0) {
      console.log('\n✅ All performance budgets met!');
    }
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

  getAssetType(extension) {
    const ext = extension.toLowerCase().replace('.', '');
    
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return 'javascript';
    if (['css', 'scss', 'sass', 'less'].includes(ext)) return 'css';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
    if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) return 'font';
    if (['json', 'xml'].includes(ext)) return 'data';
    
    return 'other';
  }
}

// Run analysis if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new BundleAnalyzer();
  analyzer.analyze();
}

export default BundleAnalyzer;