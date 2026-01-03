@echo off
REM Create test users for myK9Show application
REM This script creates users via Supabase Admin API

setlocal enabledelayedexpansion

echo 🚀 Creating test users for myK9Show...
echo.

REM Check if required environment variables are set
if "%SUPABASE_URL%"=="" (
    echo Error: Please set SUPABASE_URL environment variable
    echo Example: set SUPABASE_URL=https://your-project.supabase.co
    exit /b 1
)

if "%SUPABASE_SERVICE_ROLE_KEY%"=="" (
    echo Error: Please set SUPABASE_SERVICE_ROLE_KEY environment variable
    echo Example: set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
    exit /b 1
)

echo Supabase URL: %SUPABASE_URL%
echo.

REM Check if curl is available
curl --version >nul 2>&1
if errorlevel 1 (
    echo Error: curl is not available. Please install curl or use WSL/Git Bash
    exit /b 1
)

REM Create Site Admin
echo Creating user: testadmin@example.com (Test Admin) with role: site_admin
curl -s -X POST "%SUPABASE_URL%/auth/v1/admin/users" ^
    -H "Authorization: Bearer %SUPABASE_SERVICE_ROLE_KEY%" ^
    -H "Content-Type: application/json" ^
    -H "apikey: %SUPABASE_SERVICE_ROLE_KEY%" ^
    -d "{\"email\": \"testadmin@example.com\", \"password\": \"TestAdmin123!\", \"email_confirm\": true, \"user_metadata\": {\"first_name\": \"Test\", \"last_name\": \"Admin\", \"role\": \"site_admin\"}}"
echo ✅ Site Admin created
echo.

REM Create Secretary
echo Creating user: testsecretary@example.com (Test Secretary) with role: secretary
curl -s -X POST "%SUPABASE_URL%/auth/v1/admin/users" ^
    -H "Authorization: Bearer %SUPABASE_SERVICE_ROLE_KEY%" ^
    -H "Content-Type: application/json" ^
    -H "apikey: %SUPABASE_SERVICE_ROLE_KEY%" ^
    -d "{\"email\": \"testsecretary@example.com\", \"password\": \"TestSecretary123!\", \"email_confirm\": true, \"user_metadata\": {\"first_name\": \"Test\", \"last_name\": \"Secretary\", \"role\": \"secretary\"}}"
echo ✅ Secretary created
echo.

REM Create Judge
echo Creating user: testjudge@example.com (Test Judge) with role: judge
curl -s -X POST "%SUPABASE_URL%/auth/v1/admin/users" ^
    -H "Authorization: Bearer %SUPABASE_SERVICE_ROLE_KEY%" ^
    -H "Content-Type: application/json" ^
    -H "apikey: %SUPABASE_SERVICE_ROLE_KEY%" ^
    -d "{\"email\": \"testjudge@example.com\", \"password\": \"TestJudge123!\", \"email_confirm\": true, \"user_metadata\": {\"first_name\": \"Test\", \"last_name\": \"Judge\", \"role\": \"judge\"}}"
echo ✅ Judge created
echo.

REM Create Club Admin
echo Creating user: testclubadmin@example.com (Test ClubAdmin) with role: club_admin
curl -s -X POST "%SUPABASE_URL%/auth/v1/admin/users" ^
    -H "Authorization: Bearer %SUPABASE_SERVICE_ROLE_KEY%" ^
    -H "Content-Type: application/json" ^
    -H "apikey: %SUPABASE_SERVICE_ROLE_KEY%" ^
    -d "{\"email\": \"testclubadmin@example.com\", \"password\": \"TestClubAdmin123!\", \"email_confirm\": true, \"user_metadata\": {\"first_name\": \"Test\", \"last_name\": \"ClubAdmin\", \"role\": \"club_admin\"}}"
echo ✅ Club Admin created
echo.

REM Create Exhibitor
echo Creating user: testexhibitor@example.com (Test Exhibitor) with role: exhibitor
curl -s -X POST "%SUPABASE_URL%/auth/v1/admin/users" ^
    -H "Authorization: Bearer %SUPABASE_SERVICE_ROLE_KEY%" ^
    -H "Content-Type: application/json" ^
    -H "apikey: %SUPABASE_SERVICE_ROLE_KEY%" ^
    -d "{\"email\": \"testexhibitor@example.com\", \"password\": \"TestExhibitor123!\", \"email_confirm\": true, \"user_metadata\": {\"first_name\": \"Test\", \"last_name\": \"Exhibitor\", \"role\": \"exhibitor\"}}"
echo ✅ Exhibitor created
echo.

echo 🎯 Auth users created. Now you need to run the SQL script to create profiles and roles:
echo.
echo    supabase db psql -f create_test_users.sql
echo.
echo    OR manually execute the create_test_users.sql file in your database
echo.
echo 🎉 Test user setup (auth portion) complete!
echo.
echo 📋 Test Users Created:
echo ├── Site Admin:     testadmin@example.com     (TestAdmin123!)
echo ├── Secretary:      testsecretary@example.com (TestSecretary123!)
echo ├── Judge:          testjudge@example.com     (TestJudge123!)
echo ├── Club Admin:     testclubadmin@example.com (TestClubAdmin123!)
echo └── Exhibitor:      testexhibitor@example.com (TestExhibitor123!)
echo.

pause