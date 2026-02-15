#!/usr/bin/env node

/**
 * Dependency Audit Script
 * 
 * Analyzes project dependencies for optimization opportunities:
 * - Identifies heavy dependencies
 * - Suggests lighter alternatives
 * - Finds unused dependencies
 * - Recommends bundle optimization strategies
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Known heavy dependencies and their lighter alternatives
const HEAVY_DEPENDENCIES = {
  'moment': {
    size: '329KB',
    alternatives: ['date-fns', 'dayjs'],
    reason: 'Large bundle size with locale data',
    recommendation: 'Replace with date-fns for better tree-shaking'
  },
  'lodash': {
    size: '545KB',
    alternatives: ['lodash-es', 'individual lodash functions'],
    reason: 'Full library imported instead of individual functions',
    recommendation: 'Use individual imports: import debounce from "lodash/debounce"'
  },
  'react-big-calendar': {
    size: '257KB',
    alternatives: ['@fullcalendar/react', 'react-calendar'],
    reason: 'Heavy calendar component with many features',
    recommendation: 'Consider lazy loading or lighter calendar component'
  },
  'recharts': {
    size: '484KB',
    alternatives: ['react-chartjs-2', 'victory'],
    reason: 'Full charting library with all chart types',
    recommendation: 'Lazy load chart components or use modular chart library'
  },
  'xlsx': {
    size: '800KB+',
    alternatives: ['papaparse', 'csv-parser'],
    reason: 'Full Excel processing library',
    recommendation: 'Consider server-side processing or CSV-only approach'
  },
  'jspdf': {
    size: '500KB+',
    alternatives: ['puppeteer', 'server-side PDF generation'],
    reason: 'Client-side PDF generation library',
    recommendation: 'Move PDF generation to server or lazy load'
  }
};

// Dependencies that should be code-split
const CODE_SPLIT_CANDIDATES = [
  'react-big-calendar',
  'recharts',
  '@tiptap/react',
  'react-to-print',
  'jspdf',
  'xlsx'
];

// Utility libraries that benefit from tree-shaking
const TREE_SHAKEABLE = [
  'lodash',
  'date-fns',
  'lucide-react',
  '@radix-ui/*'
];

class DependencyAuditor {
  constructor() {
    this.packageJsonPath = path.join(__dirname, '..', 'package.json');
    this.analysis = {
      heavy: [],
      codeSplitCandidates: [],
      treeShakeOpportunities: [],
      unused: [],
      recommendations: [],
      totalDependencies: 0,
      estimatedSavings: 0
    };
  }

  /**
   * Main audit entry point
   */
  async audit() {
    console.log('🔍 Starting dependency audit...\n');

    try {
      await this.analyzePackageJson();
      await this.findUnusedDependencies();
      await this.generateRecommendations();
      await this.estimateSavings();
      await this.generateReport();
      
      console.log('✅ Dependency audit complete!\n');
      this.printSummary();
      
    } catch (error) {
      console.error('❌ Dependency audit failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Analyze package.json for dependency issues
   */
  async analyzePackageJson() {
    console.log('📦 Analyzing package.json...');

    const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    this.analysis.totalDependencies = Object.keys(dependencies).length;

    // Check for heavy dependencies
    for (const [depName, depInfo] of Object.entries(HEAVY_DEPENDENCIES)) {
      if (dependencies[depName]) {
        this.analysis.heavy.push({
          name: depName,
          version: dependencies[depName],
          ...depInfo
        });
      }
    }

    // Check for code-split candidates
    for (const candidate of CODE_SPLIT_CANDIDATES) {
      if (dependencies[candidate]) {
        this.analysis.codeSplitCandidates.push({
          name: candidate,
          version: dependencies[candidate],
          recommendation: 'Implement lazy loading'
        });
      }
    }

    // Check for tree-shaking opportunities
    for (const treeShakeable of TREE_SHAKEABLE) {
      if (treeShakeable.includes('*')) {
        // Check for scoped packages
        const prefix = treeShakeable.replace('/*', '');
        const matches = Object.keys(dependencies).filter(dep => dep.startsWith(prefix));
        matches.forEach(match => {
          this.analysis.treeShakeOpportunities.push({
            name: match,
            version: dependencies[match],
            recommendation: 'Ensure proper tree-shaking with named imports'
          });
        });
      } else if (dependencies[treeShakeable]) {
        this.analysis.treeShakeOpportunities.push({
          name: treeShakeable,
          version: dependencies[treeShakeable],
          recommendation: 'Use individual function imports for better tree-shaking'
        });
      }
    }

    console.log(`   Found ${this.analysis.totalDependencies} total dependencies`);
    console.log(`   Identified ${this.analysis.heavy.length} heavy dependencies`);
    console.log(`   Found ${this.analysis.codeSplitCandidates.length} code-split candidates`);
    console.log(`   Identified ${this.analysis.treeShakeOpportunities.length} tree-shake opportunities\n`);
  }

  /**
   * Find potentially unused dependencies
   */
  async findUnusedDependencies() {
    console.log('🔍 Analyzing dependency usage...');

    const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
    const dependencies = Object.keys(packageJson.dependencies || {});
    
    // Get all source files
    const sourceFiles = this.getSourceFiles();
    const allSourceCode = sourceFiles.map(file => {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch {
        return '';
      }
    }).join(' ');

    // Check each dependency for usage
    for (const dep of dependencies) {
      // Skip certain dependencies that are used indirectly
      if (this.isIndirectDependency(dep)) continue;

      const importPatterns = [
        new RegExp(`import.*from\\s+['"]${dep}['"]`, 'g'),
        new RegExp(`import\\s+['"]${dep}['"]`, 'g'),
        new RegExp(`require\\s*\\(\\s*['"]${dep}['"]\\s*\\)`, 'g'),
        new RegExp(`@${dep.replace('/', '\\/')}`, 'g'), // For scoped packages
      ];

      const isUsed = importPatterns.some(pattern => pattern.test(allSourceCode));

      if (!isUsed) {
        this.analysis.unused.push({
          name: dep,
          version: packageJson.dependencies[dep],
          confidence: 'medium', // Static analysis has limitations
          recommendation: 'Verify if dependency is actually unused and can be removed'
        });
      }
    }

    console.log(`   Found ${this.analysis.unused.length} potentially unused dependencies\n`);
  }

  /**
   * Check if dependency is used indirectly
   */
  isIndirectDependency(dep) {
    const indirectDeps = [
      'react', 'react-dom', // Core React
      'typescript', 'vite', // Build tools
      '@types/', // TypeScript types
      'eslint', 'prettier', // Linting
      'vitest', 'playwright' // Testing
    ];

    return indirectDeps.some(indirect => dep.includes(indirect));
  }

  /**
   * Get all source files for analysis
   */
  getSourceFiles() {
    const files = [];
    const srcPath = path.join(__dirname, '..', 'src');
    
    if (!fs.existsSync(srcPath)) return files;

    function collectFiles(dir) {
      const entries = fs.readdirSync(dir);
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          collectFiles(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
          files.push(fullPath);
        }
      }
    }

    collectFiles(srcPath);
    return files;
  }

  /**
   * Generate optimization recommendations
   */
  async generateRecommendations() {
    console.log('💡 Generating recommendations...');

    const recommendations = [];

    // Heavy dependency recommendations
    if (this.analysis.heavy.length > 0) {
      recommendations.push({
        category: 'Heavy Dependencies',
        priority: 'High',
        description: `Replace ${this.analysis.heavy.length} heavy dependencies with lighter alternatives`,
        actions: this.analysis.heavy.map(dep => ({
          dependency: dep.name,
          action: dep.recommendation,
          alternatives: dep.alternatives,
          potentialSaving: dep.size
        }))
      });
    }

    // Code splitting recommendations
    if (this.analysis.codeSplitCandidates.length > 0) {
      recommendations.push({
        category: 'Code Splitting',
        priority: 'High',
        description: `Implement lazy loading for ${this.analysis.codeSplitCandidates.length} heavy components`,
        actions: this.analysis.codeSplitCandidates.map(dep => ({
          dependency: dep.name,
          action: 'Implement React.lazy() or dynamic import',
          benefit: 'Reduces initial bundle size'
        }))
      });
    }

    // Tree shaking recommendations
    if (this.analysis.treeShakeOpportunities.length > 0) {
      recommendations.push({
        category: 'Tree Shaking',
        priority: 'Medium',
        description: `Optimize imports for better tree-shaking`,
        actions: this.analysis.treeShakeOpportunities.map(dep => ({
          dependency: dep.name,
          action: dep.recommendation,
          example: this.getTreeShakeExample(dep.name)
        }))
      });
    }

    // Unused dependencies recommendations
    if (this.analysis.unused.length > 0) {
      recommendations.push({
        category: 'Unused Dependencies',
        priority: 'Low',
        description: `Review ${this.analysis.unused.length} potentially unused dependencies`,
        actions: this.analysis.unused.map(dep => ({
          dependency: dep.name,
          action: 'Verify usage and remove if unused',
          confidence: dep.confidence
        }))
      });
    }

    this.analysis.recommendations = recommendations;
    console.log(`   Generated ${recommendations.length} recommendation categories\n`);
  }

  /**
   * Get tree-shaking example for dependency
   */
  getTreeShakeExample(depName) {
    const examples = {
      'lodash': 'import debounce from "lodash/debounce" // instead of import _ from "lodash"',
      'date-fns': 'import { format } from "date-fns" // already tree-shakeable',
      'lucide-react': 'import { Search, User } from "lucide-react" // already optimized'
    };

    return examples[depName] || 'Use named imports where possible';
  }

  /**
   * Estimate potential bundle size savings
   */
  async estimateSavings() {
    let totalSavings = 0;

    // Estimate savings from replacing heavy dependencies
    for (const heavy of this.analysis.heavy) {
      // Rough estimate based on typical size reductions
      const sizeMB = parseFloat(heavy.size.replace(/[^\d.]/g, '')) || 0;
      totalSavings += sizeMB * 0.7; // Assume 70% reduction on average
    }

    // Estimate savings from code splitting (initial bundle reduction)
    totalSavings += this.analysis.codeSplitCandidates.length * 50; // ~50KB per split component

    // Estimate savings from tree shaking
    totalSavings += this.analysis.treeShakeOpportunities.length * 20; // ~20KB per optimized import

    this.analysis.estimatedSavings = Math.round(totalSavings);
  }

  /**
   * Generate audit report
   */
  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalDependencies: this.analysis.totalDependencies,
        heavyDependencies: this.analysis.heavy.length,
        codeSplitCandidates: this.analysis.codeSplitCandidates.length,
        treeShakeOpportunities: this.analysis.treeShakeOpportunities.length,
        unusedDependencies: this.analysis.unused.length,
        estimatedSavingsKB: this.analysis.estimatedSavings
      },
      analysis: this.analysis,
      recommendations: this.analysis.recommendations
    };

    const reportPath = path.join(__dirname, '..', 'dependency-audit-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('📄 Audit report saved to dependency-audit-report.json');
  }

  /**
   * Print audit summary
   */
  printSummary() {
    console.log('📋 Dependency Audit Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log(`📦 Total Dependencies: ${this.analysis.totalDependencies}`);
    console.log(`⚠️  Heavy Dependencies: ${this.analysis.heavy.length}`);
    console.log(`📊 Code Split Candidates: ${this.analysis.codeSplitCandidates.length}`);
    console.log(`🌳 Tree Shake Opportunities: ${this.analysis.treeShakeOpportunities.length}`);
    console.log(`❓ Potentially Unused: ${this.analysis.unused.length}`);
    console.log(`💾 Estimated Savings: ~${this.analysis.estimatedSavings}KB`);

    if (this.analysis.heavy.length > 0) {
      console.log('\n🔍 Heavy Dependencies:');
      this.analysis.heavy.forEach((dep, index) => {
        console.log(`   ${index + 1}. ${dep.name} (${dep.size}) - ${dep.reason}`);
        console.log(`      💡 ${dep.recommendation}`);
        if (dep.alternatives.length > 0) {
          console.log(`      🔄 Alternatives: ${dep.alternatives.join(', ')}`);
        }
      });
    }

    if (this.analysis.recommendations.length > 0) {
      console.log('\n💡 Top Recommendations:');
      this.analysis.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. [${rec.priority}] ${rec.category}: ${rec.description}`);
      });
    }

    console.log('\n🚀 Next Steps:');
    console.log('   1. Review heavy dependencies and consider alternatives');
    console.log('   2. Implement code splitting for large components');
    console.log('   3. Optimize imports for better tree shaking');
    console.log('   4. Remove unused dependencies after verification');
    console.log('   5. Monitor bundle size with each build');
  }
}

// Run audit if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const auditor = new DependencyAuditor();
  auditor.audit();
}

export default DependencyAuditor;