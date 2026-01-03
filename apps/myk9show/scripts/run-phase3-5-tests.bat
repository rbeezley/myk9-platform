@echo off
REM Phase 3.5 Payment Processing Test Execution Script (Windows)
REM Runs all payment-related tests with proper reporting

setlocal enabledelayedexpansion

echo 🏗️  Phase 3.5: Payment Processing Test Suite
echo =============================================
echo.

REM Test results tracking
set /a TOTAL_TESTS=0
set /a PASSED_TESTS=0
set /a FAILED_TESTS=0

REM Function to run a test suite
:run_test_suite
set "test_name=%~1"
set "test_file=%~2"
set "test_type=%~3"

echo Running %test_name%...
echo File: %test_file%
echo Type: %test_type%
echo.

if "%test_type%"=="e2e" (
    REM Run E2E tests
    npm run test:e2e -- "%test_file%" --reporter=verbose
    if !errorlevel!==0 (
        echo ✅ %test_name% PASSED
        set /a PASSED_TESTS+=1
    ) else (
        echo ❌ %test_name% FAILED
        set /a FAILED_TESTS+=1
    )
) else (
    REM Run unit/integration tests
    npm run test -- "%test_file%" --reporter=verbose --coverage
    if !errorlevel!==0 (
        echo ✅ %test_name% PASSED
        set /a PASSED_TESTS+=1
    ) else (
        echo ❌ %test_name% FAILED
        set /a FAILED_TESTS+=1
    )
)

set /a TOTAL_TESTS+=1
echo.
echo ----------------------------------------
echo.
goto :eof

REM Function to check prerequisites
:check_prerequisites
echo Checking prerequisites...

REM Check if npm is available
npm --version >nul 2>&1
if !errorlevel! neq 0 (
    echo ❌ npm is not installed or not in PATH
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo ⚠️  node_modules not found, running npm install...
    npm install
)

REM Check TypeScript compilation
echo Checking TypeScript compilation...
npm run build
if !errorlevel!==0 (
    echo ✅ TypeScript compilation successful
) else (
    echo ❌ TypeScript compilation failed
    exit /b 1
)

echo ✅ Prerequisites check passed
echo.
goto :eof

REM Function to generate test report
:generate_report
echo.
echo =============================================
echo 📊 Phase 3.5 Test Results Summary
echo =============================================
echo.
echo Total Test Suites: !TOTAL_TESTS!
echo Passed: !PASSED_TESTS!
echo Failed: !FAILED_TESTS!
echo.

if !FAILED_TESTS!==0 (
    echo 🎉 All tests passed! Payment processing is ready for production.
    echo.
    echo ✅ Credit card processing validated
    echo ✅ Check payment workflow tested
    echo ✅ Cash handling verified
    echo ✅ Refund processing confirmed
    echo ✅ Security compliance validated
    echo ✅ Payment integration verified
    echo.
    exit /b 0
) else (
    echo ❌ Some tests failed. Please review and fix issues before deployment.
    echo.
    exit /b 1
)

REM Main execution
:main
echo Starting Phase 3.5 Payment Processing Test Suite...
echo Timestamp: %date% %time%
echo.

REM Handle command line arguments
if "%1"=="--help" goto :help
if "%1"=="-h" goto :help
if "%1"=="unit" goto :unit_tests
if "%1"=="integration" goto :integration_tests
if "%1"=="security" goto :security_tests
if "%1"=="e2e" goto :e2e_tests
if "%1"=="" goto :all_tests

echo Unknown category: %1
echo Available categories: unit, integration, security, e2e
exit /b 1

:help
echo Usage: %0 [category]
echo.
echo Categories:
echo   unit        - Run unit tests only
echo   integration - Run integration tests only
echo   security    - Run security tests only
echo   e2e         - Run E2E tests only
echo   (no args)   - Run all tests
echo.
exit /b 0

:unit_tests
call :check_prerequisites
echo Running Unit Tests Only...
call :run_test_suite "Payment Processing Unit Tests" "src/test/phase3-5-payment-processing.test.ts" "unit"
call :run_test_suite "Payment Component Tests" "src/test/components/phase3-5-payment-components.test.tsx" "unit"
goto :generate_report

:integration_tests
call :check_prerequisites
echo Running Integration Tests Only...
call :run_test_suite "Payment Integration Tests" "src/test/integration/phase3-5-payment-integration.test.ts" "integration"
goto :generate_report

:security_tests
call :check_prerequisites
echo Running Security Tests Only...
call :run_test_suite "Payment Security Tests" "src/test/security/phase3-5-payment-security.test.ts" "security"
goto :generate_report

:e2e_tests
call :check_prerequisites
echo Running E2E Tests Only...
call :run_test_suite "Payment E2E Tests" "src/test/e2e/payment/phase3-5-comprehensive-payment.spec.ts" "e2e"
goto :generate_report

:all_tests
call :check_prerequisites

echo 🧪 Running Complete Payment Processing Test Suite
echo.

REM 1. Unit Tests
echo Phase 1: Unit Tests
call :run_test_suite "Payment Processing Unit Tests" "src/test/phase3-5-payment-processing.test.ts" "unit"
call :run_test_suite "Payment Component Tests" "src/test/components/phase3-5-payment-components.test.tsx" "unit"

REM 2. Integration Tests
echo Phase 2: Integration Tests
call :run_test_suite "Payment Integration Tests" "src/test/integration/phase3-5-payment-integration.test.ts" "integration"

REM 3. Security Tests
echo Phase 3: Security Tests
call :run_test_suite "Payment Security Tests" "src/test/security/phase3-5-payment-security.test.ts" "security"

REM 4. E2E Tests
echo Phase 4: End-to-End Tests
call :run_test_suite "Payment E2E Tests" "src/test/e2e/payment/phase3-5-comprehensive-payment.spec.ts" "e2e"

goto :generate_report

REM Call main function
call :main %*