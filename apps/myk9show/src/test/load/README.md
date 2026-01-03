# myK9Show Load Testing Framework

Comprehensive load testing framework for the myK9Show application targeting 100+ concurrent users with realistic user behavior simulation and performance monitoring.

## Overview

This load testing framework provides multiple approaches to test the application under various load conditions:

### 🎯 Performance Targets

- **Response Time**: <200ms (95th percentile) for API calls, <3s for page loads
- **Error Rate**: <5% under normal load, <10% under peak load  
- **Throughput**: >100 requests/second minimum
- **Concurrent Users**: Support for 100+ concurrent users
- **Graceful Degradation**: Maintain core functionality under stress

### 🧪 Test Scenarios

1. **Normal Load** (100 users, 10 minutes)
   - Typical daily traffic patterns
   - Mixed user types (70% exhibitors, 15% secretaries, 10% judges, 5% admins)
   - Common workflows: browsing, searching, entry management

2. **Peak Entry Load** (250 users, 15 minutes)
   - Simulates show entry opening periods
   - High concurrent entry submissions
   - Payment processing under load

3. **Stress Test** (500 users, 20 minutes)
   - Find application breaking points
   - Test failure recovery mechanisms
   - Validate error handling under extreme load

## 🚀 Quick Start

### Prerequisites

```bash
# Ensure application is running
npm run dev

# Application should be available at http://localhost:5173
# API should be available at http://localhost:54321
```

### Running Load Tests

```bash
# Quick load test (normal scenario)
npm run test:load:quick

# Full Playwright-based load tests
npm run test:load:playwright

# Database-specific load tests
npm run test:load:database

# Complete load testing suite
npm run test:load:full
```

## 📊 Testing Tools & Approaches

### 1. Playwright Load Tests
**File**: `playwright-load-tests.spec.ts`

Real browser-based testing with:
- Concurrent user simulation (25-500 users)
- Realistic user interactions
- Performance metric collection
- Cross-browser compatibility testing

```bash
# Run specific scenarios
npm run test:load:playwright -- --grep "normal load"
npm run test:load:playwright -- --grep "peak entry"
npm run test:load:playwright -- --grep "stress"
```

### 2. Database Load Tests
**File**: `DatabaseLoadTests.ts`

Direct database performance testing:
- CRUD operation stress testing
- Complex query performance
- Connection pool management
- Cache invalidation scenarios

```bash
npm run test:load:database
```

### 3. k6 Load Tests (Optional)
**File**: `k6-load-tests.js`

Professional HTTP load testing:
- API endpoint testing
- WebSocket real-time testing
- Custom performance metrics
- Scalable test execution

```bash
# Install k6: https://k6.io/docs/getting-started/installation/
k6 run src/test/load/k6-load-tests.js
```

### 4. Artillery Load Tests (Optional)
**File**: `artillery-config.yml`

Comprehensive HTTP and WebSocket testing:
- Realistic traffic patterns
- Complex scenario definitions
- Built-in reporting
- CI/CD integration

```bash
# Install Artillery: npm install -g artillery
artillery run src/test/load/artillery-config.yml
```

## 🏗️ Framework Architecture

### Core Components

#### LoadTestFramework.ts
- Performance targets and budgets
- Test scenario definitions
- Data generators for realistic test data
- Performance monitoring utilities

#### LoadTestRunner.ts
- Orchestrates browser-based load tests
- Manages user contexts and workflows
- Collects and analyzes performance metrics
- Handles test cleanup and reporting

#### DatabaseLoadTester
- Direct database performance testing
- Connection pool stress testing
- Query performance analysis
- Database-specific metrics collection

### Performance Monitoring

```typescript
// Performance monitoring example
const monitor = new PerformanceMonitor();

monitor.startMeasurement('api_call');
// ... perform operation
const duration = monitor.endMeasurement('api_call', success);

// Get comprehensive metrics
const metrics = monitor.getAllMetrics();
console.log(monitor.generateReport());
```

## 📈 Test Data Generation

Realistic test data generation for:

```typescript
const generator = LoadTestDataGenerator.getInstance();

// Generate test users with proper role distribution
const users = Array.from({ length: 1000 }, () => 
  generator.generateUser(getRandomRole())
);

// Generate dogs with realistic characteristics
const dogs = Array.from({ length: 500 }, () => 
  generator.generateDog()
);

// Generate shows with proper scheduling
const shows = Array.from({ length: 200 }, () => 
  generator.generateShow()
);
```

## 🔄 Critical User Workflows

### 1. User Registration Flow
- Concurrent registration testing
- Form validation under load
- Database constraint handling
- Email service integration

### 2. Show Browsing & Search
- Search query performance
- Filter application speed
- Pagination efficiency
- Cache effectiveness

### 3. Entry Submission Process
- Concurrent entry creation
- Payment processing simulation
- Database transaction handling
- Confirmation generation

### 4. Real-time Updates
- WebSocket connection handling
- Message delivery latency
- Connection recovery testing
- Notification system performance

## 📊 Performance Metrics

### Response Time Metrics
- **Min/Max/Average**: Basic response time statistics
- **P50/P95/P99**: Percentile-based performance analysis
- **Throughput**: Requests per second capability
- **Error Rate**: Percentage of failed requests

### Database Metrics
- **Query Performance**: Execution time analysis
- **Connection Pool**: Utilization and efficiency
- **Slow Queries**: Identification and optimization
- **Cache Hit Rate**: Caching effectiveness

### User Experience Metrics
- **Time to Interactive**: Page loading performance
- **Search Response**: Search functionality speed
- **Form Submission**: User action responsiveness
- **Real-time Latency**: Live update delivery time

## 🎛️ Configuration

### Environment Variables
```bash
# Application URLs
BASE_URL=http://localhost:5173
API_URL=http://localhost:54321
WS_URL=ws://localhost:54321/realtime/v1/websocket

# Authentication tokens for testing
EXHIBITOR_TOKEN=your_test_token
SECRETARY_TOKEN=your_test_token
JUDGE_TOKEN=your_test_token
ADMIN_TOKEN=your_test_token
```

### Test Configuration
```typescript
const PERFORMANCE_TARGETS = {
  responseTime: {
    api: 200,        // ms - API responses
    page: 3000,      // ms - Page loads
    search: 300,     // ms - Search queries
    realtime: 500,   // ms - Real-time updates
  },
  errorRate: {
    normal: 0.05,    // 5% under normal load
    peak: 0.10,      // 10% under peak load
    stress: 0.25,    // 25% under stress
  },
  users: {
    normal: 100,     // Normal concurrent users
    peak: 250,       // Peak concurrent users
    stress: 500,     // Stress test users
  }
};
```

## 📋 Test Execution Workflow

### 1. Pre-Test Setup
```bash
# Verify application is running
curl http://localhost:5173/health

# Check database connectivity
curl http://localhost:54321/health

# Ensure sufficient system resources
```

### 2. Test Execution
```bash
# Run comprehensive load testing suite
npm run test:load:full

# Or run individual test types
npm run test:load:playwright
npm run test:load:database
```

### 3. Results Analysis
- Review HTML reports in `load-test-reports/`
- Analyze performance metrics and bottlenecks
- Compare results against performance targets
- Identify optimization opportunities

### 4. Reporting
- Comprehensive HTML reports with metrics
- JSON output for CI/CD integration
- Performance trend analysis
- Actionable recommendations

## 🔧 Customization

### Adding New Test Scenarios
```typescript
// Add to LOAD_TEST_SCENARIOS in LoadTestFramework.ts
{
  name: 'custom_scenario',
  description: 'Custom load testing scenario',
  virtualUsers: 150,
  duration: '12m',
  userDistribution: {
    exhibitors: 80,
    secretaries: 15,
    judges: 5,
    admins: 0,
    anonymous: 0
  },
  workflows: [
    // Define custom workflows
  ],
  performanceTargets: {
    responseTime95: 250,
    errorRate: 0.08,
    throughputMin: 75,
    availability: 99.0
  }
}
```

### Custom Performance Metrics
```typescript
// Add custom metrics to PerformanceMonitor
monitor.startMeasurement('custom_operation');
// ... perform operation
monitor.endMeasurement('custom_operation', success);
```

## 🐛 Troubleshooting

### Common Issues

#### High Error Rates
- Check database connection limits
- Verify API rate limiting settings
- Review authentication token validity
- Monitor system resource usage

#### Slow Response Times
- Analyze database query performance
- Check network latency
- Review caching configuration
- Monitor server resource utilization

#### Test Failures
- Ensure application is fully started
- Verify test data availability
- Check test environment isolation
- Review browser automation setup

### Debug Options
```bash
# Run with debug output
DEBUG=1 npm run test:load:playwright

# Run single test for debugging
npm run test:load:playwright -- --grep "specific test"

# Generate detailed reports
npm run test:load:full --verbose
```

## 📚 Best Practices

### Test Design
1. **Realistic Data**: Use diverse, realistic test data
2. **Gradual Ramp-up**: Implement gradual user ramp-up
3. **Think Time**: Include realistic user think time
4. **Error Handling**: Test both success and failure scenarios

### Performance Analysis
1. **Baseline Metrics**: Establish performance baselines
2. **Trend Analysis**: Monitor performance over time
3. **Bottleneck Identification**: Focus on slowest operations
4. **Resource Monitoring**: Track CPU, memory, and database usage

### Continuous Testing
1. **CI/CD Integration**: Automate load testing in pipelines
2. **Performance Budgets**: Set and enforce performance limits
3. **Regular Execution**: Run load tests on schedule
4. **Alert Thresholds**: Set up performance degradation alerts

## 🔗 Integration

### CI/CD Pipeline
```yaml
# Example GitHub Actions workflow
- name: Run Load Tests
  run: |
    npm install
    npm run build
    npm run dev &
    sleep 30
    npm run test:load:quick
    pkill -f "npm run dev"
```

### Monitoring Integration
- Export metrics to monitoring systems
- Set up alerting for performance degradation
- Create dashboards for performance tracking
- Integrate with APM tools

## 📖 Additional Resources

- [Performance Testing Best Practices](https://docs.microsoft.com/en-us/azure/architecture/framework/scalability/performance-test)
- [k6 Documentation](https://k6.io/docs/)
- [Artillery Documentation](https://artillery.io/docs/)
- [Playwright Testing Guide](https://playwright.dev/docs/test-intro)

---

For questions or issues with load testing, please refer to the troubleshooting section or create an issue in the project repository.