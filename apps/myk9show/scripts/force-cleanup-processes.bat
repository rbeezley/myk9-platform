@echo off
echo 🚨 FORCE CLEANUP - Killing all browser and test processes...
echo ⚠️  This will forcefully terminate all browser instances!
echo.

REM Kill headless_shell processes (main culprit)
echo Killing headless_shell processes...
taskkill /f /im headless_shell.exe /t 2>nul
if %errorlevel% == 0 (
    echo ✅ Killed headless_shell processes
) else (
    echo ℹ️  No headless_shell processes found
)

REM Kill Chrome processes
echo Killing Chrome processes...
taskkill /f /im chrome.exe /t 2>nul
if %errorlevel% == 0 (
    echo ✅ Killed Chrome processes
) else (
    echo ℹ️  No Chrome processes found
)

REM Kill Edge processes
echo Killing Edge processes...
taskkill /f /im msedge.exe /t 2>nul
if %errorlevel% == 0 (
    echo ✅ Killed Edge processes
) else (
    echo ℹ️  No Edge processes found
)

REM Kill Firefox processes
echo Killing Firefox processes...
taskkill /f /im firefox.exe /t 2>nul
if %errorlevel% == 0 (
    echo ✅ Killed Firefox processes
) else (
    echo ℹ️  No Firefox processes found
)

REM Kill Playwright processes
echo Killing Playwright processes...
taskkill /f /im "playwright*" /t 2>nul
if %errorlevel% == 0 (
    echo ✅ Killed Playwright processes
) else (
    echo ℹ️  No Playwright processes found
)

REM Kill Node processes related to testing (be careful!)
echo Checking for test-related Node processes...
for /f "tokens=2 delims=," %%a in ('tasklist /fi "imagename eq node.exe" /fo csv ^| find /v "ImageName"') do (
    set "pid=%%~a"
    for /f "tokens=*" %%b in ('wmic process where "ProcessId=!pid!" get CommandLine /value ^| find "playwright"') do (
        echo Found test-related Node process: !pid!
        taskkill /f /pid !pid! 2>nul
    )
)

REM Clean up crash handlers and helper processes
echo Cleaning up helper processes...
taskkill /f /im "chrome_crashpad_handler.exe" /t 2>nul
taskkill /f /im "msedgewebview2.exe" /t 2>nul
taskkill /f /im "crashpad_handler.exe" /t 2>nul

REM Check and clean up git processes if too many
echo Checking git processes...
for /f "tokens=1" %%i in ('tasklist /fi "imagename eq git.exe" /fo csv ^| find /c "git.exe"') do set git_count=%%i
if %git_count% GTR 10 (
    echo Found %git_count% git processes, cleaning up excessive ones...
    taskkill /f /im git.exe /t 2>nul
    echo ✅ Cleaned up git processes
) else (
    echo ℹ️  Git process count is normal ^(%git_count%^)
)

REM Clean up bash processes (from Git Bash, WSL, etc.)
echo Checking bash processes...
for /f "tokens=1" %%i in ('tasklist /fi "imagename eq bash.exe" /fo csv 2^>nul ^| find /c "bash.exe"') do set bash_count=%%i
if %bash_count% GTR 5 (
    echo Found %bash_count% bash processes, cleaning up excessive ones...
    taskkill /f /im bash.exe /t 2>nul
    echo ✅ Cleaned up bash processes
) else (
    echo ℹ️  Bash process count is normal ^(%bash_count%^)
)

REM Clean up other development processes that can accumulate
echo Cleaning up other development processes...
taskkill /f /im "conhost.exe" /fi "WINDOWTITLE eq *git*" /t 2>nul || echo No git console hosts found
taskkill /f /im "mintty.exe" /t 2>nul || echo No Git Bash terminals found
taskkill /f /im "sh.exe" /t 2>nul || echo No shell processes found

REM Show current process status
echo.
echo 📊 Current process status:
echo Browser processes:
tasklist /fi "imagename eq headless_shell.exe" /fo table 2>nul | find "headless_shell" && echo ⚠️  headless_shell processes still running || echo ✅ No headless_shell processes
tasklist /fi "imagename eq chrome.exe" /fo table 2>nul | find "chrome" && echo ⚠️  Chrome processes still running || echo ✅ No Chrome processes
tasklist /fi "imagename eq msedge.exe" /fo table 2>nul | find "msedge" && echo ⚠️  Edge processes still running || echo ✅ No Edge processes

echo Development processes:
for /f "tokens=1" %%i in ('tasklist /fi "imagename eq git.exe" /fo csv 2^>nul ^| find /c "git.exe"') do echo ℹ️  Git processes: %%i
for /f "tokens=1" %%i in ('tasklist /fi "imagename eq bash.exe" /fo csv 2^>nul ^| find /c "bash.exe"') do echo ℹ️  Bash processes: %%i
for /f "tokens=1" %%i in ('tasklist /fi "imagename eq node.exe" /fo csv 2^>nul ^| find /c "node.exe"') do echo ℹ️  Node processes: %%i

echo.
echo ✅ Force cleanup completed!
echo 💡 You can now run tests again with a clean process slate.
echo.
pause