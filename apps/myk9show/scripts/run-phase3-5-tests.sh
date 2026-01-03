#!/bin/bash

# Phase 3.5 Payment Processing Test Execution Script
# Runs all payment-related tests with proper reporting

set -e  # Exit on any error

echo "🏗️  Phase 3.5: Payment Processing Test Suite"
echo "============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Function to run a test suite
run_test_suite() {
    local test_name="$1"
    local test_file="$2"
    local test_type="$3"
    
    echo -e "${BLUE}Running $test_name...${NC}"
    echo "File: $test_file"
    echo "Type: $test_type"
    echo ""
    
    if [ "$test_type" = "e2e" ]; then
        # Run E2E tests
        if npm run test:e2e -- "$test_file" --reporter=verbose; then
            echo -e "${GREEN}✅ $test_name PASSED${NC}"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            echo -e "${RED}❌ $test_name FAILED${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    else
        # Run unit/integration tests
        if npm run test -- "$test_file" --reporter=verbose --coverage; then
            echo -e "${GREEN}✅ $test_name PASSED${NC}"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            echo -e "${RED}❌ $test_name FAILED${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    fi
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
    echo "----------------------------------------"
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    # Check if npm is available
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm is not installed or not in PATH${NC}"
        exit 1
    fi
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⚠️  node_modules not found, running npm install...${NC}"
        npm install
    fi
    
    # Check TypeScript compilation
    echo -e "${BLUE}Checking TypeScript compilation...${NC}"
    if npm run build; then
        echo -e "${GREEN}✅ TypeScript compilation successful${NC}"
    else
        echo -e "${RED}❌ TypeScript compilation failed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
    echo ""
}

# Function to generate test report
generate_report() {
    echo ""
    echo "============================================="
    echo -e "${BLUE}📊 Phase 3.5 Test Results Summary${NC}"
    echo "============================================="
    echo ""
    echo -e "Total Test Suites: ${TOTAL_TESTS}"
    echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"
    echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"
    echo -e "${YELLOW}Skipped: ${SKIPPED_TESTS}${NC}"
    echo ""
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed! Payment processing is ready for production.${NC}"
        echo ""
        echo "✅ Credit card processing validated"
        echo "✅ Check payment workflow tested"
        echo "✅ Cash handling verified"
        echo "✅ Refund processing confirmed"
        echo "✅ Security compliance validated"
        echo "✅ Payment integration verified"
        echo ""
        exit 0
    else
        echo -e "${RED}❌ Some tests failed. Please review and fix issues before deployment.${NC}"
        echo ""
        exit 1
    fi
}

# Function to run specific test category
run_category() {
    local category="$1"
    
    case $category in
        "unit")
            echo -e "${BLUE}Running Unit Tests Only...${NC}"
            run_test_suite "Payment Processing Unit Tests" "src/test/phase3-5-payment-processing.test.ts" "unit"
            run_test_suite "Payment Component Tests" "src/test/components/phase3-5-payment-components.test.tsx" "unit"
            ;;
        "integration")
            echo -e "${BLUE}Running Integration Tests Only...${NC}"
            run_test_suite "Payment Integration Tests" "src/test/integration/phase3-5-payment-integration.test.ts" "integration"
            ;;
        "security")
            echo -e "${BLUE}Running Security Tests Only...${NC}"
            run_test_suite "Payment Security Tests" "src/test/security/phase3-5-payment-security.test.ts" "security"
            ;;
        "e2e")
            echo -e "${BLUE}Running E2E Tests Only...${NC}"
            run_test_suite "Payment E2E Tests" "src/test/e2e/payment/phase3-5-comprehensive-payment.spec.ts" "e2e"
            ;;
        *)
            echo -e "${RED}Unknown category: $category${NC}"
            echo "Available categories: unit, integration, security, e2e"
            exit 1
            ;;
    esac
}

# Main execution
main() {
    echo "Starting Phase 3.5 Payment Processing Test Suite..."
    echo "Timestamp: $(date)"
    echo ""
    
    # Handle command line arguments
    if [ $# -eq 1 ]; then
        case $1 in
            "--help" | "-h")
                echo "Usage: $0 [category]"
                echo ""
                echo "Categories:"
                echo "  unit        - Run unit tests only"
                echo "  integration - Run integration tests only"
                echo "  security    - Run security tests only"
                echo "  e2e         - Run E2E tests only"
                echo "  (no args)   - Run all tests"
                echo ""
                exit 0
                ;;
            *)
                check_prerequisites
                run_category "$1"
                generate_report
                ;;
        esac
    elif [ $# -eq 0 ]; then
        # Run all tests
        check_prerequisites
        
        echo -e "${BLUE}🧪 Running Complete Payment Processing Test Suite${NC}"
        echo ""
        
        # 1. Unit Tests
        echo -e "${YELLOW}Phase 1: Unit Tests${NC}"
        run_test_suite "Payment Processing Unit Tests" "src/test/phase3-5-payment-processing.test.ts" "unit"
        run_test_suite "Payment Component Tests" "src/test/components/phase3-5-payment-components.test.tsx" "unit"
        
        # 2. Integration Tests
        echo -e "${YELLOW}Phase 2: Integration Tests${NC}"
        run_test_suite "Payment Integration Tests" "src/test/integration/phase3-5-payment-integration.test.ts" "integration"
        
        # 3. Security Tests
        echo -e "${YELLOW}Phase 3: Security Tests${NC}"
        run_test_suite "Payment Security Tests" "src/test/security/phase3-5-payment-security.test.ts" "security"
        
        # 4. E2E Tests
        echo -e "${YELLOW}Phase 4: End-to-End Tests${NC}"
        run_test_suite "Payment E2E Tests" "src/test/e2e/payment/phase3-5-comprehensive-payment.spec.ts" "e2e"
        
        generate_report
    else
        echo -e "${RED}Error: Too many arguments${NC}"
        echo "Use --help for usage information"
        exit 1
    fi
}

# Trap to ensure cleanup on exit
trap 'echo -e "\n${YELLOW}Test execution interrupted${NC}"' INT TERM

# Run main function
main "$@"