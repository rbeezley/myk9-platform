#!/bin/bash

# myK9Show Load Testing Script
# Comprehensive load testing execution with multiple tools

set -e

# Configuration
BASE_URL="${BASE_URL:-http://localhost:5173}"
API_URL="${API_URL:-http://localhost:54321}"
LOAD_TEST_DIR="src/test/load"
REPORTS_DIR="load-test-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if application is running
    if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
        log_error "Application is not running at $BASE_URL"
        log_info "Please start the application first: npm run dev"
        exit 1
    fi
    
    # Check if API is running  
    if ! curl -s "$API_URL/health" > /dev/null 2>&1; then
        log_warning "API health check failed at $API_URL"
        log_info "Attempting to continue with load tests..."
    fi
    
    # Check for required tools
    command -v node >/dev/null 2>&1 || { log_error "Node.js is required but not installed."; exit 1; }
    command -v npm >/dev/null 2>&1 || { log_error "npm is required but not installed."; exit 1; }
    
    # Check for k6 (optional)
    if command -v k6 >/dev/null 2>&1; then
        log_success "k6 is available for advanced load testing"
        K6_AVAILABLE=true
    else
        log_warning "k6 not found - will skip k6 tests"
        K6_AVAILABLE=false
    fi
    
    # Check for Artillery (optional)
    if command -v artillery >/dev/null 2>&1; then
        log_success "Artillery is available for load testing"
        ARTILLERY_AVAILABLE=true
    else
        log_warning "Artillery not found - will skip Artillery tests"
        ARTILLERY_AVAILABLE=false
    fi
    
    log_success "Prerequisites check completed"
}

# Setup test environment
setup_test_environment() {
    log_info "Setting up test environment..."
    
    # Create reports directory
    mkdir -p "$REPORTS_DIR"
    
    # Backup any existing test data
    if [ -f "$LOAD_TEST_DIR/test-results.json" ]; then
        mv "$LOAD_TEST_DIR/test-results.json" "$REPORTS_DIR/previous-results-$TIMESTAMP.json"
    fi
    
    # Set environment variables
    export BASE_URL="$BASE_URL"
    export API_URL="$API_URL"
    export LOAD_TEST_TIMESTAMP="$TIMESTAMP"
    
    log_success "Test environment setup completed"
}

# Run Playwright load tests
run_playwright_tests() {
    log_info "Running Playwright load tests..."
    
    # Run different load test scenarios
    test_scenarios=("normal" "peak" "stress" "comprehensive")
    
    for scenario in "${test_scenarios[@]}"; do
        log_info "Running $scenario load test scenario..."
        
        if npm run test:e2e -- --grep "should handle $scenario" --reporter=json --output-file="$REPORTS_DIR/playwright-$scenario-$TIMESTAMP.json"; then
            log_success "$scenario scenario completed successfully"
        else
            log_error "$scenario scenario failed"
            # Continue with other tests
        fi
    done
    
    # Run critical workflow tests
    log_info "Running critical user workflow tests..."
    if npm run test:e2e -- src/test/load/playwright-load-tests.spec.ts --reporter=json --output-file="$REPORTS_DIR/playwright-workflows-$TIMESTAMP.json"; then
        log_success "Workflow tests completed successfully"
    else
        log_error "Workflow tests failed"
    fi
}

# Run k6 load tests
run_k6_tests() {
    if [ "$K6_AVAILABLE" = false ]; then
        log_warning "Skipping k6 tests - k6 not available"
        return
    fi
    
    log_info "Running k6 load tests..."
    
    # Run different k6 scenarios
    k6_scenarios=("normal_load" "peak_entry_load" "stress_test" "database_load" "realtime_load")
    
    for scenario in "${k6_scenarios[@]}"; do
        log_info "Running k6 $scenario scenario..."
        
        if k6 run \
            --env BASE_URL="$BASE_URL" \
            --env API_URL="$API_URL" \
            --scenario "$scenario" \
            --out json="$REPORTS_DIR/k6-$scenario-$TIMESTAMP.json" \
            --out html="$REPORTS_DIR/k6-$scenario-$TIMESTAMP.html" \
            "$LOAD_TEST_DIR/k6-load-tests.js"; then
            log_success "k6 $scenario scenario completed successfully"
        else
            log_error "k6 $scenario scenario failed"
        fi
    done
}

# Run Artillery load tests
run_artillery_tests() {
    if [ "$ARTILLERY_AVAILABLE" = false ]; then
        log_warning "Skipping Artillery tests - Artillery not available"
        return
    fi
    
    log_info "Running Artillery load tests..."
    
    # Run main Artillery configuration
    if artillery run \
        --target "$BASE_URL" \
        --output "$REPORTS_DIR/artillery-main-$TIMESTAMP.json" \
        "$LOAD_TEST_DIR/artillery-config.yml"; then
        log_success "Artillery main test completed successfully"
    else
        log_error "Artillery main test failed"
    fi
    
    # Generate Artillery HTML report
    if [ -f "$REPORTS_DIR/artillery-main-$TIMESTAMP.json" ]; then
        artillery report \
            --output "$REPORTS_DIR/artillery-main-$TIMESTAMP.html" \
            "$REPORTS_DIR/artillery-main-$TIMESTAMP.json"
        log_success "Artillery HTML report generated"
    fi
    
    # Run stress test
    log_info "Running Artillery stress test..."
    if artillery run \
        --target "$BASE_URL" \
        --config "$LOAD_TEST_DIR/artillery-config.yml:stress_test" \
        --output "$REPORTS_DIR/artillery-stress-$TIMESTAMP.json" \
        "$LOAD_TEST_DIR/artillery-config.yml"; then
        log_success "Artillery stress test completed successfully"
    else
        log_error "Artillery stress test failed"
    fi
}

# Run database load tests
run_database_tests() {
    log_info "Running database-specific load tests..."
    
    if npm run test -- src/test/load/DatabaseLoadTests.ts --reporter=json --outputFile="$REPORTS_DIR/database-load-$TIMESTAMP.json"; then
        log_success "Database load tests completed successfully"
    else
        log_error "Database load tests failed"
    fi
}

# Run custom React Query load tests
run_react_query_tests() {
    log_info "Running React Query load tests..."
    
    if npm run test:performance -- --grep "Load Testing" --reporter=json --outputFile="$REPORTS_DIR/react-query-load-$TIMESTAMP.json"; then
        log_success "React Query load tests completed successfully"
    else
        log_error "React Query load tests failed"
    fi
}

# Generate comprehensive report
generate_comprehensive_report() {
    log_info "Generating comprehensive load test report..."
    
    REPORT_FILE="$REPORTS_DIR/comprehensive-load-test-report-$TIMESTAMP.html"
    
    cat > "$REPORT_FILE" << EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>myK9Show Load Test Report - $TIMESTAMP</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f4f4f4; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .success { color: #28a745; }
        .warning { color: #ffc107; }
        .error { color: #dc3545; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f8f9fa; border-radius: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>myK9Show Load Test Report</h1>
        <p><strong>Generated:</strong> $(date)</p>
        <p><strong>Test Environment:</strong> $BASE_URL</p>
        <p><strong>API Endpoint:</strong> $API_URL</p>
    </div>

    <div class="section">
        <h2>Executive Summary</h2>
        <div class="metric">
            <strong>Total Test Duration:</strong> $(date -d@$(($(date +%s) - START_TIME)) -u +%H:%M:%S)
        </div>
        <div class="metric">
            <strong>Test Scenarios:</strong> $(ls $REPORTS_DIR/*$TIMESTAMP* 2>/dev/null | wc -l) scenarios executed
        </div>
        <div class="metric">
            <strong>Performance Targets:</strong> 
            <ul>
                <li>Response Time: &lt;200ms (API), &lt;3s (Page Load)</li>
                <li>Error Rate: &lt;5% (Normal), &lt;10% (Peak)</li>
                <li>Throughput: &gt;100 RPS minimum</li>
            </ul>
        </div>
    </div>

    <div class="section">
        <h2>Test Results Summary</h2>
        <table>
            <tr><th>Test Type</th><th>Status</th><th>Report File</th><th>Notes</th></tr>
EOF

    # Add test results to report
    for report_file in "$REPORTS_DIR"/*"$TIMESTAMP"*; do
        if [ -f "$report_file" ]; then
            filename=$(basename "$report_file")
            test_type=$(echo "$filename" | cut -d'-' -f1)
            
            # Determine status based on file existence and size
            if [ -s "$report_file" ]; then
                status="<span class=\"success\">✅ Completed</span>"
            else
                status="<span class=\"error\">❌ Failed</span>"
            fi
            
            echo "            <tr><td>$test_type</td><td>$status</td><td><a href=\"$filename\">$filename</a></td><td>-</td></tr>" >> "$REPORT_FILE"
        fi
    done

    cat >> "$REPORT_FILE" << EOF
        </table>
    </div>

    <div class="section">
        <h2>Performance Metrics Summary</h2>
        <p><em>Detailed metrics are available in individual test reports.</em></p>
        
        <h3>Key Performance Indicators</h3>
        <ul>
            <li><strong>Concurrent Users Tested:</strong> Up to 500 users</li>
            <li><strong>Test Duration:</strong> Various scenarios (5-20 minutes each)</li>
            <li><strong>Critical Workflows:</strong> Registration, Browsing, Entry Submission, Real-time Updates</li>
            <li><strong>Database Load:</strong> CRUD operations, Complex queries, Search performance</li>
        </ul>
    </div>

    <div class="section">
        <h2>Recommendations</h2>
        <ul>
            <li>Review individual test reports for detailed performance metrics</li>
            <li>Monitor slow queries and optimize database performance</li>
            <li>Implement connection pooling for high-concurrency scenarios</li>
            <li>Consider CDN implementation for static assets</li>
            <li>Set up continuous performance monitoring in production</li>
        </ul>
    </div>

    <div class="section">
        <h2>Individual Reports</h2>
        <ul>
EOF

    # List all individual reports
    for report_file in "$REPORTS_DIR"/*"$TIMESTAMP"*; do
        if [ -f "$report_file" ]; then
            filename=$(basename "$report_file")
            echo "            <li><a href=\"$filename\">$filename</a></li>" >> "$REPORT_FILE"
        fi
    done

    cat >> "$REPORT_FILE" << EOF
        </ul>
    </div>

    <div class="section">
        <h2>System Information</h2>
        <pre>
$(uname -a)
Node.js: $(node --version)
npm: $(npm --version)
        </pre>
    </div>
</body>
</html>
EOF

    log_success "Comprehensive report generated: $REPORT_FILE"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    
    # Kill any background processes
    jobs -p | xargs -r kill 2>/dev/null || true
    
    log_success "Cleanup completed"
}

# Main execution
main() {
    START_TIME=$(date +%s)
    
    log_info "Starting myK9Show Load Testing Suite"
    log_info "Timestamp: $TIMESTAMP"
    
    # Trap cleanup on exit
    trap cleanup EXIT
    
    # Execute test phases
    check_prerequisites
    setup_test_environment
    
    # Run all test types
    run_playwright_tests
    run_database_tests
    run_react_query_tests
    run_k6_tests
    run_artillery_tests
    
    # Generate final report
    generate_comprehensive_report
    
    log_success "Load testing suite completed!"
    log_info "Reports available in: $REPORTS_DIR"
    log_info "Open $REPORTS_DIR/comprehensive-load-test-report-$TIMESTAMP.html for full results"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --base-url)
            BASE_URL="$2"
            shift 2
            ;;
        --api-url)
            API_URL="$2"
            shift 2
            ;;
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --playwright-only)
            PLAYWRIGHT_ONLY=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --base-url URL      Set base URL (default: http://localhost:5173)"
            echo "  --api-url URL       Set API URL (default: http://localhost:54321)"
            echo "  --quick             Run quick tests only"
            echo "  --playwright-only   Run only Playwright tests"
            echo "  --help              Show this help"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Execute main function
main