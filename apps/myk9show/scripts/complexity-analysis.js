#!/usr/bin/env node

/**
 * Code Complexity Analysis Script
 * Analyzes code complexity metrics for the MyK9Show project
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ComplexityAnalyzer {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      summary: {
        totalFiles: 0,
        totalComplexity: 0,
        averageComplexity: 0,
        highComplexityFiles: [],
        riskAreas: []
      },
      fileMetrics: [],
      thresholds: {
        low: 10,
        medium: 20,
        high: 30,
        critical: 50
      }
    };
  }

  /**
   * Analyze complexity across the entire project
   */
  async analyzeProject() {
    console.log('🔍 Starting complexity analysis...');
    
    try {
      // Install es-complexity if not available
      try {
        execSync('npx es-complexity --version', { stdio: 'ignore' });
      } catch {
        console.log('📦 Installing es-complexity...');
        execSync('npm install -g es-complexity', { stdio: 'inherit' });
      }

      // Run complexity analysis
      this.analyzeSourceFiles();
      this.generateReport();
      this.checkComplexityThresholds();
      this.saveResults();
      
      console.log('✅ Complexity analysis complete!');
      console.log(`📊 Report saved to: complexity-analysis-report.json`);
      
    } catch (error) {
      console.error('❌ Complexity analysis failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Analyze source files for complexity
   */
  analyzeSourceFiles() {
    const srcDir = path.join(process.cwd(), 'src');
    const files = this.getTypeScriptFiles(srcDir);
    
    console.log(`📁 Analyzing ${files.length} TypeScript files...`);
    
    files.forEach(file => {
      try {
        const relativePath = path.relative(process.cwd(), file);
        const content = fs.readFileSync(file, 'utf8');
        const metrics = this.analyzeFile(content, relativePath);
        
        this.results.fileMetrics.push(metrics);
        this.results.summary.totalFiles++;
        this.results.summary.totalComplexity += metrics.cyclomaticComplexity;
        
        // Track high complexity files
        if (metrics.cyclomaticComplexity >= this.results.thresholds.high) {
          this.results.summary.highComplexityFiles.push({
            file: relativePath,
            complexity: metrics.cyclomaticComplexity,
            risk: this.getRiskLevel(metrics.cyclomaticComplexity)
          });
        }
        
      } catch (error) {
        console.warn(`⚠️  Skipping ${file}: ${error.message}`);
      }
    });
    
    this.results.summary.averageComplexity = 
      this.results.summary.totalComplexity / this.results.summary.totalFiles;
  }

  /**
   * Get all TypeScript files recursively
   */
  getTypeScriptFiles(dir) {
    const files = [];
    
    const scan = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip test directories and node_modules
          if (!item.startsWith('.') && 
              item !== 'node_modules' && 
              item !== 'dist' && 
              item !== 'build') {
            scan(fullPath);
          }
        } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
          // Skip test files and declaration files
          if (!item.endsWith('.test.ts') && 
              !item.endsWith('.test.tsx') && 
              !item.endsWith('.spec.ts') && 
              !item.endsWith('.spec.tsx') && 
              !item.endsWith('.d.ts')) {
            files.push(fullPath);
          }
        }
      });
    };
    
    scan(dir);
    return files;
  }

  /**
   * Analyze individual file complexity
   */
  analyzeFile(content, filePath) {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    
    // Basic cyclomatic complexity calculation
    const complexityKeywords = [
      'if', 'else if', 'while', 'for', 'case', 'catch', 
      '&&', '||', '?', 'switch', 'try'
    ];
    
    let cyclomaticComplexity = 1; // Base complexity
    let functionCount = 0;
    let classCount = 0;
    
    content.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      
      // Count functions
      if (trimmedLine.match(/^\s*(function|const\s+\w+\s*=|async\s+function|\w+\s*\()/)) {
        functionCount++;
      }
      
      // Count classes
      if (trimmedLine.match(/^\s*class\s+/)) {
        classCount++;
      }
      
      // Count complexity keywords
      complexityKeywords.forEach(keyword => {
        const matches = (trimmedLine.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
        cyclomaticComplexity += matches;
      });
    });
    
    return {
      file: filePath,
      linesOfCode: lines.length,
      nonEmptyLines: nonEmptyLines.length,
      functionCount,
      classCount,
      cyclomaticComplexity,
      complexityPerFunction: functionCount > 0 ? cyclomaticComplexity / functionCount : 0,
      riskLevel: this.getRiskLevel(cyclomaticComplexity),
      maintainabilityIndex: this.calculateMaintainabilityIndex(
        cyclomaticComplexity, 
        nonEmptyLines.length, 
        functionCount
      )
    };
  }

  /**
   * Calculate maintainability index
   */
  calculateMaintainabilityIndex(complexity, loc, functions) {
    // Simplified maintainability index calculation
    const halsteadVolume = Math.log2(functions + 1) * loc;
    const maintainabilityIndex = Math.max(0, 
      171 - 5.2 * Math.log(halsteadVolume) - 0.23 * complexity - 16.2 * Math.log(loc)
    );
    
    return Math.round(maintainabilityIndex);
  }

  /**
   * Get risk level based on complexity
   */
  getRiskLevel(complexity) {
    if (complexity >= this.results.thresholds.critical) return 'critical';
    if (complexity >= this.results.thresholds.high) return 'high';
    if (complexity >= this.results.thresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Generate analysis report
   */
  generateReport() {
    console.log('\n📊 Complexity Analysis Summary:');
    console.log(`   Total Files: ${this.results.summary.totalFiles}`);
    console.log(`   Average Complexity: ${this.results.summary.averageComplexity.toFixed(2)}`);
    console.log(`   High Complexity Files: ${this.results.summary.highComplexityFiles.length}`);
    
    // Risk analysis
    const riskDistribution = this.results.fileMetrics.reduce((acc, file) => {
      acc[file.riskLevel] = (acc[file.riskLevel] || 0) + 1;
      return acc;
    }, {});
    
    console.log('\n🎯 Risk Distribution:');
    Object.entries(riskDistribution).forEach(([level, count]) => {
      const percentage = ((count / this.results.summary.totalFiles) * 100).toFixed(1);
      console.log(`   ${level.toUpperCase()}: ${count} files (${percentage}%)`);
    });
    
    // Top complex files
    if (this.results.summary.highComplexityFiles.length > 0) {
      console.log('\n⚠️  High Complexity Files:');
      this.results.summary.highComplexityFiles
        .sort((a, b) => b.complexity - a.complexity)
        .slice(0, 10)
        .forEach(file => {
          console.log(`   ${file.file}: ${file.complexity} (${file.risk})`);
        });
    }
  }

  /**
   * Check complexity thresholds and generate warnings
   */
  checkComplexityThresholds() {
    const criticalFiles = this.results.fileMetrics.filter(
      file => file.cyclomaticComplexity >= this.results.thresholds.critical
    );
    
    if (criticalFiles.length > 0) {
      console.log('\n🚨 CRITICAL COMPLEXITY WARNINGS:');
      criticalFiles.forEach(file => {
        console.log(`   ${file.file}: ${file.cyclomaticComplexity} complexity`);
        this.results.summary.riskAreas.push({
          file: file.file,
          issue: 'Critical complexity',
          complexity: file.cyclomaticComplexity,
          recommendation: 'Consider refactoring into smaller functions'
        });
      });
    }
    
    // Check for files with low maintainability
    const lowMaintainability = this.results.fileMetrics.filter(
      file => file.maintainabilityIndex < 20
    );
    
    if (lowMaintainability.length > 0) {
      console.log('\n📉 LOW MAINTAINABILITY WARNINGS:');
      lowMaintainability.forEach(file => {
        console.log(`   ${file.file}: ${file.maintainabilityIndex} maintainability index`);
        this.results.summary.riskAreas.push({
          file: file.file,
          issue: 'Low maintainability',
          maintainabilityIndex: file.maintainabilityIndex,
          recommendation: 'Consider simplifying logic and reducing complexity'
        });
      });
    }
  }

  /**
   * Save analysis results
   */
  saveResults() {
    const reportPath = 'complexity-analysis-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    
    // Generate HTML report
    this.generateHTMLReport();
    
    // Generate markdown summary
    this.generateMarkdownSummary();
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport() {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Complexity Analysis - MyK9Show</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; }
        .header { background: linear-gradient(135deg, #007AFF, #5856D6); color: white; padding: 20px; border-radius: 8px; }
        .metric { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 6px; }
        .risk-critical { color: #dc3545; font-weight: bold; }
        .risk-high { color: #fd7e14; font-weight: bold; }
        .risk-medium { color: #ffc107; font-weight: bold; }
        .risk-low { color: #28a745; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 Code Complexity Analysis</h1>
        <p>Generated on: ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="metric">
        <h2>📊 Summary Metrics</h2>
        <p><strong>Total Files Analyzed:</strong> ${this.results.summary.totalFiles}</p>
        <p><strong>Average Complexity:</strong> ${this.results.summary.averageComplexity.toFixed(2)}</p>
        <p><strong>High Complexity Files:</strong> ${this.results.summary.highComplexityFiles.length}</p>
    </div>
    
    <h2>📈 File Complexity Details</h2>
    <table>
        <thead>
            <tr>
                <th>File</th>
                <th>Complexity</th>
                <th>Functions</th>
                <th>Lines</th>
                <th>Risk Level</th>
                <th>Maintainability</th>
            </tr>
        </thead>
        <tbody>
            ${this.results.fileMetrics
              .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
              .map(file => `
                <tr>
                    <td>${file.file}</td>
                    <td>${file.cyclomaticComplexity}</td>
                    <td>${file.functionCount}</td>
                    <td>${file.linesOfCode}</td>
                    <td class="risk-${file.riskLevel}">${file.riskLevel.toUpperCase()}</td>
                    <td>${file.maintainabilityIndex}</td>
                </tr>
              `).join('')}
        </tbody>
    </table>
</body>
</html>`;
    
    fs.writeFileSync('complexity-analysis-report.html', html);
  }

  /**
   * Generate markdown summary
   */
  generateMarkdownSummary() {
    const markdown = `# Code Complexity Analysis Report

Generated: ${new Date().toLocaleString()}

## Summary

- **Total Files**: ${this.results.summary.totalFiles}
- **Average Complexity**: ${this.results.summary.averageComplexity.toFixed(2)}
- **High Complexity Files**: ${this.results.summary.highComplexityFiles.length}

## Risk Assessment

${this.results.summary.riskAreas.length > 0 ? 
  this.results.summary.riskAreas.map(risk => 
    `- **${risk.file}**: ${risk.issue} - ${risk.recommendation}`
  ).join('\n') : 
  'No high-risk areas identified ✅'
}

## Top Complex Files

${this.results.summary.highComplexityFiles
  .slice(0, 10)
  .map(file => `- \`${file.file}\`: ${file.complexity} complexity (${file.risk} risk)`)
  .join('\n')}
`;
    
    fs.writeFileSync('complexity-summary.md', markdown);
  }
}

// Run analysis if called directly
if (require.main === module) {
  const analyzer = new ComplexityAnalyzer();
  analyzer.analyzeProject().catch(console.error);
}

module.exports = ComplexityAnalyzer;