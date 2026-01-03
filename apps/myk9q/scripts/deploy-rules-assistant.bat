@echo off
REM ============================================================================
REM Rules Assistant Edge Function Deployment Script
REM ============================================================================
REM This script deploys the search-rules Edge Function to Supabase
REM Prerequisites:
REM   1. Supabase CLI installed and logged in
REM   2. ANTHROPIC_API_KEY set in .env.local
REM ============================================================================

echo.
echo ========================================================================
echo  Rules Assistant Edge Function Deployment
echo ========================================================================
echo.

REM Check if .env.local exists
if not exist ".env.local" (
    echo [ERROR] .env.local file not found
    echo Please create .env.local and add your ANTHROPIC_API_KEY
    exit /b 1
)

REM Extract ANTHROPIC_API_KEY from .env.local
for /f "tokens=1,2 delims==" %%a in ('findstr /r "^ANTHROPIC_API_KEY=" .env.local') do set ANTHROPIC_KEY=%%b

REM Check if key is set and valid
if "%ANTHROPIC_KEY%"=="" (
    echo [ERROR] ANTHROPIC_API_KEY not found in .env.local
    echo.
    echo Please add your Anthropic API key to .env.local:
    echo   1. Go to https://console.anthropic.com/settings/keys
    echo   2. Create a new API key
    echo   3. Add to .env.local: ANTHROPIC_API_KEY=sk-ant-your-key-here
    echo.
    exit /b 1
)

if "%ANTHROPIC_KEY%"=="your_anthropic_api_key_here" (
    echo [ERROR] ANTHROPIC_API_KEY is still set to placeholder value
    echo.
    echo Please update your Anthropic API key in .env.local:
    echo   1. Go to https://console.anthropic.com/settings/keys
    echo   2. Create a new API key
    echo   3. Update .env.local: ANTHROPIC_API_KEY=sk-ant-your-key-here
    echo.
    exit /b 1
)

echo [1/3] Setting ANTHROPIC_API_KEY secret in Supabase...
echo.
supabase secrets set ANTHROPIC_API_KEY=%ANTHROPIC_KEY%
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to set Supabase secret
    echo.
    echo Troubleshooting:
    echo   - Make sure you're logged in: supabase login
    echo   - Check project is linked: supabase link --project-ref yyzgjyiqgmjzyhzkqdfx
    echo.
    exit /b 1
)

echo.
echo [2/3] Deploying search-rules Edge Function...
echo.
supabase functions deploy search-rules
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to deploy Edge Function
    echo See error above for details
    echo.
    exit /b 1
)

echo.
echo ========================================================================
echo  Deployment Complete!
echo ========================================================================
echo.
echo [3/3] Testing the deployed function...
echo.
echo Run this command to test:
echo   deno run --allow-net --allow-env supabase/functions/search-rules/test.ts
echo.
echo Or test with curl:
echo   curl -X POST https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/search-rules \
echo     -H "Authorization: Bearer YOUR_ANON_KEY" \
echo     -H "Content-Type: application/json" \
echo     -d "{\"query\": \"what is the area size for exterior advanced?\"}"
echo.
echo Next steps:
echo   1. Run the test script above
echo   2. Check function logs: supabase functions logs search-rules
echo   3. Proceed to Phase 4 (Frontend implementation)
echo.
echo ========================================================================
