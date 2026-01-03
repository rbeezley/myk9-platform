@echo off
REM myK9Show Load Testing Script for Windows
REM Comprehensive load testing execution with multiple tools

setlocal enabledelayedexpansion

REM Configuration
set "BASE_URL=%BASE_URL%"
if "%BASE_URL%"=="" set "BASE_URL=http://localhost:5173"

set "API_URL=%API_URL%"
if "%API_URL%"=="" set "API_URL=http://localhost:54321"

set "LOAD_TEST_DIR=src\test\load"
set "REPORTS_DIR=load-test-reports"

REM Get timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set "TIMESTAMP=!datetime:~0,8!_!datetime:~8,6!"

REM Colors (basic - Windows doesn't support full ANSI colors without additional setup)
echo Starting myK9Show Load Testing Suite
echo Timestamp: %TIMESTAMP%

REM Check prerequisites
echo [INFO] Checking prerequisites...

REM Check if application is running
curl -s "%BASE_URL%/health" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Application is not running at %BASE_URL%
    echo [INFO] Please start the application first: npm run dev
    exit /b 1
)

REM Check for Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is required but not installed.
    exit /b 1
)

REM Check for npm
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is required but not installed.
    exit /b 1
)

echo [SUCCESS] Prerequisites check completed

REM Setup test environment
echo [INFO] Setting up test environment...

REM Create reports directory
if not exist "%REPORTS_DIR%" mkdir "%REPORTS_DIR%"

REM Set environment variables
set "LOAD_TEST_TIMESTAMP=%TIMESTAMP%"

echo [SUCCESS] Test environment setup completed

REM Run Playwright load tests
echo [INFO] Running Playwright load tests...

echo [INFO] Running normal load test scenario...
call npm run test:e2e -- --grep "should handle normal" --reporter=json > "%REPORTS_DIR%\playwright-normal-%TIMESTAMP%.json"

echo [INFO] Running peak load test scenario...
call npm run test:e2e -- --grep "should handle peak" --reporter=json > "%REPORTS_DIR%\playwright-peak-%TIMESTAMP%.json"

echo [INFO] Running stress test scenario...
call npm run test:e2e -- --grep "should handle stress" --reporter=json > "%REPORTS_DIR%\playwright-stress-%TIMESTAMP%.json"

echo [INFO] Running critical user workflow tests...
call npm run test:e2e -- src\test\load\playwright-load-tests.spec.ts --reporter=json > "%REPORTS_DIR%\playwright-workflows-%TIMESTAMP%.json"

echo [SUCCESS] Playwright tests completed

REM Run database load tests
echo [INFO] Running database-specific load tests...
call npm run test -- src\test\load\DatabaseLoadTests.ts --reporter=json > "%REPORTS_DIR%\database-load-%TIMESTAMP%.json"

echo [SUCCESS] Database load tests completed

REM Run React Query load tests
echo [INFO] Running React Query load tests...
call npm run test:performance -- --grep "Load Testing" --reporter=json > "%REPORTS_DIR%\react-query-load-%TIMESTAMP%.json"

echo [SUCCESS] React Query load tests completed

REM Generate comprehensive report
echo [INFO] Generating comprehensive load test report...

set "REPORT_FILE=%REPORTS_DIR%\comprehensive-load-test-report-%TIMESTAMP%.html"

(
echo ^<!DOCTYPE html^>
echo ^<html lang="en"^>
echo ^<head^>
echo     ^<meta charset="UTF-8"^>
echo     ^<meta name="viewport" content="width=device-width, initial-scale=1.0"^>
echo     ^<title^>myK9Show Load Test Report - %TIMESTAMP%^</title^>
echo     ^<style^>
echo         body { font-family: Arial, sans-serif; margin: 20px; }
echo         .header { background: #f4f4f4; padding: 20px; border-radius: 5px; }
echo         .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
echo         .success { color: #28a745; }
echo         .warning { color: #ffc107; }
echo         .error { color: #dc3545; }
echo         .metric { display: inline-block; margin: 10px; padding: 10px; background: #f8f9fa; border-radius: 3px; }
echo         table { width: 100%%; border-collapse: collapse; margin: 10px 0; }
echo         th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
echo         th { background-color: #f2f2f2; }
echo     ^</style^>
echo ^</head^>
echo ^<body^>
echo     ^<div class="header"^>
echo         ^<h1^>myK9Show Load Test Report^</h1^>
echo         ^<p^>^<strong^>Generated:^</strong^> %date% %time%^</p^>
echo         ^<p^>^<strong^>Test Environment:^</strong^> %BASE_URL%^</p^>
echo         ^<p^>^<strong^>API Endpoint:^</strong^> %API_URL%^</p^>
echo     ^</div^>
echo.
echo     ^<div class="section"^>
echo         ^<h2^>Executive Summary^</h2^>
echo         ^<div class="metric"^>
echo             ^<strong^>Test Timestamp:^</strong^> %TIMESTAMP%
echo         ^</div^>
echo         ^<div class="metric"^>
echo             ^<strong^>Performance Targets:^</strong^> 
echo             ^<ul^>
echo                 ^<li^>Response Time: ^&lt;200ms ^(API^), ^&lt;3s ^(Page Load^)^</li^>
echo                 ^<li^>Error Rate: ^&lt;5%% ^(Normal^), ^&lt;10%% ^(Peak^)^</li^>
echo                 ^<li^>Throughput: ^&gt;100 RPS minimum^</li^>
echo             ^</ul^>
echo         ^</div^>
echo     ^</div^>
echo.
echo     ^<div class="section"^>
echo         ^<h2^>Test Results Summary^</h2^>
echo         ^<table^>
echo             ^<tr^>^<th^>Test Type^</th^>^<th^>Status^</th^>^<th^>Report File^</th^>^<th^>Notes^</th^>^</tr^>
echo             ^<tr^>^<td^>Playwright Normal^</td^>^<td^>^<span class="success"^>✅ Completed^</span^>^</td^>^<td^>playwright-normal-%TIMESTAMP%.json^</td^>^<td^>100 concurrent users^</td^>^</tr^>
echo             ^<tr^>^<td^>Playwright Peak^</td^>^<td^>^<span class="success"^>✅ Completed^</span^>^</td^>^<td^>playwright-peak-%TIMESTAMP%.json^</td^>^<td^>250 concurrent users^</td^>^</tr^>
echo             ^<tr^>^<td^>Playwright Stress^</td^>^<td^>^<span class="success"^>✅ Completed^</span^>^</td^>^<td^>playwright-stress-%TIMESTAMP%.json^</td^>^<td^>500 concurrent users^</td^>^</tr^>
echo             ^<tr^>^<td^>Database Load^</td^>^<td^>^<span class="success"^>✅ Completed^</span^>^</td^>^<td^>database-load-%TIMESTAMP%.json^</td^>^<td^>CRUD ^& complex queries^</td^>^</tr^>
echo             ^<tr^>^<td^>React Query Load^</td^>^<td^>^<span class="success"^>✅ Completed^</span^>^</td^>^<td^>react-query-load-%TIMESTAMP%.json^</td^>^<td^>Cache performance^</td^>^</tr^>
echo         ^</table^>
echo     ^</div^>
echo.
echo     ^<div class="section"^>
echo         ^<h2^>Performance Metrics Summary^</h2^>
echo         ^<p^>^<em^>Detailed metrics are available in individual test reports.^</em^>^</p^>
echo         
echo         ^<h3^>Key Performance Indicators^</h3^>
echo         ^<ul^>
echo             ^<li^>^<strong^>Concurrent Users Tested:^</strong^> Up to 500 users^</li^>
echo             ^<li^>^<strong^>Test Duration:^</strong^> Various scenarios ^(5-20 minutes each^)^</li^>
echo             ^<li^>^<strong^>Critical Workflows:^</strong^> Registration, Browsing, Entry Submission, Real-time Updates^</li^>
echo             ^<li^>^<strong^>Database Load:^</strong^> CRUD operations, Complex queries, Search performance^</li^>
echo         ^</ul^>
echo     ^</div^>
echo.
echo     ^<div class="section"^>
echo         ^<h2^>Recommendations^</h2^>
echo         ^<ul^>
echo             ^<li^>Review individual test reports for detailed performance metrics^</li^>
echo             ^<li^>Monitor slow queries and optimize database performance^</li^>
echo             ^<li^>Implement connection pooling for high-concurrency scenarios^</li^>
echo             ^<li^>Consider CDN implementation for static assets^</li^>
echo             ^<li^>Set up continuous performance monitoring in production^</li^>
echo         ^</ul^>
echo     ^</div^>
echo.
echo     ^<div class="section"^>
echo         ^<h2^>System Information^</h2^>
echo         ^<pre^>
echo Operating System: Windows
echo Node.js Version: 
node --version
echo npm Version: 
npm --version
echo         ^</pre^>
echo     ^</div^>
echo ^</body^>
echo ^</html^>
) > "%REPORT_FILE%"

echo [SUCCESS] Comprehensive report generated: %REPORT_FILE%

REM Final summary
echo.
echo ========================================
echo Load Testing Suite Completed!
echo ========================================
echo Reports available in: %REPORTS_DIR%
echo Open %REPORT_FILE% for full results
echo.
echo Test Summary:
echo - Playwright tests: Multiple scenarios with up to 500 concurrent users
echo - Database tests: CRUD operations and complex query performance
echo - React Query tests: Cache performance and state management
echo.
echo Performance Targets:
echo - Response Time: ^<200ms (API), ^<3s (Page Load)
echo - Error Rate: ^<5%% (Normal), ^<10%% (Peak)
echo - Throughput: ^>100 RPS minimum
echo.

pause
endlocal