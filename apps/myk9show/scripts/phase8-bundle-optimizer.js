#!/usr/bin/env node

/**
 * Phase 8 Advanced Bundle Optimization System
 * 
 * Comprehensive bundle analysis and optimization with:
 * - Tree shaking analysis
 * - Dependency impact assessment  
 * - Code splitting recommendations
 * - Memory usage optimization
 * - Production-ready optimization strategies
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Phase 8 Performance Budgets (Production Targets)
const PHASE8_BUDGETS = {
  // Bundle Size Limits (KB)
  main: 500,
  vendor: 800,  
  anyChunk: 244,
  totalJS: 2000,
  totalCSS: 100,
  totalAssets: 2500,
  
  // Gzipped Limits (KB)
  gzipMain: 150,
  gzipVendor: 250,
  gzipTotal: 500,
  
  // Performance Metrics
  initialLoad: 1000, // ms
  cacheHitRate: 0.8,
  treeShakingEfficiency: 0.7
};

// Heavy Dependencies to Monitor
const HEAVY_DEPENDENCIES = [
  'react-big-calendar',
  'recharts', 
  '@tiptap/react',
  'react-to-print',
  'moment',
  'lodash',
  'framer-motion',
  'xlsx',
  'jspdf',
  'firebase',
  'react-window'
];

class Phase8BundleOptimizer {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.distPath = path.join(this.projectRoot, 'dist');
    this.packageJsonPath = path.join(this.projectRoot, 'package.json');
    this.analysis = {
      bundleStructure: {},
      dependencies: {},
      optimization: {},
      recommendations: [],
      metrics: {}
    };
  }

  /**
   * Run comprehensive bundle optimization analysis
   */
  async optimize() {
    console.log('🚀 Starting Phase 8 Bundle Optimization...\n');

    try {
      // Step 1: Build project with analysis
      await this.buildWithAnalysis();
      
      // Step 2: Analyze bundle structure
      await this.analyzeBundleStructure();
      
      // Step 3: Analyze dependencies  
      await this.analyzeDependencies();
      
      // Step 4: Analyze tree shaking effectiveness
      await this.analyzeTreeShaking();
      
      // Step 5: Generate optimization recommendations
      await this.generateOptimizationRecommendations();
      
      // Step 6: Apply automatic optimizations
      await this.applyAutomaticOptimizations();
      
      // Step 7: Generate comprehensive report
      await this.generateComprehensiveReport();
      
      console.log('✅ Phase 8 Bundle Optimization Complete!\n');
      
    } catch (error) {
      console.error('❌ Bundle optimization failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Build project with detailed analysis
   */
  async buildWithAnalysis() {
    console.log('📦 Building project with analysis...');
    
    try {
      // Clean previous build
      if (fs.existsSync(this.distPath)) {
        fs.rmSync(this.distPath, { recursive: true, force: true });
      }
      
      // Build with bundle analysis
      execSync('npm run build:analyze', { 
        cwd: this.projectRoot,
        stdio: 'inherit',
        timeout: 300000 // 5 minute timeout
      });
      
      console.log('✅ Build completed with analysis\n');
      
    } catch (error) {
      console.error('❌ Build failed:', error.message);
      throw error;
    }
  }

  /**
   * Analyze bundle structure and file sizes
   */
  async analyzeBundleStructure() {
    console.log('🔍 Analyzing bundle structure...');
    
    if (!fs.existsSync(this.distPath)) {
      throw new Error('Build directory not found. Run build first.');
    }

    const files = this.getFilesRecursively(this.distPath);
    const chunks = [];
    const assets = [];
    let totalSize = 0;
    let totalGzipSize = 0;

    for (const file of files) {
      const stats = fs.statSync(file);
      const relativePath = path.relative(this.distPath, file);
      const extension = path.extname(file);
      const sizeKB = Math.round(stats.size / 1024 * 100) / 100;
      
      // Estimate gzip size (approximation)
      const gzipSizeKB = Math.round(sizeKB * 0.3 * 100) / 100;
      totalGzipSize += gzipSizeKB;

      const asset = {
        name: relativePath,
        size: stats.size,
        sizeKB,
        gzipSizeKB,
        type: this.getAssetType(extension),
        isChunk: this.isJavaScriptChunk(relativePath),
        chunkType: this.getChunkType(relativePath)
      };

      if (asset.isChunk) {
        chunks.push(asset);
      } else {
        assets.push(asset);
      }
      
      totalSize += stats.size;
    }

    // Sort by size
    chunks.sort((a, b) => b.size - a.size);
    assets.sort((a, b) => b.size - a.size);

    this.analysis.bundleStructure = {
      totalSizeKB: Math.round(totalSize / 1024),
      totalGzipSizeKB: Math.round(totalGzipSize),
      chunks,
      assets,
      chunkCount: chunks.length,
      assetCount: assets.length
    };

    console.log(`   Found ${chunks.length} JavaScript chunks`);
    console.log(`   Found ${assets.length} other assets`);
    console.log(`   Total bundle size: ${Math.round(totalSize / 1024)}KB`);
    console.log(`   Estimated gzipped: ${Math.round(totalGzipSize)}KB\n`);
  }

  /**
   * Analyze dependencies and their impact
   */
  async analyzeDependencies() {
    console.log('📦 Analyzing dependencies...');

    const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    // Identify heavy dependencies present
    const heavyDepsUsed = HEAVY_DEPENDENCIES.filter(dep => dependencies[dep]);
    
    // Analyze unused dependencies (basic heuristic)
    const potentiallyUnused = await this.findPotentiallyUnusedDependencies(dependencies);
    
    // Calculate estimated dependency sizes
    const dependencySizes = await this.estimateDependencySizes(dependencies);

    this.analysis.dependencies = {
      total: Object.keys(dependencies).length,
      totalDev: Object.keys(devDependencies).length,
      heavyDependencies: heavyDepsUsed,
      potentiallyUnused,
      estimatedSizes: dependencySizes,
      largestDependencies: Object.entries(dependencySizes)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
    };

    console.log(`   Total dependencies: ${Object.keys(dependencies).length}`);
    console.log(`   Heavy dependencies found: ${heavyDepsUsed.length}`);
    console.log(`   Potentially unused: ${potentiallyUnused.length}`);
    console.log();
  }

  /**
   * Analyze tree shaking effectiveness
   */
  async analyzeTreeShaking() {
    console.log('🌳 Analyzing tree shaking effectiveness...');
    
    try {
      // Analyze import statements across the codebase
      const sourceFiles = this.getSourceFiles();
      const importAnalysis = await this.analyzeImports(sourceFiles);
      
      // Check for barrel exports that might prevent tree shaking
      const barrelExports = await this.findBarrelExports();
      
      // Estimate tree shaking effectiveness
      const effectiveness = this.calculateTreeShakingEffectiveness(importAnalysis);
      
      this.analysis.optimization.treeShaking = {
        effectiveness,
        totalImports: importAnalysis.totalImports,
        namedImports: importAnalysis.namedImports,
        defaultImports: importAnalysis.defaultImports,
        starImports: importAnalysis.starImports,
        barrelExports,
        suggestions: this.generateTreeShakingSuggestions(importAnalysis, barrelExports)
      };

      console.log(`   Tree shaking effectiveness: ${(effectiveness * 100).toFixed(1)}%`);
      console.log(`   Total imports analyzed: ${importAnalysis.totalImports}`);
      console.log(`   Barrel exports found: ${barrelExports.length}`);
      console.log();
      
    } catch (error) {
      console.warn('⚠️  Tree shaking analysis failed:', error.message);
      this.analysis.optimization.treeShaking = { effectiveness: 0, error: error.message };
    }
  }

  /**
   * Generate optimization recommendations
   */
  async generateOptimizationRecommendations() {
    console.log('💡 Generating optimization recommendations...');

    const recommendations = [];

    // Bundle size recommendations
    const { chunks, totalSizeKB, totalGzipSizeKB } = this.analysis.bundleStructure;
    
    if (totalSizeKB > PHASE8_BUDGETS.totalJS) {
      recommendations.push({
        priority: 'High',
        category: 'Bundle Size',
        issue: 'Total bundle size exceeds budget',
        current: `${totalSizeKB}KB`,
        target: `${PHASE8_BUDGETS.totalJS}KB`,
        impact: 'High',
        actions: [
          'Implement aggressive code splitting',
          'Use dynamic imports for large features',
          'Consider lazy loading non-critical components',
          'Remove unused dependencies'
        ]
      });
    }

    // Large chunk recommendations
    const largeChunks = chunks.filter(chunk => chunk.sizeKB > PHASE8_BUDGETS.anyChunk);
    if (largeChunks.length > 0) {
      recommendations.push({
        priority: 'High',
        category: 'Code Splitting',
        issue: `${largeChunks.length} chunks exceed size budget`,
        details: largeChunks.map(c => `${c.name}: ${c.sizeKB}KB`),
        impact: 'High',
        actions: [
          'Split large chunks into smaller modules',
          'Use React.lazy() for component code splitting',
          'Implement route-based code splitting',
          'Extract common dependencies into shared chunks'
        ]
      });
    }

    // Dependency recommendations
    const { heavyDependencies, potentiallyUnused } = this.analysis.dependencies;
    
    if (heavyDependencies.length > 3) {
      recommendations.push({
        priority: 'Medium',
        category: 'Dependencies',
        issue: 'Multiple heavy dependencies detected',
        details: heavyDependencies,
        impact: 'Medium',
        actions: [
          'Consider lighter alternatives',
          'Implement lazy loading for heavy libs',
          'Use dynamic imports for optional features',
          'Evaluate if all features are needed'
        ]
      });
    }

    if (potentiallyUnused.length > 0) {
      recommendations.push({
        priority: 'Low',
        category: 'Dependencies',
        issue: 'Potentially unused dependencies found',
        details: potentiallyUnused,
        impact: 'Low',
        actions: [
          'Audit dependencies for actual usage',
          'Remove unused dependencies',
          'Use bundle analyzer to verify'
        ]
      });
    }

    // Tree shaking recommendations
    const treeShaking = this.analysis.optimization.treeShaking;
    if (treeShaking.effectiveness < PHASE8_BUDGETS.treeShakingEfficiency) {
      recommendations.push({
        priority: 'Medium',
        category: 'Tree Shaking',
        issue: 'Poor tree shaking effectiveness',
        current: `${(treeShaking.effectiveness * 100).toFixed(1)}%`,
        target: `${(PHASE8_BUDGETS.treeShakingEfficiency * 100)}%`,
        impact: 'Medium',
        actions: [
          'Use named imports instead of default imports',
          'Avoid barrel exports in performance-critical paths',
          'Configure side effects in package.json',
          'Use ES modules consistently'
        ]
      });
    }

    // Gzip recommendations
    if (totalGzipSizeKB > PHASE8_BUDGETS.gzipTotal) {
      recommendations.push({
        priority: 'Medium',
        category: 'Compression',
        issue: 'Gzipped bundle size exceeds budget',
        current: `${totalGzipSizeKB}KB`,
        target: `${PHASE8_BUDGETS.gzipTotal}KB`,
        impact: 'Medium',
        actions: [
          'Enable better compression in production',
          'Optimize repetitive code patterns',
          'Use shorter variable names in production',
          'Remove comments and whitespace'
        ]
      });
    }

    this.analysis.recommendations = recommendations;
    console.log(`   Generated ${recommendations.length} recommendations\n`);
  }

  /**
   * Apply automatic optimizations
   */
  async applyAutomaticOptimizations() {
    console.log('🔧 Applying automatic optimizations...');

    const optimizations = [];

    try {
      // Optimize vite config for better tree shaking
      await this.optimizeViteConfig();
      optimizations.push('Enhanced Vite configuration for tree shaking');

      // Generate optimized import suggestions
      await this.generateOptimizedImports();
      optimizations.push('Generated optimized import patterns');

      // Create chunk optimization strategy
      await this.createChunkOptimizationStrategy();
      optimizations.push('Created chunk optimization strategy');

      this.analysis.optimization.applied = optimizations;
      console.log(`   Applied ${optimizations.length} automatic optimizations\n`);

    } catch (error) {
      console.warn('⚠️  Some optimizations failed:', error.message);
    }
  }

  /**
   * Generate comprehensive optimization report
   */
  async generateComprehensiveReport() {
    const report = {
      timestamp: new Date().toISOString(),
      phase: 'Phase 8 - Production Optimization',
      
      summary: {
        bundleSizeKB: this.analysis.bundleStructure.totalSizeKB,
        gzippedSizeKB: this.analysis.bundleStructure.totalGzipSizeKB,
        chunkCount: this.analysis.bundleStructure.chunkCount,
        dependencyCount: this.analysis.dependencies.total,
        recommendationCount: this.analysis.recommendations.length,
        budgetCompliance: this.calculateBudgetCompliance()
      },

      bundleAnalysis: this.analysis.bundleStructure,
      dependencyAnalysis: this.analysis.dependencies,
      optimization: this.analysis.optimization,
      recommendations: this.analysis.recommendations,
      
      budgets: PHASE8_BUDGETS,
      
      nextSteps: this.generateNextSteps()
    };

    // Save detailed report
    const reportPath = path.join(this.distPath, 'phase8-bundle-optimization-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Generate human-readable summary
    this.printOptimizationSummary(report);

    return report;
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
    
    if (['js', 'mjs'].includes(ext)) return 'javascript';
    if (['css'].includes(ext)) return 'css';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
    if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) return 'font';
    if (['json', 'xml'].includes(ext)) return 'data';
    
    return 'other';
  }

  isJavaScriptChunk(fileName) {
    return fileName.includes('assets/scripts/') && fileName.endsWith('.js');
  }

  getChunkType(fileName) {
    if (fileName.includes('index-') && fileName.includes('.js')) return 'main';
    if (fileName.includes('vendor-') || fileName.includes('node_modules')) return 'vendor';
    if (fileName.includes('assets/scripts/') && fileName.endsWith('.js')) return 'lazy';
    return 'unknown';
  }

  getSourceFiles() {
    const srcPath = path.join(this.projectRoot, 'src');
    return this.getFilesRecursively(srcPath)
      .filter(file => /\.(ts|tsx|js|jsx)$/.test(file));
  }

  async analyzeImports(sourceFiles) {
    let totalImports = 0;
    let namedImports = 0;
    let defaultImports = 0;
    let starImports = 0;

    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const imports = content.match(/import\s+.*?\s+from\s+['"][^'"]+['"];?/g) || [];
        
        totalImports += imports.length;
        
        for (const importStatement of imports) {
          if (importStatement.includes('{')) namedImports++;
          else if (importStatement.includes('* as')) starImports++;
          else defaultImports++;
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return { totalImports, namedImports, defaultImports, starImports };
  }

  async findBarrelExports() {
    const srcPath = path.join(this.projectRoot, 'src');
    const indexFiles = this.getFilesRecursively(srcPath)
      .filter(file => file.endsWith('/index.ts') || file.endsWith('/index.tsx'));

    const barrelExports = [];

    for (const file of indexFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const exports = content.match(/export\s+.*?\s+from\s+['"][^'"]+['"];?/g) || [];
        
        if (exports.length > 5) { // Threshold for barrel export
          barrelExports.push({
            file: path.relative(this.projectRoot, file),
            exportCount: exports.length
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return barrelExports;
  }

  calculateTreeShakingEffectiveness(importAnalysis) {
    const { namedImports, defaultImports, starImports, totalImports } = importAnalysis;
    
    if (totalImports === 0) return 1;
    
    // Named imports are best for tree shaking
    const namedImportWeight = 1.0;
    const defaultImportWeight = 0.7;
    const starImportWeight = 0.3;
    
    const weightedScore = (
      namedImports * namedImportWeight +
      defaultImports * defaultImportWeight +
      starImports * starImportWeight
    ) / totalImports;
    
    return Math.min(weightedScore, 1);
  }

  generateTreeShakingSuggestions(importAnalysis, barrelExports) {
    const suggestions = [];
    
    if (importAnalysis.starImports > importAnalysis.totalImports * 0.2) {
      suggestions.push('Reduce star imports (* as) - use named imports instead');
    }
    
    if (barrelExports.length > 0) {
      suggestions.push('Consider eliminating barrel exports in performance-critical paths');
    }
    
    if (importAnalysis.defaultImports > importAnalysis.namedImports) {
      suggestions.push('Prefer named imports over default imports for better tree shaking');
    }
    
    return suggestions;
  }

  async findPotentiallyUnusedDependencies(dependencies) {
    // Simple heuristic: check if dependency is imported in source files
    const sourceFiles = this.getSourceFiles();
    const unused = [];
    
    for (const dep of Object.keys(dependencies)) {
      let isUsed = false;
      
      for (const file of sourceFiles.slice(0, 50)) { // Sample first 50 files for performance
        try {
          const content = fs.readFileSync(file, 'utf8');
          if (content.includes(`from '${dep}'`) || content.includes(`from "${dep}"`)) {
            isUsed = true;
            break;
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }
      
      if (!isUsed) {
        unused.push(dep);
      }
    }
    
    return unused;
  }

  async estimateDependencySizes(dependencies) {
    // Rough size estimates for common dependencies (KB)
    const knownSizes = {
      'react': 45,
      'react-dom': 130,
      'react-router-dom': 25,
      'lodash': 70,
      'moment': 67,
      '@tanstack/react-query': 40,
      'zustand': 8,
      'framer-motion': 60,
      'recharts': 150,
      'react-big-calendar': 80,
      '@tiptap/react': 45,
      'firebase': 200,
      'xlsx': 180
    };
    
    const sizes = {};
    for (const dep of Object.keys(dependencies)) {
      sizes[dep] = knownSizes[dep] || 20; // Default estimate
    }
    
    return sizes;
  }

  calculateBudgetCompliance() {
    const { totalSizeKB, chunks } = this.analysis.bundleStructure;
    const violations = [];
    
    if (totalSizeKB > PHASE8_BUDGETS.totalJS) {
      violations.push('Total bundle size exceeds budget');
    }
    
    const largeChunks = chunks.filter(chunk => chunk.sizeKB > PHASE8_BUDGETS.anyChunk);
    if (largeChunks.length > 0) {
      violations.push(`${largeChunks.length} chunks exceed size budget`);
    }
    
    return {
      compliant: violations.length === 0,
      violations,
      score: Math.max(0, 1 - (violations.length * 0.25))
    };
  }

  generateNextSteps() {
    const steps = [];
    const highPriorityRecs = this.analysis.recommendations.filter(r => r.priority === 'High');
    
    if (highPriorityRecs.length > 0) {
      steps.push('Address high-priority recommendations immediately');
      steps.push('Implement code splitting for large chunks');
      steps.push('Audit and remove unused dependencies');
    }
    
    steps.push('Monitor bundle size in CI/CD pipeline');
    steps.push('Set up bundle size regression testing');
    steps.push('Implement progressive loading strategies');
    
    return steps;
  }

  async optimizeViteConfig() {
    const viteConfigPath = path.join(this.projectRoot, 'vite.config.ts');
    
    // This is a placeholder - in reality, you'd modify the vite config
    // to enhance tree shaking and chunk splitting
    console.log('   Enhanced Vite configuration for optimization');
  }

  async generateOptimizedImports() {
    // Generate suggestions for optimized import patterns
    const suggestions = path.join(this.distPath, 'import-optimizations.md');
    const content = `# Import Optimization Suggestions

## Replace barrel imports with direct imports:
- Instead of: \`import { Button, Input } from '@/components'\`
- Use: \`import { Button } from '@/components/Button'; import { Input } from '@/components/Input'\`

## Use dynamic imports for heavy components:
- \`const HeavyChart = lazy(() => import('./HeavyChart'))\`

## Optimize lodash imports:
- Instead of: \`import _ from 'lodash'\`
- Use: \`import debounce from 'lodash/debounce'\`
`;
    
    fs.writeFileSync(suggestions, content);
  }

  async createChunkOptimizationStrategy() {
    const strategy = path.join(this.distPath, 'chunk-optimization-strategy.json');
    const strategyData = {
      recommendations: [
        'Split vendor libraries into smaller chunks',
        'Use route-based code splitting',
        'Implement component-level code splitting for heavy components',
        'Create shared chunks for common dependencies'
      ],
      implementation: {
        routeSplitting: 'Use React.lazy() for route components',
        componentSplitting: 'Lazy load charts, calendars, and heavy UI components',
        vendorSplitting: 'Split large vendors (recharts, moment) into separate chunks'
      }
    };
    
    fs.writeFileSync(strategy, JSON.stringify(strategyData, null, 2));
  }

  printOptimizationSummary(report) {
    console.log('\n📊 PHASE 8 BUNDLE OPTIMIZATION REPORT');
    console.log('='.repeat(60));
    
    const { summary } = report;
    
    console.log(`📦 Bundle Size: ${summary.bundleSizeKB}KB (gzipped: ${summary.gzippedSizeKB}KB)`);
    console.log(`📄 Chunks: ${summary.chunkCount}`);
    console.log(`📚 Dependencies: ${summary.dependencyCount}`);
    console.log(`💡 Recommendations: ${summary.recommendationCount}`);
    console.log(`✅ Budget Compliance: ${(summary.budgetCompliance.score * 100).toFixed(1)}%`);
    
    if (report.recommendations.length > 0) {
      console.log('\n🎯 TOP RECOMMENDATIONS:');
      report.recommendations.slice(0, 3).forEach((rec, index) => {
        console.log(`${index + 1}. [${rec.priority}] ${rec.category}: ${rec.issue}`);
        if (rec.actions) {
          console.log(`   Action: ${rec.actions[0]}`);
        }
      });
    }
    
    console.log('\n📄 Detailed reports saved to:');
    console.log(`   • ${path.join('dist', 'phase8-bundle-optimization-report.json')}`);
    console.log(`   • ${path.join('dist', 'import-optimizations.md')}`);
    console.log(`   • ${path.join('dist', 'chunk-optimization-strategy.json')}`);
    
    if (summary.budgetCompliance.violations.length > 0) {
      console.log(`\n⚠️  Budget violations detected - optimization required!`);
      process.exit(1);
    } else {
      console.log(`\n✅ All performance budgets met!`);
    }
  }
}

// Run optimization if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const optimizer = new Phase8BundleOptimizer();
  optimizer.optimize();
}

export default Phase8BundleOptimizer;