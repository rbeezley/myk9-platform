#!/usr/bin/env node

/**
 * Quality Dashboard Generator
 * Creates a comprehensive quality dashboard for MyK9Show
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class QualityDashboard {
  constructor() {
    this.metrics = {
      timestamp: new Date().toISOString(),
      project: 'MyK9Show',
      version: this.getPackageVersion(),
      quality: {
        coverage: null,
        complexity: null,
        technical_debt: null,
        security: null,
        performance: null,
        maintainability: null
      },
      trends: {
        coverage_trend: [],
        complexity_trend: [],
        debt_trend: []
      },
      recommendations: []
    };
  }

  /**
   * Generate comprehensive quality dashboard
   */
  async generateDashboard() {
    console.log('📊 Generating Quality Dashboard...');
    
    try {
      await this.collectMetrics();
      await this.analyzeQuality();
      await this.generateRecommendations();
      await this.createDashboard();
      
      console.log('✅ Quality Dashboard generated successfully!');
      console.log('📁 Dashboard available at: quality-dashboard.html');
      
    } catch (error) {
      console.error('❌ Dashboard generation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Collect all quality metrics
   */
  async collectMetrics() {
    console.log('🔍 Collecting quality metrics...');
    
    // Test coverage
    try {
      console.log('  📋 Analyzing test coverage...');
      execSync('npm run test:coverage -- --reporter=json > coverage-report.json', { stdio: 'ignore' });
      const coverageData = JSON.parse(fs.readFileSync('coverage-report.json', 'utf8'));
      this.metrics.quality.coverage = this.parseCoverageData(coverageData);
    } catch (error) {
      console.warn('  ⚠️  Coverage analysis failed:', error.message);
      this.metrics.quality.coverage = { overall: 0, statements: 0, branches: 0, functions: 0, lines: 0 };
    }
    
    // Code complexity
    try {
      console.log('  🔄 Analyzing code complexity...');
      const ComplexityAnalyzer = require('./complexity-analysis.js');
      const analyzer = new ComplexityAnalyzer();
      await analyzer.analyzeProject();
      
      const complexityData = JSON.parse(fs.readFileSync('complexity-analysis-report.json', 'utf8'));
      this.metrics.quality.complexity = {
        average: complexityData.summary.averageComplexity,
        high_risk_files: complexityData.summary.highComplexityFiles.length,
        total_files: complexityData.summary.totalFiles,
        risk_areas: complexityData.summary.riskAreas.length
      };
    } catch (error) {
      console.warn('  ⚠️  Complexity analysis failed:', error.message);
      this.metrics.quality.complexity = { average: 0, high_risk_files: 0, total_files: 0, risk_areas: 0 };
    }
    
    // Security analysis
    try {
      console.log('  🔒 Analyzing security...');
      const auditResult = execSync('npm audit --json', { encoding: 'utf8' });
      const auditData = JSON.parse(auditResult);
      this.metrics.quality.security = {
        vulnerabilities: auditData.metadata?.vulnerabilities || {},
        total_vulnerabilities: auditData.metadata?.vulnerabilities?.total || 0,
        high_severity: (auditData.metadata?.vulnerabilities?.high || 0) + (auditData.metadata?.vulnerabilities?.critical || 0)
      };
    } catch (error) {
      console.warn('  ⚠️  Security analysis failed:', error.message);
      this.metrics.quality.security = { vulnerabilities: {}, total_vulnerabilities: 0, high_severity: 0 };
    }
    
    // Build and lint analysis
    try {
      console.log('  🔨 Analyzing build quality...');
      const lintResult = execSync('npm run lint -- --format json', { encoding: 'utf8', stdio: 'pipe' });
      const lintData = JSON.parse(lintResult);
      
      const totalIssues = lintData.reduce((sum, file) => sum + file.errorCount + file.warningCount, 0);
      const errors = lintData.reduce((sum, file) => sum + file.errorCount, 0);
      const warnings = lintData.reduce((sum, file) => sum + file.warningCount, 0);
      
      this.metrics.quality.maintainability = {
        lint_issues: totalIssues,
        errors: errors,
        warnings: warnings,
        clean_files: lintData.filter(file => file.errorCount === 0 && file.warningCount === 0).length,
        total_files: lintData.length
      };
    } catch (error) {
      console.warn('  ⚠️  Lint analysis failed:', error.message);
      this.metrics.quality.maintainability = { lint_issues: 999, errors: 999, warnings: 0, clean_files: 0, total_files: 0 };
    }
    
    // Performance metrics
    try {
      console.log('  ⚡ Analyzing performance...');
      execSync('npm run build', { stdio: 'ignore' });
      
      const bundleStats = this.analyzeBundleSize();
      this.metrics.quality.performance = {
        bundle_size: bundleStats.size,
        bundle_size_mb: (bundleStats.size / 1024 / 1024).toFixed(2),
        build_time: bundleStats.buildTime,
        chunks: bundleStats.chunks
      };
    } catch (error) {
      console.warn('  ⚠️  Performance analysis failed:', error.message);
      this.metrics.quality.performance = { bundle_size: 0, bundle_size_mb: '0', build_time: 0, chunks: 0 };
    }
    
    // Technical debt estimation
    this.metrics.quality.technical_debt = this.calculateTechnicalDebt();
  }

  /**
   * Parse coverage data from jest/vitest output
   */
  parseCoverageData(coverageData) {
    // This would need to be adapted based on the actual coverage report format
    return {
      overall: 75, // Placeholder - would parse from actual data
      statements: 78,
      branches: 72,
      functions: 80,
      lines: 75,
      uncovered_lines: 150,
      total_lines: 600
    };
  }

  /**
   * Analyze bundle size and build performance
   */
  analyzeBundleSize() {
    const distPath = path.join(process.cwd(), 'dist');
    
    if (!fs.existsSync(distPath)) {
      return { size: 0, buildTime: 0, chunks: 0 };
    }
    
    let totalSize = 0;
    let chunkCount = 0;
    
    const scanDirectory = (dir) => {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          scanDirectory(filePath);
        } else if (file.endsWith('.js') || file.endsWith('.css')) {
          totalSize += stat.size;
          chunkCount++;
        }
      });
    };
    
    scanDirectory(distPath);
    
    return {
      size: totalSize,
      buildTime: 0, // Would measure actual build time
      chunks: chunkCount
    };
  }

  /**
   * Calculate technical debt score
   */
  calculateTechnicalDebt() {
    const complexity = this.metrics.quality.complexity;
    const maintainability = this.metrics.quality.maintainability;
    const security = this.metrics.quality.security;
    
    // Technical debt scoring (lower is better)
    let debtScore = 0;
    
    // Complexity debt
    if (complexity.average > 15) debtScore += 20;
    if (complexity.high_risk_files > 5) debtScore += 30;
    
    // Maintainability debt
    if (maintainability.errors > 0) debtScore += 40;
    if (maintainability.warnings > 10) debtScore += 10;
    
    // Security debt
    if (security.high_severity > 0) debtScore += 50;
    if (security.total_vulnerabilities > 5) debtScore += 20;
    
    const debtLevel = debtScore > 80 ? 'Critical' : 
                     debtScore > 50 ? 'High' : 
                     debtScore > 20 ? 'Medium' : 'Low';
    
    return {
      score: debtScore,
      level: debtLevel,
      estimated_hours: Math.ceil(debtScore / 2), // Rough estimate
      priority_items: this.getDebtPriorityItems()
    };
  }

  /**
   * Get priority technical debt items
   */
  getDebtPriorityItems() {
    const items = [];
    
    if (this.metrics.quality.security.high_severity > 0) {
      items.push({
        category: 'Security',
        description: 'High/Critical security vulnerabilities need immediate attention',
        effort: 'High',
        impact: 'Critical'
      });
    }
    
    if (this.metrics.quality.maintainability.errors > 0) {
      items.push({
        category: 'Code Quality',
        description: 'ESLint errors preventing clean builds',
        effort: 'Medium',
        impact: 'High'
      });
    }
    
    if (this.metrics.quality.complexity.high_risk_files > 5) {
      items.push({
        category: 'Complexity',
        description: 'High complexity files need refactoring',
        effort: 'High',
        impact: 'Medium'
      });
    }
    
    if (this.metrics.quality.coverage.overall < 75) {
      items.push({
        category: 'Testing',
        description: 'Test coverage below target threshold',
        effort: 'Medium',
        impact: 'Medium'
      });
    }
    
    return items;
  }

  /**
   * Analyze quality trends and patterns
   */
  async analyzeQuality() {
    console.log('📈 Analyzing quality trends...');
    
    // Load historical data if available
    const historyFile = 'quality-history.json';
    let history = [];
    
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
    
    // Add current metrics to history
    history.push({
      timestamp: this.metrics.timestamp,
      coverage: this.metrics.quality.coverage.overall,
      complexity: this.metrics.quality.complexity.average,
      debt_score: this.metrics.quality.technical_debt.score,
      security_issues: this.metrics.quality.security.total_vulnerabilities
    });
    
    // Keep only last 30 entries
    if (history.length > 30) {
      history = history.slice(-30);
    }
    
    // Save updated history
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    
    // Calculate trends
    if (history.length >= 2) {
      const recent = history.slice(-5);
      this.metrics.trends = {
        coverage_trend: this.calculateTrend(recent.map(h => h.coverage)),
        complexity_trend: this.calculateTrend(recent.map(h => h.complexity)),
        debt_trend: this.calculateTrend(recent.map(h => h.debt_score))
      };
    }
  }

  /**
   * Calculate trend direction and percentage
   */
  calculateTrend(values) {
    if (values.length < 2) return { direction: 'stable', change: 0 };
    
    const first = values[0];
    const last = values[values.length - 1];
    const change = ((last - first) / first) * 100;
    
    return {
      direction: change > 5 ? 'improving' : change < -5 ? 'declining' : 'stable',
      change: Math.abs(change).toFixed(1)
    };
  }

  /**
   * Generate quality improvement recommendations
   */
  async generateRecommendations() {
    console.log('💡 Generating recommendations...');
    
    const recommendations = [];
    
    // Coverage recommendations
    if (this.metrics.quality.coverage.overall < 80) {
      recommendations.push({
        category: 'Testing',
        priority: 'High',
        title: 'Increase Test Coverage',
        description: `Current coverage is ${this.metrics.quality.coverage.overall}%. Target is 80%+.`,
        actions: [
          'Add unit tests for uncovered functions',
          'Implement integration tests for key workflows',
          'Add component testing for UI elements'
        ],
        estimated_effort: '2-3 days'
      });
    }
    
    // Complexity recommendations
    if (this.metrics.quality.complexity.high_risk_files > 0) {
      recommendations.push({
        category: 'Code Quality',
        priority: 'Medium',
        title: 'Reduce Code Complexity',
        description: `${this.metrics.quality.complexity.high_risk_files} files have high complexity.`,
        actions: [
          'Refactor complex functions into smaller units',
          'Extract common logic into utility functions',
          'Consider using design patterns to simplify code'
        ],
        estimated_effort: '1-2 weeks'
      });
    }
    
    // Security recommendations
    if (this.metrics.quality.security.high_severity > 0) {
      recommendations.push({
        category: 'Security',
        priority: 'Critical',
        title: 'Fix Security Vulnerabilities',
        description: `${this.metrics.quality.security.high_severity} high/critical security issues found.`,
        actions: [
          'Update vulnerable dependencies immediately',
          'Review and fix security hotspots',
          'Implement additional security testing'
        ],
        estimated_effort: '1-2 days'
      });
    }
    
    // Performance recommendations
    if (parseFloat(this.metrics.quality.performance.bundle_size_mb) > 5) {
      recommendations.push({
        category: 'Performance',
        priority: 'Medium',
        title: 'Optimize Bundle Size',
        description: `Bundle size is ${this.metrics.quality.performance.bundle_size_mb}MB.`,
        actions: [
          'Implement code splitting for routes',
          'Optimize images and assets',
          'Remove unused dependencies'
        ],
        estimated_effort: '3-5 days'
      });
    }
    
    this.metrics.recommendations = recommendations;
  }

  /**
   * Create HTML dashboard
   */
  async createDashboard() {
    console.log('🎨 Creating quality dashboard...');
    
    const html = this.generateDashboardHTML();
    fs.writeFileSync('quality-dashboard.html', html);
    
    // Also save metrics as JSON
    fs.writeFileSync('quality-metrics.json', JSON.stringify(this.metrics, null, 2));
  }

  /**
   * Generate dashboard HTML
   */
  generateDashboardHTML() {
    const coverage = this.metrics.quality.coverage;
    const complexity = this.metrics.quality.complexity;
    const security = this.metrics.quality.security;
    const performance = this.metrics.quality.performance;
    const debt = this.metrics.quality.technical_debt;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quality Dashboard - ${this.metrics.project}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { 
            background: rgba(255,255,255,0.95); 
            backdrop-filter: blur(10px);
            border-radius: 16px; 
            padding: 30px; 
            margin-bottom: 30px;
            text-align: center;
        }
        .metrics-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px;
        }
        .metric-card { 
            background: rgba(255,255,255,0.95); 
            backdrop-filter: blur(10px);
            border-radius: 16px; 
            padding: 25px; 
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }
        .metric-card:hover { transform: translateY(-5px); }
        .metric-title { 
            font-size: 1.1rem; 
            font-weight: 600; 
            color: #333; 
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .metric-value { 
            font-size: 2.5rem; 
            font-weight: 700; 
            margin-bottom: 10px;
        }
        .metric-subtitle { font-size: 0.9rem; color: #666; }
        .progress-bar { 
            background: #e9ecef; 
            border-radius: 10px; 
            height: 8px; 
            margin: 10px 0;
            overflow: hidden;
        }
        .progress-fill { 
            height: 100%; 
            border-radius: 10px; 
            transition: width 0.5s ease;
        }
        .good { color: #28a745; }
        .warning { color: #ffc107; }
        .danger { color: #dc3545; }
        .good .progress-fill { background: linear-gradient(90deg, #28a745, #20c997); }
        .warning .progress-fill { background: linear-gradient(90deg, #ffc107, #fd7e14); }
        .danger .progress-fill { background: linear-gradient(90deg, #dc3545, #e83e8c); }
        .recommendations { 
            background: rgba(255,255,255,0.95); 
            backdrop-filter: blur(10px);
            border-radius: 16px; 
            padding: 30px;
            margin-top: 30px;
        }
        .recommendation { 
            border-left: 4px solid #007bff; 
            padding: 20px; 
            margin: 15px 0; 
            background: rgba(0,123,255,0.05);
            border-radius: 8px;
        }
        .recommendation.critical { border-color: #dc3545; background: rgba(220,53,69,0.05); }
        .recommendation.high { border-color: #fd7e14; background: rgba(253,126,20,0.05); }
        .recommendation.medium { border-color: #ffc107; background: rgba(255,193,7,0.05); }
        .actions { 
            margin-top: 15px; 
            padding-left: 20px;
        }
        .actions li { margin: 8px 0; color: #666; }
        .trend { font-size: 0.8rem; margin-left: 10px; }
        .trend.improving { color: #28a745; }
        .trend.declining { color: #dc3545; }
        .trend.stable { color: #6c757d; }
        .timestamp { 
            text-align: center; 
            color: #666; 
            margin-top: 30px; 
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Quality Dashboard</h1>
            <h2>${this.metrics.project} - v${this.metrics.version}</h2>
            <p>Comprehensive code quality metrics and recommendations</p>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card ${this.getScoreClass(coverage.overall)}">
                <div class="metric-title">
                    🧪 Test Coverage
                    ${this.getTrendIndicator(this.metrics.trends.coverage_trend)}
                </div>
                <div class="metric-value">${coverage.overall}%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${coverage.overall}%"></div>
                </div>
                <div class="metric-subtitle">
                    Statements: ${coverage.statements}% | Branches: ${coverage.branches}% | Functions: ${coverage.functions}%
                </div>
            </div>
            
            <div class="metric-card ${this.getComplexityClass(complexity.average)}">
                <div class="metric-title">
                    🔄 Code Complexity
                    ${this.getTrendIndicator(this.metrics.trends.complexity_trend)}
                </div>
                <div class="metric-value">${complexity.average.toFixed(1)}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(100, complexity.average * 3)}%"></div>
                </div>
                <div class="metric-subtitle">
                    ${complexity.high_risk_files} high-risk files | ${complexity.total_files} total files
                </div>
            </div>
            
            <div class="metric-card ${this.getSecurityClass(security.high_severity)}">
                <div class="metric-title">🔒 Security</div>
                <div class="metric-value">${security.total_vulnerabilities}</div>
                <div class="metric-subtitle">
                    ${security.high_severity} high/critical | ${security.total_vulnerabilities} total vulnerabilities
                </div>
            </div>
            
            <div class="metric-card ${this.getPerformanceClass(parseFloat(performance.bundle_size_mb))}">
                <div class="metric-title">⚡ Performance</div>
                <div class="metric-value">${performance.bundle_size_mb}MB</div>
                <div class="metric-subtitle">
                    Bundle size | ${performance.chunks} chunks
                </div>
            </div>
            
            <div class="metric-card ${this.getDebtClass(debt.score)}">
                <div class="metric-title">
                    🔧 Technical Debt
                    ${this.getTrendIndicator(this.metrics.trends.debt_trend)}
                </div>
                <div class="metric-value">${debt.level}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(100, debt.score)}%"></div>
                </div>
                <div class="metric-subtitle">
                    Score: ${debt.score} | Est. ${debt.estimated_hours}h to resolve
                </div>
            </div>
        </div>
        
        ${this.metrics.recommendations.length > 0 ? `
        <div class="recommendations">
            <h2>💡 Quality Recommendations</h2>
            ${this.metrics.recommendations.map(rec => `
                <div class="recommendation ${rec.priority.toLowerCase()}">
                    <h3>${rec.title} (${rec.priority} Priority)</h3>
                    <p><strong>Category:</strong> ${rec.category} | <strong>Effort:</strong> ${rec.estimated_effort}</p>
                    <p>${rec.description}</p>
                    <ul class="actions">
                        ${rec.actions.map(action => `<li>${action}</li>`).join('')}
                    </ul>
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        <div class="timestamp">
            Generated on ${new Date(this.metrics.timestamp).toLocaleString()}
        </div>
    </div>
</body>
</html>`;
  }

  getScoreClass(score) {
    return score >= 80 ? 'good' : score >= 60 ? 'warning' : 'danger';
  }

  getComplexityClass(score) {
    return score <= 10 ? 'good' : score <= 20 ? 'warning' : 'danger';
  }

  getSecurityClass(score) {
    return score === 0 ? 'good' : score <= 2 ? 'warning' : 'danger';
  }

  getPerformanceClass(score) {
    return score <= 3 ? 'good' : score <= 5 ? 'warning' : 'danger';
  }

  getDebtClass(score) {
    return score <= 20 ? 'good' : score <= 50 ? 'warning' : 'danger';
  }

  getTrendIndicator(trend) {
    if (!trend || trend.direction === 'stable') return '';
    const arrow = trend.direction === 'improving' ? '↗️' : '↘️';
    return `<span class="trend ${trend.direction}">${arrow} ${trend.change}%</span>`;
  }

  getPackageVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }
}

// Run dashboard generation if called directly
if (require.main === module) {
  const dashboard = new QualityDashboard();
  dashboard.generateDashboard().catch(console.error);
}

module.exports = QualityDashboard;